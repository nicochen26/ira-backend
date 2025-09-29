const { searchService, SearchNotFoundError, SearchValidationError, SearchServiceError } = require('../../src/services/searchService');
const userService = require('../../src/services/userService');
const { searchCache } = require('../../src/utils/cache');
const dbClient = require('../../src/db/client');

// Mock fetch to simulate IRA API responses
global.fetch = jest.fn();

// Mock the agents config module
jest.mock('../../src/config/agents', () => ({
  getServiceByKey: jest.fn()
}));

const { getServiceByKey } = require('../../src/config/agents');

describe('Search Service', () => {
  let testUsers = [];

  beforeAll(async () => {
    await dbClient.connect();
  });

  afterAll(async () => {
    await dbClient.disconnect();
  });

  beforeEach(async () => {
    const prisma = dbClient.getClient();

    // Clear cache
    searchCache.clear();

    // Clean up test data
    await prisma.searchResult.deleteMany({
      where: { user: { email: { contains: 'searchtest' } } }
    });

    await prisma.searchQuery.deleteMany({
      where: { user: { email: { contains: 'searchtest' } } }
    });

    await prisma.user.deleteMany({
      where: { email: { contains: 'searchtest' } }
    });

    // Create test users
    testUsers = [
      await userService.createUser({ name: 'Search User', email: 'user@searchtest.com' }),
      await userService.createUser({ name: 'Search Admin', email: 'admin@searchtest.com' })
    ];

    // Reset fetch mock
    fetch.mockClear();

    // Mock IRA service configuration
    getServiceByKey.mockReturnValue({
      name: 'IRA Research Agent',
      url: 'http://localhost:2024/_ira',
      pathPrefix: '/ira'
    });
  });

  describe('performSearch', () => {
    test('should perform search and store results', async () => {
      // Mock IRA API response
      const mockIraResponse = [
        {
          thread_id: 'test-thread-1',
          created_at: '2025-09-29T08:00:00.000Z',
          updated_at: '2025-09-29T08:05:00.000Z',
          status: 'idle',
          metadata: {
            user_id: 'test-user-id',
            graph_id: 'planned-supervisor-agent',
            assistant_id: 'test-assistant-id'
          },
          values: {
            messages: [
              {
                id: 'msg-1',
                content: 'Analyze Bitcoin trends',
                type: 'human'
              },
              {
                id: 'msg-2',
                content: 'Bitcoin analysis results with market data',
                type: 'ai'
              }
            ]
          }
        }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockIraResponse)
      });

      const searchParams = {
        query: 'Bitcoin analysis',
        metadata: { graph_id: 'planned-supervisor-agent' },
        limit: 20,
        offset: 0
      };

      const result = await searchService.performSearch(
        searchParams,
        testUsers[0].id,
        'test-auth-token'
      );

      expect(result.success).toBe(undefined); // This method doesn't return success field
      expect(result.queryId).toBeDefined();
      expect(result.query).toBe('Bitcoin analysis');
      expect(result.totalResults).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].threadId).toBe('test-thread-1');
      expect(result.results[0].title).toBe('Analyze Bitcoin trends');

      // Verify fetch was called correctly
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('threads/search'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-auth-token',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            metadata: { graph_id: 'planned-supervisor-agent' },
            limit: 20,
            offset: 0,
            query: 'Bitcoin analysis'
          })
        })
      );
    });

    test('should return cached results on subsequent identical searches', async () => {
      // Mock IRA API response for first call
      const mockIraResponse = [
        {
          thread_id: 'cached-thread-1',
          created_at: '2025-09-29T08:00:00.000Z',
          updated_at: '2025-09-29T08:05:00.000Z',
          status: 'idle',
          metadata: { graph_id: 'planned-supervisor-agent' },
          values: {
            messages: [
              { id: 'msg-1', content: 'Cached search query', type: 'human' }
            ]
          }
        }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockIraResponse)
      });

      const searchParams = {
        query: 'cached query',
        metadata: { graph_id: 'planned-supervisor-agent' }
      };

      // First search - should call IRA API
      const result1 = await searchService.performSearch(
        searchParams,
        testUsers[0].id,
        'test-auth-token'
      );

      expect(fetch).toHaveBeenCalledTimes(1);

      // Second identical search - should use cache
      const result2 = await searchService.performSearch(
        searchParams,
        testUsers[0].id,
        'test-auth-token'
      );

      expect(fetch).toHaveBeenCalledTimes(1); // No additional API call
      expect(result2.cached).toBe(true);
      expect(result2.results).toHaveLength(1);
      expect(result2.results[0].threadId).toBe('cached-thread-1');
    });

    test('should throw validation error for missing query', async () => {
      await expect(searchService.performSearch(
        { query: '' },
        testUsers[0].id,
        'test-auth-token'
      )).rejects.toThrow('Search query is required');
    });

    test('should throw validation error for missing user ID', async () => {
      await expect(searchService.performSearch(
        { query: 'test query' },
        null,
        'test-auth-token'
      )).rejects.toThrow('User ID is required');
    });

    test('should throw validation error for missing auth token', async () => {
      await expect(searchService.performSearch(
        { query: 'test query' },
        testUsers[0].id,
        null
      )).rejects.toThrow('Authentication token is required');
    });

    test('should handle IRA API errors', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(searchService.performSearch(
        { query: 'error query' },
        testUsers[0].id,
        'test-auth-token'
      )).rejects.toThrow('IRA service error: 500 Internal Server Error');
    });

    test('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(searchService.performSearch(
        { query: 'network error query' },
        testUsers[0].id,
        'test-auth-token'
      )).rejects.toThrow('Search operation failed');
    });
  });

  describe('getUserSearchHistory', () => {
    let searchQueryId;

    beforeEach(async () => {
      // Create a test search query
      const prisma = dbClient.getClient();
      const searchQuery = await prisma.searchQuery.create({
        data: {
          userId: testUsers[0].id,
          query: 'test history query',
          metadata: { graph_id: 'planned-supervisor-agent' }
        }
      });
      searchQueryId = searchQuery.id;

      // Create some results for the query
      await prisma.searchResult.create({
        data: {
          queryId: searchQuery.id,
          userId: testUsers[0].id,
          threadId: 'history-thread-1',
          title: 'History Result 1',
          content: 'Content for history result 1',
          score: 0.9,
          sourceService: 'ira'
        }
      });
    });

    test('should get user search history', async () => {
      const history = await searchService.getUserSearchHistory(testUsers[0].id);

      expect(history.queries).toHaveLength(1);
      expect(history.queries[0].query).toBe('test history query');
      expect(history.queries[0].totalResults).toBe(1);
      expect(history.queries[0].topResults).toHaveLength(1);
      expect(history.queries[0].topResults[0].title).toBe('History Result 1');
    });

    test('should respect pagination', async () => {
      const history = await searchService.getUserSearchHistory(testUsers[0].id, 1, 0);

      expect(history.queries).toHaveLength(1);
      expect(history.pagination.limit).toBe(1);
      expect(history.pagination.offset).toBe(0);
    });

    test('should return empty array for user with no searches', async () => {
      const history = await searchService.getUserSearchHistory(testUsers[1].id);

      expect(history.queries).toHaveLength(0);
    });

    test('should throw validation error for missing user ID', async () => {
      await expect(searchService.getUserSearchHistory(null))
        .rejects.toThrow('User ID is required');
    });
  });

  describe('getSearchResults', () => {
    let searchQueryId;

    beforeEach(async () => {
      const prisma = dbClient.getClient();
      const searchQuery = await prisma.searchQuery.create({
        data: {
          userId: testUsers[0].id,
          query: 'test results query',
          metadata: { graph_id: 'planned-supervisor-agent' }
        }
      });
      searchQueryId = searchQuery.id;

      await prisma.searchResult.createMany({
        data: [
          {
            queryId: searchQuery.id,
            userId: testUsers[0].id,
            threadId: 'result-thread-1',
            title: 'Result 1',
            content: 'Content 1',
            score: 0.9,
            sourceService: 'ira'
          },
          {
            queryId: searchQuery.id,
            userId: testUsers[0].id,
            threadId: 'result-thread-2',
            title: 'Result 2',
            content: 'Content 2',
            score: 0.8,
            sourceService: 'ira'
          }
        ]
      });
    });

    test('should get search results for a query', async () => {
      const results = await searchService.getSearchResults(
        searchQueryId,
        testUsers[0].id
      );

      expect(results.queryId).toBe(searchQueryId);
      expect(results.query).toBe('test results query');
      expect(results.totalResults).toBe(2);
      expect(results.results).toHaveLength(2);
      expect(results.results[0].score).toBe(0.9); // Should be sorted by score desc
      expect(results.results[1].score).toBe(0.8);
    });

    test('should throw error for non-existent query', async () => {
      await expect(searchService.getSearchResults(
        'non-existent-id',
        testUsers[0].id
      )).rejects.toThrow('Search not found');
    });

    test('should throw error when user tries to access another user\'s search', async () => {
      await expect(searchService.getSearchResults(
        searchQueryId,
        testUsers[1].id
      )).rejects.toThrow('Search not found');
    });

    test('should throw validation error for missing parameters', async () => {
      await expect(searchService.getSearchResults(null, testUsers[0].id))
        .rejects.toThrow('Query ID and User ID are required');

      await expect(searchService.getSearchResults(searchQueryId, null))
        .rejects.toThrow('Query ID and User ID are required');
    });
  });

  describe('deleteSearchQuery', () => {
    let searchQueryId;

    beforeEach(async () => {
      const prisma = dbClient.getClient();
      const searchQuery = await prisma.searchQuery.create({
        data: {
          userId: testUsers[0].id,
          query: 'delete test query',
          metadata: { graph_id: 'planned-supervisor-agent' }
        }
      });
      searchQueryId = searchQuery.id;

      await prisma.searchResult.create({
        data: {
          queryId: searchQuery.id,
          userId: testUsers[0].id,
          threadId: 'delete-thread-1',
          title: 'Delete Result',
          content: 'Content to delete',
          score: 0.9,
          sourceService: 'ira'
        }
      });
    });

    test('should delete search query and results', async () => {
      const result = await searchService.deleteSearchQuery(
        searchQueryId,
        testUsers[0].id
      );

      expect(result.success).toBe(true);
      expect(result.deletedQueryId).toBe(searchQueryId);
      expect(result.deletedResultsCount).toBe(1);

      // Verify deletion
      await expect(searchService.getSearchResults(
        searchQueryId,
        testUsers[0].id
      )).rejects.toThrow('Search not found');
    });

    test('should throw error for non-existent query', async () => {
      await expect(searchService.deleteSearchQuery(
        'non-existent-id',
        testUsers[0].id
      )).rejects.toThrow('Search not found');
    });

    test('should throw error when user tries to delete another user\'s search', async () => {
      await expect(searchService.deleteSearchQuery(
        searchQueryId,
        testUsers[1].id
      )).rejects.toThrow('Search not found');
    });
  });

  describe('cache management', () => {
    test('should get cache statistics', () => {
      const stats = searchService.getCacheStats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('activeEntries');
      expect(stats).toHaveProperty('expiredEntries');
      expect(stats).toHaveProperty('memoryUsage');
    });

    test('should clear cache', () => {
      // Add something to cache first
      searchCache.set('test-key', { data: 'test' });

      const result = searchService.clearCache();

      expect(result.success).toBe(true);
      expect(result.clearedEntries).toBe(1);
      expect(searchCache.size()).toBe(0);
    });
  });

  describe('content extraction', () => {
    test('should extract title from IRA thread', () => {
      const iraResult = {
        thread_id: 'test-thread',
        values: {
          messages: [
            {
              type: 'human',
              content: 'This is a test message for title extraction'
            }
          ]
        }
      };

      const title = searchService.extractThreadTitle(iraResult);
      expect(title).toBe('This is a test message for title extraction');
    });

    test('should fallback to thread ID when no content available', () => {
      const iraResult = {
        thread_id: 'fallback-thread-id',
        values: { messages: [] }
      };

      const title = searchService.extractThreadTitle(iraResult);
      expect(title).toBe('Thread fallback');
    });

    test('should extract content from IRA thread messages', () => {
      const iraResult = {
        values: {
          messages: [
            { content: 'First message content' },
            { content: 'Second message content' }
          ]
        }
      };

      const content = searchService.extractThreadContent(iraResult);
      expect(content).toContain('First message content');
      expect(content).toContain('Second message content');
    });

    test('should calculate relevance score', () => {
      const iraResult = {
        updated_at: new Date().toISOString(),
        values: {
          messages: [
            { content: 'Bitcoin analysis with market trends and price prediction' }
          ]
        }
      };

      const score = searchService.calculateRelevanceScore(iraResult, 'bitcoin analysis');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});