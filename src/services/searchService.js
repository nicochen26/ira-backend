const dbClient = require('../db/client');
const { getServiceByKey } = require('../config/agents');
const { searchCache, generateSearchCacheKey, cacheSearchResults } = require('../utils/cache');
const { createPaginationResponse, parseQueryParams } = require('../utils/pagination');
const { getSearchStreamService } = require('./searchStreamService');

class SearchNotFoundError extends Error {
  constructor(searchId) {
    super(`Search not found: ${searchId}`);
    this.name = 'SearchNotFoundError';
  }
}

class SearchValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SearchValidationError';
  }
}

class SearchServiceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SearchServiceError';
  }
}

const searchService = {
  /**
   * Perform search using IRA backend service
   * @param {Object} searchParams - Search parameters
   * @param {string} searchParams.query - Search query string
   * @param {Object} searchParams.filters - Optional search filters
   * @param {Object} searchParams.metadata - IRA-specific metadata
   * @param {number} searchParams.limit - Result limit (default: 20)
   * @param {number} searchParams.offset - Result offset (default: 0)
   * @param {string} userId - User ID performing the search
   * @param {string} authToken - User's JWT token for IRA authentication
   * @returns {Promise<Object>} Search results with stored query
   */
  async performSearch(searchParams, userId, authToken) {
    const prisma = dbClient.getClient();

    // Validate inputs
    if (!searchParams.query || !searchParams.query.trim()) {
      throw new SearchValidationError('Search query is required');
    }

    if (!userId) {
      throw new SearchValidationError('User ID is required');
    }

    if (!authToken) {
      throw new SearchValidationError('Authentication token is required');
    }

    // Check cache first
    const cacheKey = generateSearchCacheKey(
      searchParams.query,
      searchParams.filters,
      searchParams.metadata,
      searchParams.limit,
      searchParams.offset
    );

    const cachedResults = searchCache.get(cacheKey);
    if (cachedResults) {
      // Still store the query for history tracking
      const searchQuery = await prisma.searchQuery.create({
        data: {
          userId: userId,
          query: searchParams.query.trim(),
          filters: searchParams.filters || null,
          metadata: searchParams.metadata || null
        }
      });

      return {
        ...cachedResults,
        queryId: searchQuery.id,
        cached: true
      };
    }

    // Get IRA service configuration
    const iraService = getServiceByKey('IRA');
    if (!iraService) {
      throw new SearchServiceError('IRA service not configured');
    }

    try {
      // Store search query
      const searchQuery = await prisma.searchQuery.create({
        data: {
          userId: userId,
          query: searchParams.query.trim(),
          filters: searchParams.filters || null,
          metadata: searchParams.metadata || null
        }
      });

      // Prepare request to IRA service
      const searchEndpoint = `${iraService.url}/threads/search`;
      const requestBody = {
        metadata: searchParams.metadata || { graph_id: 'planned-supervisor-agent' },
        limit: searchParams.limit || 20,
        offset: searchParams.offset || 0,
        query: searchParams.query.trim()
      };

      // Make request to IRA service
      const response = await fetch(searchEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new SearchServiceError(`IRA service error: ${response.status} ${response.statusText}`);
      }

      const iraResults = await response.json();

      // Process and store results
      const processedResults = [];
      const resultPromises = iraResults.map(async (iraResult) => {
        // Extract meaningful content from IRA thread
        const title = this.extractThreadTitle(iraResult);
        const content = this.extractThreadContent(iraResult);
        const score = this.calculateRelevanceScore(iraResult, searchParams.query);

        const searchResult = await prisma.searchResult.create({
          data: {
            queryId: searchQuery.id,
            userId: userId,
            threadId: iraResult.thread_id,
            title: title,
            content: content,
            score: score,
            metadata: iraResult,
            sourceService: 'ira'
          }
        });

        return {
          id: searchResult.id,
          threadId: iraResult.thread_id,
          title: title,
          content: content,
          score: score,
          createdAt: iraResult.created_at,
          updatedAt: iraResult.updated_at,
          status: iraResult.status,
          metadata: {
            assistant_id: iraResult.metadata?.assistant_id,
            graph_id: iraResult.metadata?.graph_id,
            user_id: iraResult.metadata?.user_id
          }
        };
      });

      const results = await Promise.all(resultPromises);

      const searchResponse = {
        queryId: searchQuery.id,
        query: searchParams.query,
        totalResults: results.length,
        results: results,
        pagination: {
          limit: searchParams.limit || 20,
          offset: searchParams.offset || 0,
          hasMore: results.length === (searchParams.limit || 20)
        }
      };

      // Cache the results (excluding queryId since it's unique per request)
      const cacheableResponse = {
        query: searchParams.query,
        totalResults: results.length,
        results: results,
        pagination: searchResponse.pagination
      };
      cacheSearchResults(cacheKey, cacheableResponse, searchParams.query);

      return searchResponse;

    } catch (error) {
      // If it's already one of our custom errors, re-throw
      if (error instanceof SearchValidationError ||
          error instanceof SearchServiceError) {
        throw error;
      }

      // Log unexpected errors and throw a generic service error
      console.error('Unexpected search error:', error);
      throw new SearchServiceError('Search operation failed');
    }
  },

  /**
   * Get user's search history
   * @param {string} userId - User ID
   * @param {number} limit - Number of queries to return (default: 10)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} Search history with results
   */
  async getUserSearchHistory(userId, limit = 10, offset = 0) {
    const prisma = dbClient.getClient();

    if (!userId) {
      throw new SearchValidationError('User ID is required');
    }

    const searchQueries = await prisma.searchQuery.findMany({
      where: { userId: userId },
      include: {
        results: {
          take: 3, // Include first 3 results per query
          orderBy: { score: 'desc' }
        },
        _count: {
          select: { results: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    return {
      queries: searchQueries.map(query => ({
        id: query.id,
        query: query.query,
        createdAt: query.createdAt,
        totalResults: query._count.results,
        topResults: query.results.map(result => ({
          id: result.id,
          threadId: result.threadId,
          title: result.title,
          score: result.score,
          createdAt: result.createdAt
        }))
      })),
      pagination: {
        limit: limit,
        offset: offset,
        hasMore: searchQueries.length === limit
      }
    };
  },

  /**
   * Get detailed search results for a specific query
   * @param {string} queryId - Search query ID
   * @param {string} userId - User ID (for access control)
   * @param {number} limit - Number of results to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Object>} Detailed search results
   */
  async getSearchResults(queryId, userId, limit = 20, offset = 0) {
    const prisma = dbClient.getClient();

    if (!queryId || !userId) {
      throw new SearchValidationError('Query ID and User ID are required');
    }

    // Verify the query belongs to the user
    const searchQuery = await prisma.searchQuery.findFirst({
      where: {
        id: queryId,
        userId: userId
      },
      include: {
        results: {
          orderBy: [
            { score: 'desc' },
            { createdAt: 'desc' }
          ],
          take: limit,
          skip: offset
        },
        _count: {
          select: { results: true }
        }
      }
    });

    if (!searchQuery) {
      throw new SearchNotFoundError(queryId);
    }

    return {
      queryId: searchQuery.id,
      query: searchQuery.query,
      createdAt: searchQuery.createdAt,
      totalResults: searchQuery._count.results,
      results: searchQuery.results.map(result => ({
        id: result.id,
        threadId: result.threadId,
        title: result.title,
        content: result.content,
        score: result.score,
        sourceService: result.sourceService,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        metadata: result.metadata
      })),
      pagination: {
        limit: limit,
        offset: offset,
        hasMore: searchQuery.results.length === limit
      }
    };
  },

  /**
   * Delete a search query and its results
   * @param {string} queryId - Search query ID
   * @param {string} userId - User ID (for access control)
   * @returns {Promise<Object>} Deletion confirmation
   */
  async deleteSearchQuery(queryId, userId) {
    const prisma = dbClient.getClient();

    if (!queryId || !userId) {
      throw new SearchValidationError('Query ID and User ID are required');
    }

    // Verify the query belongs to the user
    const searchQuery = await prisma.searchQuery.findFirst({
      where: {
        id: queryId,
        userId: userId
      },
      include: {
        _count: {
          select: { results: true }
        }
      }
    });

    if (!searchQuery) {
      throw new SearchNotFoundError(queryId);
    }

    // Delete the query (results will be deleted automatically due to cascade)
    await prisma.searchQuery.delete({
      where: { id: queryId }
    });

    return {
      success: true,
      message: 'Search query deleted successfully',
      deletedQueryId: queryId,
      deletedResultsCount: searchQuery._count.results
    };
  },

  /**
   * Extract title from IRA thread result
   * @private
   */
  extractThreadTitle(iraResult) {
    // Try to extract title from the first human message
    if (iraResult.values?.messages?.length > 0) {
      const firstMessage = iraResult.values.messages[0];
      if (firstMessage.type === 'human' && firstMessage.content) {
        return firstMessage.content.substring(0, 100);
      }
    }

    // Fallback to thread ID
    return `Thread ${iraResult.thread_id.substring(0, 8)}`;
  },

  /**
   * Extract content from IRA thread result
   * @private
   */
  extractThreadContent(iraResult) {
    if (!iraResult.values?.messages) {
      return 'No content available';
    }

    // Extract and combine meaningful content from messages
    const contentParts = [];

    iraResult.values.messages.forEach(message => {
      if (message.content && typeof message.content === 'string') {
        contentParts.push(message.content);
      }
    });

    const fullContent = contentParts.join(' ').substring(0, 2000);
    return fullContent || 'No content available';
  },

  /**
   * Calculate relevance score for search result
   * @private
   */
  calculateRelevanceScore(iraResult, query) {
    // Simple relevance scoring based on content matching
    // In a real implementation, this would be more sophisticated
    const content = this.extractThreadContent(iraResult).toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/);

    let score = 0;
    queryTerms.forEach(term => {
      const matches = (content.match(new RegExp(term, 'g')) || []).length;
      score += matches * 0.1;
    });

    // Boost recent results
    if (iraResult.updated_at) {
      const daysSinceUpdate = (Date.now() - new Date(iraResult.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.max(0, 1 - daysSinceUpdate / 30); // Boost for recent updates
      score += recencyBoost * 0.2;
    }

    return Math.min(1.0, Math.max(0.0, score)); // Clamp between 0 and 1
  },

  /**
   * Get cache statistics for monitoring
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return searchCache.getStats();
  },

  /**
   * Clear search cache
   * @returns {Object} Operation result
   */
  clearCache() {
    const statsBefore = searchCache.getStats();
    searchCache.clear();

    return {
      success: true,
      message: 'Search cache cleared successfully',
      clearedEntries: statsBefore.totalEntries
    };
  },

  /**
   * Warm up cache with popular search queries
   * @param {Array} popularQueries - Array of popular search queries
   * @param {string} userId - User ID for authentication
   * @param {string} authToken - Authentication token
   * @returns {Promise<Object>} Cache warming results
   */
  async warmUpCache(popularQueries, userId, authToken) {
    const results = {
      success: true,
      warmedQueries: 0,
      errors: []
    };

    for (const query of popularQueries) {
      try {
        await this.performSearch({ query }, userId, authToken);
        results.warmedQueries++;
      } catch (error) {
        results.errors.push({
          query,
          error: error.message
        });
      }
    }

    return results;
  },

  /**
   * Get personal search list for a user with optimized query
   * @param {string} userId - User ID
   * @param {Object} queryParams - Query parameters
   * @param {number} queryParams.page - Page number (default: 1)
   * @param {number} queryParams.limit - Items per page (default: 20)
   * @param {string} queryParams.sort - Sort parameter (default: 'createdAt:desc')
   * @param {string} queryParams.status - Optional status filter
   * @returns {Promise<Object>} Paginated personal search list
   */
  async getPersonalSearchList(userId, queryParams = {}) {
    const prisma = dbClient.getClient();

    if (!userId) {
      throw new SearchValidationError('User ID is required');
    }

    // Parse and validate query parameters
    const { page, limit, offset, sort, filters } = parseQueryParams(queryParams, {
      allowedSortFields: ['createdAt', 'query'],
      defaultSort: 'createdAt:desc',
      maxLimit: 100
    });

    // Build where clause
    const whereClause = {
      userId: userId
    };

    // Add status filter if specified
    if (filters.status) {
      // Since we're using SearchQuery model, we don't have status field
      // This would need to be adapted based on actual search status tracking
    }

    // Add date range filters if specified
    if (filters.from || filters.to) {
      whereClause.createdAt = {};
      if (filters.from) {
        whereClause.createdAt.gte = filters.from;
      }
      if (filters.to) {
        whereClause.createdAt.lte = filters.to;
      }
    }

    // Get total count for pagination
    const total = await prisma.searchQuery.count({
      where: whereClause
    });

    // Get paginated search queries with optimized selection
    const searchQueries = await prisma.searchQuery.findMany({
      where: whereClause,
      select: {
        id: true,
        query: true,
        createdAt: true,
        userId: true,
        _count: {
          select: { results: true }
        }
      },
      orderBy: {
        [sort.field]: sort.direction
      },
      skip: offset,
      take: limit
    });

    // Transform data for API response
    const transformedData = searchQueries.map(searchQuery => ({
      id: searchQuery.id,
      topic: searchQuery.query, // Using query as topic
      createdAt: searchQuery.createdAt,
      userId: searchQuery.userId,
      resultCount: searchQuery._count.results
    }));

    return createPaginationResponse(
      transformedData,
      page,
      limit,
      total,
      {
        sortBy: sort.field,
        sortOrder: sort.direction,
        filters: filters
      }
    );
  },

  /**
   * Get team search list with permission verification
   * @param {string} teamId - Team ID
   * @param {string} userId - Current user ID (for permission check)
   * @param {Object} queryParams - Query parameters
   * @returns {Promise<Object>} Paginated team search list
   */
  async getTeamSearchList(teamId, userId, queryParams = {}) {
    const prisma = dbClient.getClient();

    if (!teamId) {
      throw new SearchValidationError('Team ID is required');
    }

    if (!userId) {
      throw new SearchValidationError('User ID is required');
    }

    // First verify user is a member of the team
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        teamId: teamId,
        userId: userId
      }
    });

    if (!teamMember) {
      throw new SearchValidationError('Access denied: User is not a member of this team');
    }

    // Parse and validate query parameters
    const { page, limit, offset, sort, filters } = parseQueryParams(queryParams, {
      allowedSortFields: ['createdAt', 'query', 'userName'],
      defaultSort: 'createdAt:desc',
      maxLimit: 100
    });

    // Build where clause for team searches
    const whereClause = {
      user: {
        teamMembers: {
          some: {
            teamId: teamId
          }
        }
      }
    };

    // Add date range filters if specified
    if (filters.from || filters.to) {
      whereClause.createdAt = {};
      if (filters.from) {
        whereClause.createdAt.gte = filters.from;
      }
      if (filters.to) {
        whereClause.createdAt.lte = filters.to;
      }
    }

    // Get total count for pagination
    const total = await prisma.searchQuery.count({
      where: whereClause
    });

    // Build orderBy clause - handle user name sorting specially
    let orderBy;
    if (sort.field === 'userName') {
      orderBy = {
        user: {
          name: sort.direction
        }
      };
    } else {
      orderBy = {
        [sort.field]: sort.direction
      };
    }

    // Get paginated search queries with user information
    const searchQueries = await prisma.searchQuery.findMany({
      where: whereClause,
      select: {
        id: true,
        query: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            name: true
          }
        },
        _count: {
          select: { results: true }
        }
      },
      orderBy: orderBy,
      skip: offset,
      take: limit
    });

    // Transform data for API response
    const transformedData = searchQueries.map(searchQuery => ({
      id: searchQuery.id,
      topic: searchQuery.query,
      createdAt: searchQuery.createdAt,
      userId: searchQuery.userId,
      userName: searchQuery.user.name,
      resultCount: searchQuery._count.results
    }));

    return createPaginationResponse(
      transformedData,
      page,
      limit,
      total,
      {
        teamId: teamId,
        sortBy: sort.field,
        sortOrder: sort.direction,
        filters: filters
      }
    );
  },

  /**
   * Perform streaming search using IRA backend service with two-step flow
   * @param {Object} searchParams - Search parameters
   * @param {string} searchParams.query - Search query string
   * @param {Object} searchParams.filters - Optional search filters
   * @param {Object} searchParams.metadata - IRA-specific metadata
   * @param {string} userId - User ID performing the search
   * @param {string} authToken - User's JWT token for IRA authentication
   * @returns {Promise<Object>} Search initialization result with searchId
   */
  async performStreamingSearch(searchParams, userId, authToken) {
    const prisma = dbClient.getClient();

    // Validate inputs
    if (!searchParams.query || !searchParams.query.trim()) {
      throw new SearchValidationError('Search query is required');
    }

    if (!userId) {
      throw new SearchValidationError('User ID is required');
    }

    if (!authToken) {
      throw new SearchValidationError('Authentication token is required');
    }

    try {
      // Store search query with INITIATED status
      const searchQuery = await prisma.searchQuery.create({
        data: {
          userId: userId,
          query: searchParams.query.trim(),
          filters: searchParams.filters || null,
          metadata: {
            ...searchParams.metadata,
            status: 'INITIATED',
            streamingEnabled: true,
            initiatedAt: new Date().toISOString()
          }
        }
      });

      // Start streaming search using the search stream service
      const streamService = getSearchStreamService();
      const streamResult = await streamService.startStreamSearch(
        searchQuery.id,
        userId,
        authToken,
        searchParams.query.trim(),
        searchParams.metadata
      );

      return {
        queryId: searchQuery.id,
        query: searchParams.query.trim(),
        status: 'INITIATED',
        streaming: true,
        threadId: streamResult.threadId,
        message: 'Streaming search initiated successfully'
      };

    } catch (error) {
      // If it's already one of our custom errors, re-throw
      if (error instanceof SearchValidationError ||
          error instanceof SearchServiceError) {
        throw error;
      }

      // Log unexpected errors and throw a generic service error
      console.error('Unexpected streaming search error:', error);
      throw new SearchServiceError('Streaming search operation failed');
    }
  },

  /**
   * Get search by ID with ownership verification
   * @param {string} searchId - Search ID
   * @param {string} userId - User ID (for ownership verification)
   * @returns {Promise<Object>} Search query data
   */
  async getSearchById(searchId, userId) {
    const prisma = dbClient.getClient();

    if (!searchId) {
      throw new SearchValidationError('Search ID is required');
    }

    const searchQuery = await prisma.searchQuery.findFirst({
      where: {
        id: searchId,
        userId: userId // Ensure ownership
      },
      include: {
        _count: {
          select: { results: true }
        }
      }
    });

    if (!searchQuery) {
      throw new SearchNotFoundError(searchId);
    }

    return {
      id: searchQuery.id,
      query: searchQuery.query,
      filters: searchQuery.filters,
      metadata: searchQuery.metadata,
      createdAt: searchQuery.createdAt,
      userId: searchQuery.userId,
      resultCount: searchQuery._count.results
    };
  },

  /**
   * Check if user is a team member (helper method)
   * @param {string} userId - User ID
   * @param {string} teamId - Team ID
   * @returns {Promise<boolean>} True if user is team member
   */
  async isUserTeamMember(userId, teamId) {
    const prisma = dbClient.getClient();

    const teamMember = await prisma.teamMember.findFirst({
      where: {
        teamId: teamId,
        userId: userId
      }
    });

    return !!teamMember;
  }
};

module.exports = {
  searchService,
  SearchNotFoundError,
  SearchValidationError,
  SearchServiceError
};