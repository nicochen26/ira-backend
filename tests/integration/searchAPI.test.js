const app = require('../../src/app');
const userService = require('../../src/services/userService');
const { searchCache } = require('../../src/utils/cache');
const dbClient = require('../../src/db/client');
const jwt = require('jsonwebtoken');

// Mock fetch to simulate IRA API responses
global.fetch = jest.fn();

// Mock the agents config module
jest.mock('../../src/config/agents', () => ({
  getServiceByKey: jest.fn(),
  getServiceByPath: jest.fn(),
  validateAgentConfig: jest.fn(),
  getAllServices: jest.fn()
}));

const { getServiceByKey, getServiceByPath } = require('../../src/config/agents');

describe('Search API Integration Tests', () => {
  let testUsers = [];
  let authTokens = [];

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
      where: { user: { email: { contains: 'searchapitest' } } }
    });

    await prisma.searchQuery.deleteMany({
      where: { user: { email: { contains: 'searchapitest' } } }
    });

    await prisma.user.deleteMany({
      where: { email: { contains: 'searchapitest' } }
    });

    // Create test users
    testUsers = [
      await userService.createUser({ name: 'API Search User', email: 'user@searchapitest.com' }),
      await userService.createUser({ name: 'API Search Admin', email: 'admin@searchapitest.com' })
    ];

    // Create auth tokens for each user
    authTokens = testUsers.map(user =>
      jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      )
    );

    // Reset fetch mock
    fetch.mockClear();

    // Mock IRA service configuration
    getServiceByKey.mockReturnValue({
      name: 'IRA Research Agent',
      url: 'http://localhost:2024/_ira',
      pathPrefix: '/ira'
    });

    // Mock auth service for token verification
    getServiceByPath.mockReturnValue({
      name: 'IRA Research Agent',
      url: 'http://localhost:2024/_ira',
      pathPrefix: '/ira'
    });

    // Mock successful auth verification for all requests
    fetch.mockImplementation((url, options) => {
      // Handle auth verification endpoint
      if (url.includes('/auth/verify-token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            valid: true,
            user: testUsers[0] // Use first test user for all auth requests
          })
        });
      }

      // Handle search requests - return empty by default
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    });
  });

  describe('POST /api/search', () => {
    test('should perform search successfully', async () => {
      // Mock successful IRA API response
      const mockIraResponse = [
        {
          thread_id: 'api-thread-1',
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
                content: 'Search for Bitcoin market analysis',
                type: 'human'
              },
              {
                id: 'msg-2',
                content: 'Detailed Bitcoin market analysis with charts and predictions',
                type: 'ai'
              }
            ]
          }
        }
      ];

      // Override the default mock for this specific test
      fetch.mockImplementation((url, options) => {
        // Handle auth verification endpoint
        if (url.includes('/auth/verify-token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              valid: true,
              user: testUsers[0]
            })
          });
        }

        // Handle IRA search endpoint
        if (url.includes('/threads/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockIraResponse)
          });
        }

        // Default fallback
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      });

      const searchRequest = {
        query: 'Bitcoin market analysis',
        metadata: { graph_id: 'planned-supervisor-agent' },
        limit: 10,
        offset: 0
      };

      const response = await app.request('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify(searchRequest)
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.query).toBe('Bitcoin market analysis');
      expect(data.data.totalResults).toBe(1);
      expect(data.data.results).toHaveLength(1);
      expect(data.data.results[0].threadId).toBe('api-thread-1');
      expect(data.data.results[0].title).toBe('Search for Bitcoin market analysis');
    });

    test('should return cached results for identical searches', async () => {
      // Mock IRA API response for first call only
      const mockIraResponse = [
        {
          thread_id: 'cached-api-thread',
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

      let searchCallCount = 0;
      fetch.mockImplementation((url, options) => {
        // Handle auth verification endpoint
        if (url.includes('/auth/verify-token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              valid: true,
              user: testUsers[0]
            })
          });
        }

        // Handle IRA search endpoint - only return data on first call
        if (url.includes('/threads/search')) {
          searchCallCount++;
          if (searchCallCount === 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(mockIraResponse)
            });
          } else {
            // This shouldn't be called on second request due to caching
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve([])
            });
          }
        }

        // Default fallback
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      });

      const searchRequest = {
        query: 'cached api query',
        metadata: { graph_id: 'planned-supervisor-agent' }
      };

      // First search
      const response1 = await app.request('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify(searchRequest)
      });

      expect(response1.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second identical search
      const response2 = await app.request('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify(searchRequest)
      });

      expect(response2.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(1); // No additional API call

      const data2 = await response2.json();
      expect(data2.data.cached).toBe(true);
    });

    test('should fail without authentication', async () => {
      const searchRequest = { query: 'test query' };

      const response = await app.request('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchRequest)
      });

      expect(response.status).toBe(401);
    });

    test('should fail with missing query', async () => {
      const searchRequest = { metadata: { graph_id: 'test' } };

      const response = await app.request('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify(searchRequest)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Search query is required');
    });

    test('should handle IRA service errors', async () => {
      fetch.mockImplementation((url, options) => {
        // Handle auth verification endpoint
        if (url.includes('/auth/verify-token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              valid: true,
              user: testUsers[0]
            })
          });
        }

        // Handle IRA search endpoint with error
        if (url.includes('/threads/search')) {
          return Promise.resolve({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable'
          });
        }

        // Default fallback
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      });

      const searchRequest = { query: 'error test query' };

      const response = await app.request('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify(searchRequest)
      });

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('IRA service error');
    });
  });

  describe('GET /api/search/history', () => {
    beforeEach(async () => {
      // Create some search history
      const prisma = dbClient.getClient();
      const searchQuery = await prisma.searchQuery.create({
        data: {
          userId: testUsers[0].id,
          query: 'history test query',
          metadata: { graph_id: 'planned-supervisor-agent' }
        }
      });

      await prisma.searchResult.create({
        data: {
          queryId: searchQuery.id,
          userId: testUsers[0].id,
          threadId: 'history-thread-1',
          title: 'History Result',
          content: 'Content for history',
          score: 0.9,
          sourceService: 'ira'
        }
      });
    });

    test('should get user search history', async () => {
      const response = await app.request('/api/search/history', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.queries).toHaveLength(1);
      expect(data.data.queries[0].query).toBe('history test query');
      expect(data.data.queries[0].totalResults).toBe(1);
      expect(data.data.queries[0].topResults).toHaveLength(1);
    });

    test('should respect limit parameter', async () => {
      const response = await app.request('/api/search/history?limit=1', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.pagination.limit).toBe(1);
    });

    test('should fail with limit exceeding maximum', async () => {
      const response = await app.request('/api/search/history?limit=150', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Limit cannot exceed 100');
    });

    test('should fail without authentication', async () => {
      const response = await app.request('/api/search/history', {
        method: 'GET'
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/search/:queryId/results', () => {
    let searchQueryId;

    beforeEach(async () => {
      const prisma = dbClient.getClient();
      const searchQuery = await prisma.searchQuery.create({
        data: {
          userId: testUsers[0].id,
          query: 'results test query',
          metadata: { graph_id: 'planned-supervisor-agent' }
        }
      });
      searchQueryId = searchQuery.id;

      await prisma.searchResult.createMany({
        data: [
          {
            queryId: searchQuery.id,
            userId: testUsers[0].id,
            threadId: 'results-thread-1',
            title: 'Result 1',
            content: 'Content 1',
            score: 0.9,
            sourceService: 'ira'
          },
          {
            queryId: searchQuery.id,
            userId: testUsers[0].id,
            threadId: 'results-thread-2',
            title: 'Result 2',
            content: 'Content 2',
            score: 0.8,
            sourceService: 'ira'
          }
        ]
      });
    });

    test('should get search results for a query', async () => {
      const response = await app.request(`/api/search/${searchQueryId}/results`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.queryId).toBe(searchQueryId);
      expect(data.data.totalResults).toBe(2);
      expect(data.data.results).toHaveLength(2);
      expect(data.data.results[0].score).toBe(0.9); // Sorted by score desc
    });

    test('should fail for non-existent query', async () => {
      const response = await app.request('/api/search/non-existent-id/results', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(404);
    });

    test('should fail when user tries to access another user\'s results', async () => {
      const response = await app.request(`/api/search/${searchQueryId}/results`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[1]}`
        }
      });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/search/:queryId', () => {
    let searchQueryId;

    beforeEach(async () => {
      const prisma = dbClient.getClient();
      const searchQuery = await prisma.searchQuery.create({
        data: {
          userId: testUsers[0].id,
          query: 'query details test',
          metadata: { graph_id: 'planned-supervisor-agent' }
        }
      });
      searchQueryId = searchQuery.id;

      await prisma.searchResult.create({
        data: {
          queryId: searchQuery.id,
          userId: testUsers[0].id,
          threadId: 'details-thread-1',
          title: 'Details Result',
          content: 'Content for details',
          score: 0.9,
          sourceService: 'ira'
        }
      });
    });

    test('should get query details with sample results', async () => {
      const response = await app.request(`/api/search/${searchQueryId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.queryId).toBe(searchQueryId);
      expect(data.data.query).toBe('query details test');
      expect(data.data.totalResults).toBe(1);
      expect(data.data.sampleResults).toHaveLength(1);
    });
  });

  describe('DELETE /api/search/:queryId', () => {
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
      const response = await app.request(`/api/search/${searchQueryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.deletedQueryId).toBe(searchQueryId);
      expect(data.data.deletedResultsCount).toBe(1);

      // Verify deletion by trying to fetch the query
      const getResponse = await app.request(`/api/search/${searchQueryId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(getResponse.status).toBe(404);
    });

    test('should fail for non-existent query', async () => {
      const response = await app.request('/api/search/non-existent-id', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(404);
    });

    test('should fail when user tries to delete another user\'s query', async () => {
      const response = await app.request(`/api/search/${searchQueryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authTokens[1]}`
        }
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Authentication and Authorization', () => {
    test('should require authentication for all endpoints', async () => {
      const endpoints = [
        { method: 'POST', path: '/api/search' },
        { method: 'GET', path: '/api/search/history' },
        { method: 'GET', path: '/api/search/test-id/results' },
        { method: 'GET', path: '/api/search/test-id' },
        { method: 'DELETE', path: '/api/search/test-id' }
      ];

      for (const endpoint of endpoints) {
        const response = await app.request(endpoint.path, {
          method: endpoint.method,
          headers: { 'Content-Type': 'application/json' }
        });

        expect(response.status).toBe(401);
      }
    });

    test('should reject invalid JWT tokens', async () => {
      const response = await app.request('/api/search/history', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });

      expect(response.status).toBe(401);
    });
  });
});