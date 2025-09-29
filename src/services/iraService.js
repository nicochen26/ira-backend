const fetch = require('node-fetch');

class IRAServiceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'IRAServiceError';
    this.statusCode = statusCode;
  }
}

class IRAService {
  constructor() {
    this.baseURL = process.env.IRA_BASE_URL || 'http://localhost:2024';
  }

  /**
   * Create a new thread for IRA processing
   * @param {string} authToken - User's JWT token
   * @param {Object} metadata - Optional metadata for thread creation
   * @returns {Promise<Object>} Thread creation response with thread_id
   */
  async createThread(authToken, metadata = {}) {
    try {
      const response = await fetch(`${this.baseURL}/threads`, {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Origin': process.env.FRONTEND_URL || 'http://localhost:3000',
        },
        body: JSON.stringify({ metadata })
      });

      if (!response.ok) {
        throw new IRAServiceError(
          `IRA threads API failed: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      const threadData = await response.json();

      if (!threadData.thread_id) {
        throw new IRAServiceError('IRA threads API did not return thread_id', 500);
      }

      return threadData;
    } catch (error) {
      if (error instanceof IRAServiceError) {
        throw error;
      }
      throw new IRAServiceError(`Failed to create IRA thread: ${error.message}`, 500);
    }
  }

  /**
   * Start streaming search results from IRA
   * @param {string} threadId - Thread ID from createThread
   * @param {string} authToken - User's JWT token
   * @param {string} query - Search query
   * @param {Object} config - IRA configuration options
   * @returns {Promise<Response>} Streaming response object
   */
  async startStream(threadId, authToken, query, config = {}) {
    try {
      const defaultConfig = {
        configurable: {
          ira_web_version: "v0.9.1-rc.9-1-gded3ee0",
          ira_web_commit: "ded3ee0",
          deepResearch: true,
          mcpWebSearch: true,
          user_id: "", // Will be filled from JWT
          project_id: "",
          file_server: process.env.FRONTEND_URL || "http://localhost:3000",
          dir_id: null,
          type: ""
        },
        recursion_limit: 60
      };

      const streamConfig = {
        ...defaultConfig,
        ...config,
        configurable: {
          ...defaultConfig.configurable,
          ...config.configurable
        }
      };

      const streamData = {
        input: {
          messages: [{
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: "human",
            content: query
          }]
        },
        config: streamConfig,
        stream_mode: ["values", "messages-tuple", "custom"],
        stream_resumable: false,
        assistant_id: "planned-supervisor-agent",
        on_disconnect: "cancel"
      };

      const response = await fetch(`${this.baseURL}/threads/${threadId}/runs/stream`, {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Origin': process.env.FRONTEND_URL || 'http://localhost:3000',
        },
        body: JSON.stringify(streamData)
      });

      if (!response.ok) {
        throw new IRAServiceError(
          `IRA stream API failed: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      return response;
    } catch (error) {
      if (error instanceof IRAServiceError) {
        throw error;
      }
      throw new IRAServiceError(`Failed to start IRA stream: ${error.message}`, 500);
    }
  }

  /**
   * Parse SSE data from IRA stream
   * @param {string} sseData - Raw SSE data string
   * @returns {Object|null} Parsed SSE event data
   */
  parseSSEData(sseData) {
    try {
      const lines = sseData.trim().split('\n');
      const event = {};

      for (const line of lines) {
        if (line.startsWith('event:')) {
          event.type = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          const dataContent = line.substring(5).trim();
          if (dataContent) {
            try {
              event.data = JSON.parse(dataContent);
            } catch {
              event.data = dataContent;
            }
          }
        } else if (line.startsWith('id:')) {
          event.id = line.substring(3).trim();
        }
      }

      return Object.keys(event).length > 0 ? event : null;
    } catch (error) {
      console.error('Failed to parse SSE data:', error);
      return null;
    }
  }

  /**
   * Extract meaningful content from IRA stream messages
   * @param {Object} eventData - Parsed SSE event data
   * @returns {Object|null} Processed result data
   */
  processStreamEvent(eventData) {
    if (!eventData || !eventData.data) {
      return null;
    }

    const { type, data } = eventData;

    switch (type) {
      case 'metadata':
        return {
          type: 'METADATA',
          content: data,
          sequence: parseInt(eventData.id) || 0
        };

      case 'values':
        // Extract meaningful state updates
        if (data.messages && data.messages.length > 0) {
          const lastMessage = data.messages[data.messages.length - 1];
          if (lastMessage.content) {
            return {
              type: 'THINKING',
              content: lastMessage.content,
              sequence: parseInt(eventData.id) || 0
            };
          }
        }

        if (data.final_result) {
          return {
            type: 'REPORT',
            content: data.final_result,
            sequence: parseInt(eventData.id) || 0
          };
        }
        break;

      case 'messages':
        // Process individual messages
        if (Array.isArray(data)) {
          const lastMessage = data[data.length - 1];
          if (lastMessage && lastMessage.content) {
            const isToolCall = lastMessage.tool_calls && lastMessage.tool_calls.length > 0;
            return {
              type: isToolCall ? 'THINKING' : 'INTERMEDIATE',
              content: lastMessage.content,
              sequence: parseInt(eventData.id) || 0,
              metadata: {
                messageType: lastMessage.type,
                toolCalls: lastMessage.tool_calls || []
              }
            };
          }
        }
        break;

      default:
        // Handle other event types
        return {
          type: 'INTERMEDIATE',
          content: JSON.stringify(data),
          sequence: parseInt(eventData.id) || 0
        };
    }

    return null;
  }
}

module.exports = {
  IRAService,
  IRAServiceError
};