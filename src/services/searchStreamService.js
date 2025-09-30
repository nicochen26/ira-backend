const dbClient = require('../db/client');
const { IRAService, IRAServiceError } = require('./iraService');
const { getSSeManager } = require('../sse/sseManager');

class SearchStreamService {
  constructor() {
    this.iraService = new IRAService();
    this.sseManager = getSSeManager();
    this.activeStreams = new Map(); // searchId -> streamInfo
  }

  /**
   * Start a streaming search process
   * @param {string} searchId - Search ID from database
   * @param {string} userId - User ID
   * @param {string} authToken - User's JWT token
   * @param {string} query - Search query
   * @param {Object} metadata - Search metadata
   * @returns {Promise<Object>} Stream initialization result
   */
  async startStreamSearch(searchId, userId, authToken, query, metadata = {}) {
    const prisma = dbClient.getClient();

    try {
      // Update search status to PROCESSING
      await prisma.searchQuery.update({
        where: { id: searchId },
        data: {
          metadata: {
            ...metadata,
            status: 'PROCESSING',
            startedAt: new Date().toISOString()
          }
        }
      });

      // Broadcast status update to connected clients
      this.sseManager.broadcastToSearch(searchId, 'status', {
        status: 'PROCESSING',
        message: 'Creating IRA thread...',
        timestamp: new Date().toISOString()
      });

      // Step 1: Create IRA thread
      const threadResponse = await this.iraService.createThread(authToken, {
        user_id: userId,
        search_id: searchId,
        query: query
      });

      console.log(`IRA thread created for search ${searchId}:`, threadResponse.thread_id);

      // Broadcast thread creation
      this.sseManager.broadcastToSearch(searchId, 'status', {
        status: 'PROCESSING',
        message: 'Thread created, starting analysis...',
        threadId: threadResponse.thread_id,
        timestamp: new Date().toISOString()
      });

      // Step 2: Start streaming
      const streamResponse = await this.iraService.startStream(
        threadResponse.thread_id,
        authToken,
        query,
        {
          configurable: {
            user_id: userId
          }
        }
      );

      // Store stream info
      this.activeStreams.set(searchId, {
        threadId: threadResponse.thread_id,
        userId,
        query,
        startedAt: Date.now(),
        sequence: 0
      });

      // Process the stream
      this.processIRAStream(searchId, streamResponse);

      return {
        success: true,
        searchId,
        threadId: threadResponse.thread_id,
        message: 'Stream started successfully'
      };

    } catch (error) {
      console.error(`Failed to start stream for search ${searchId}:`, error);

      // Update search status to FAILED
      await prisma.searchQuery.update({
        where: { id: searchId },
        data: {
          metadata: {
            ...metadata,
            status: 'FAILED',
            error: error.message,
            failedAt: new Date().toISOString()
          }
        }
      });

      // Broadcast error to connected clients
      this.sseManager.broadcastToSearch(searchId, 'error', {
        message: error.message,
        code: error instanceof IRAServiceError ? 'IRA_SERVICE_ERROR' : 'STREAM_ERROR',
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Process IRA streaming response
   * @param {string} searchId - Search ID
   * @param {Response} streamResponse - IRA stream response
   */
  async processIRAStream(searchId, streamResponse) {
    const prisma = dbClient.getClient();
    const streamInfo = this.activeStreams.get(searchId);

    if (!streamInfo) {
      console.error(`No stream info found for search ${searchId}`);
      return;
    }

    try {
      let buffer = '';

      // Process stream data
      streamResponse.body.on('data', async (chunk) => {
        buffer += chunk.toString();

        // Process complete SSE events
        const events = buffer.split('\n\n');
        buffer = events.pop(); // Keep incomplete event in buffer

        for (const eventData of events) {
          if (eventData.trim()) {
            await this.processStreamEvent(searchId, eventData.trim(), streamInfo);
          }
        }
      });

      streamResponse.body.on('end', async () => {
        console.log(`IRA stream ended for search ${searchId}`);

        // Process any remaining buffer data
        if (buffer.trim()) {
          await this.processStreamEvent(searchId, buffer.trim(), streamInfo);
        }

        await this.completeSearch(searchId, streamInfo);
      });

      streamResponse.body.on('error', async (error) => {
        console.error(`IRA stream error for search ${searchId}:`, error);
        await this.failSearch(searchId, error.message, streamInfo);
      });

    } catch (error) {
      console.error(`Error processing IRA stream for search ${searchId}:`, error);
      await this.failSearch(searchId, error.message, streamInfo);
    }
  }

  /**
   * Process individual stream event
   * @param {string} searchId - Search ID
   * @param {string} eventData - Raw SSE event data
   * @param {Object} streamInfo - Stream information
   */
  async processStreamEvent(searchId, eventData, streamInfo) {
    const prisma = dbClient.getClient();

    try {
      // Parse SSE event
      const parsedEvent = this.iraService.parseSSEData(eventData);
      if (!parsedEvent) return;

      // Process event into meaningful data
      const resultData = this.iraService.processStreamEvent(parsedEvent);
      if (!resultData) return;

      // Increment sequence
      streamInfo.sequence++;
      resultData.sequence = streamInfo.sequence;

      console.log(`Processing stream event for search ${searchId}:`, resultData.type,
        'Content preview:', typeof resultData.content === 'string' ? resultData.content.substring(0, 100) : JSON.stringify(resultData.content).substring(0, 100));

      // Store in database
      if (resultData.type !== 'METADATA') {
        await prisma.searchResult.create({
          data: {
            queryId: searchId,
            userId: streamInfo.userId,
            threadId: streamInfo.threadId,
            title: this.generateResultTitle(resultData.type, resultData.content),
            content: this.formatResultContent(resultData.content),
            resultType: resultData.type,
            sequence: resultData.sequence,
            metadata: resultData.metadata || {},
            sourceService: 'ira'
          }
        });
      }

      // Broadcast to SSE clients
      this.sseManager.broadcastToSearch(searchId, 'result', {
        type: resultData.type,
        content: resultData.content,
        sequence: resultData.sequence,
        timestamp: new Date().toISOString()
      }, resultData.sequence.toString());

    } catch (error) {
      console.error(`Error processing stream event for search ${searchId}:`, error);
    }
  }

  /**
   * Complete the search process
   * @param {string} searchId - Search ID
   * @param {Object} streamInfo - Stream information
   */
  async completeSearch(searchId, streamInfo) {
    const prisma = dbClient.getClient();

    try {
      // Update search status
      const searchQuery = await prisma.searchQuery.update({
        where: { id: searchId },
        data: {
          metadata: {
            status: 'COMPLETED',
            completedAt: new Date().toISOString(),
            totalResults: streamInfo.sequence
          }
        }
      });

      // Broadcast completion
      this.sseManager.broadcastToSearch(searchId, 'complete', {
        searchId,
        totalResults: streamInfo.sequence,
        duration: Date.now() - streamInfo.startedAt,
        timestamp: new Date().toISOString()
      });

      // Clean up
      this.activeStreams.delete(searchId);

      console.log(`Search ${searchId} completed with ${streamInfo.sequence} results`);

    } catch (error) {
      console.error(`Error completing search ${searchId}:`, error);
      await this.failSearch(searchId, error.message, streamInfo);
    }
  }

  /**
   * Mark search as failed
   * @param {string} searchId - Search ID
   * @param {string} errorMessage - Error message
   * @param {Object} streamInfo - Stream information
   */
  async failSearch(searchId, errorMessage, streamInfo) {
    const prisma = dbClient.getClient();

    try {
      // Update search status
      await prisma.searchQuery.update({
        where: { id: searchId },
        data: {
          metadata: {
            status: 'FAILED',
            error: errorMessage,
            failedAt: new Date().toISOString(),
            totalResults: streamInfo?.sequence || 0
          }
        }
      });

      // Broadcast failure
      this.sseManager.broadcastToSearch(searchId, 'error', {
        message: errorMessage,
        code: 'SEARCH_FAILED',
        timestamp: new Date().toISOString()
      });

      // Clean up
      this.activeStreams.delete(searchId);

      console.log(`Search ${searchId} failed: ${errorMessage}`);

    } catch (error) {
      console.error(`Error failing search ${searchId}:`, error);
    }
  }

  /**
   * Generate title for search result
   * @param {string} type - Result type
   * @param {string} content - Result content
   * @returns {string} Generated title
   */
  generateResultTitle(type, content) {
    switch (type) {
      case 'THINKING':
        return 'AI Analysis Process';
      case 'INTERMEDIATE':
        return 'Intermediate Finding';
      case 'REPORT':
        return 'Final Analysis Report';
      default:
        return `${type} Result`;
    }
  }

  /**
   * Format result content for storage
   * @param {any} content - Raw content
   * @returns {string} Formatted content
   */
  formatResultContent(content) {
    if (typeof content === 'string') {
      return content;
    }
    return JSON.stringify(content, null, 2);
  }

  /**
   * Get active stream info
   * @param {string} searchId - Search ID
   * @returns {Object|null} Stream info
   */
  getActiveStreamInfo(searchId) {
    return this.activeStreams.get(searchId) || null;
  }

  /**
   * Stop active stream
   * @param {string} searchId - Search ID
   */
  async stopStream(searchId) {
    const streamInfo = this.activeStreams.get(searchId);
    if (streamInfo) {
      await this.failSearch(searchId, 'Stream stopped by user', streamInfo);
    }
  }

  /**
   * Get stream statistics
   * @returns {Object} Stream stats
   */
  getStats() {
    return {
      activeStreams: this.activeStreams.size,
      sseStats: this.sseManager.getStats()
    };
  }
}

// Singleton instance
let searchStreamServiceInstance = null;

const getSearchStreamService = () => {
  if (!searchStreamServiceInstance) {
    searchStreamServiceInstance = new SearchStreamService();
  }
  return searchStreamServiceInstance;
};

module.exports = {
  SearchStreamService,
  getSearchStreamService
};