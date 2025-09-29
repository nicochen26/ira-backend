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

  describe('getPersonalSearchList', () => {
    let personalTestUser;
    let personalSearchQueries = [];

    beforeEach(async () => {
      // Create test user for personal search list tests
      const uniqueId = Date.now() + Math.random();
      personalTestUser = await userService.createUser({
        name: 'Personal Search User',
        email: `personal${uniqueId}@searchlisttest.com`
      });

      // Create multiple search queries for testing
      const prisma = dbClient.getClient();
      personalSearchQueries = [];

      for (let i = 0; i < 5; i++) {
        const searchQuery = await prisma.searchQuery.create({
          data: {
            userId: personalTestUser.id,
            query: `Test query ${i + 1}`,
            metadata: { graph_id: 'planned-supervisor-agent' }
          }
        });
        personalSearchQueries.push(searchQuery);

        // Create some results for each query
        await prisma.searchResult.create({
          data: {
            queryId: searchQuery.id,
            userId: personalTestUser.id,
            threadId: `thread-${i + 1}`,
            title: `Result for query ${i + 1}`,
            content: `Content for search result ${i + 1}`,
            score: 0.9 - (i * 0.1),
            sourceService: 'ira'
          }
        });
      }
    });

    test('should get personal search list with default pagination', async () => {
      const result = await searchService.getPersonalSearchList(personalTestUser.id);

      expect(result.data).toHaveLength(5);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);

      // Check data structure
      expect(result.data[0]).toHaveProperty('id');
      expect(result.data[0]).toHaveProperty('topic');
      expect(result.data[0]).toHaveProperty('createdAt');
      expect(result.data[0]).toHaveProperty('userId');
      expect(result.data[0]).toHaveProperty('resultCount');
    });

    test('should respect pagination parameters', async () => {
      const result = await searchService.getPersonalSearchList(personalTestUser.id, {
        page: 1,
        limit: 2
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
    });

    test('should sort by createdAt desc by default', async () => {
      const result = await searchService.getPersonalSearchList(personalTestUser.id);

      expect(result.meta.sortBy).toBe('createdAt');
      expect(result.meta.sortOrder).toBe('desc');

      // Verify the order (newest first)
      const dates = result.data.map(item => new Date(item.createdAt));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i-1].getTime()).toBeGreaterThanOrEqual(dates[i].getTime());
      }
    });

    test('should support custom sorting', async () => {
      const result = await searchService.getPersonalSearchList(personalTestUser.id, {
        sort: 'query:asc'
      });

      expect(result.meta.sortBy).toBe('query');
      expect(result.meta.sortOrder).toBe('asc');
    });

    test('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const result = await searchService.getPersonalSearchList(personalTestUser.id, {
        from: yesterday.toISOString(),
        to: tomorrow.toISOString()
      });

      expect(result.data.length).toBe(5);
      expect(result.meta.filters.from).toBeInstanceOf(Date);
      expect(result.meta.filters.to).toBeInstanceOf(Date);
    });

    test('should throw validation error for missing user ID', async () => {
      await expect(searchService.getPersonalSearchList(null))
        .rejects.toThrow('User ID is required');
    });

    test('should return empty list for user with no searches', async () => {
      const uniqueId = Date.now() + Math.random();
      const newUser = await userService.createUser({
        name: 'No Searches User',
        email: `nosearches${uniqueId}@searchlisttest.com`
      });

      const result = await searchService.getPersonalSearchList(newUser.id);

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getTeamSearchList', () => {
    let teamTestUsers = [];
    let testTeam;
    let teamSearchQueries = [];

    beforeEach(async () => {
      const prisma = dbClient.getClient();
      const uniqueId = Date.now() + Math.random();

      // Create test team
      teamTestUsers = [
        await userService.createUser({ name: 'Team Member 1', email: `member1${uniqueId}@teamtest.com` }),
        await userService.createUser({ name: 'Team Member 2', email: `member2${uniqueId}@teamtest.com` }),
        await userService.createUser({ name: 'Non Member', email: `nonmember${uniqueId}@teamtest.com` })
      ];

      testTeam = await prisma.team.create({
        data: {
          name: 'Test Team',
          description: 'Team for search list testing',
          ownerId: teamTestUsers[0].id
        }
      });

      // Add team members
      await prisma.teamMember.createMany({
        data: [
          { teamId: testTeam.id, userId: teamTestUsers[0].id, role: 'owner' },
          { teamId: testTeam.id, userId: teamTestUsers[1].id, role: 'member' }
        ]
      });

      // Create search queries from team members
      teamSearchQueries = [];
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 3; j++) {
          const searchQuery = await prisma.searchQuery.create({
            data: {
              userId: teamTestUsers[i].id,
              query: `Team query from user ${i + 1} - ${j + 1}`,
              metadata: { graph_id: 'planned-supervisor-agent' }
            }
          });
          teamSearchQueries.push(searchQuery);

          // Create a result for each query
          await prisma.searchResult.create({
            data: {
              queryId: searchQuery.id,
              userId: teamTestUsers[i].id,
              threadId: `team-thread-${i}-${j}`,
              title: `Team result from user ${i + 1}`,
              content: `Team content ${i + 1}-${j + 1}`,
              score: 0.8,
              sourceService: 'ira'
            }
          });
        }
      }
    });

    test('should get team search list for team member', async () => {
      const result = await searchService.getTeamSearchList(testTeam.id, teamTestUsers[0].id);

      expect(result.data).toHaveLength(6); // 3 queries from each of 2 team members
      expect(result.pagination.total).toBe(6);
      expect(result.meta.teamId).toBe(testTeam.id);

      // Check data structure includes user name
      expect(result.data[0]).toHaveProperty('id');
      expect(result.data[0]).toHaveProperty('topic');
      expect(result.data[0]).toHaveProperty('userId');
      expect(result.data[0]).toHaveProperty('userName');
      expect(result.data[0]).toHaveProperty('resultCount');
    });

    test('should respect pagination for team searches', async () => {
      const result = await searchService.getTeamSearchList(testTeam.id, teamTestUsers[0].id, {
        page: 1,
        limit: 3
      });

      expect(result.data).toHaveLength(3);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(3);
      expect(result.pagination.total).toBe(6);
      expect(result.pagination.hasNext).toBe(true);
    });

    test('should sort by userName when specified', async () => {
      const result = await searchService.getTeamSearchList(testTeam.id, teamTestUsers[0].id, {
        sort: 'userName:asc'
      });

      expect(result.meta.sortBy).toBe('userName');
      expect(result.meta.sortOrder).toBe('asc');

      // Verify the order
      const userNames = result.data.map(item => item.userName);
      const sortedNames = [...userNames].sort();
      expect(userNames).toEqual(sortedNames);
    });

    test('should deny access to non-team members', async () => {
      await expect(
        searchService.getTeamSearchList(testTeam.id, teamTestUsers[2].id)
      ).rejects.toThrow('Access denied: User is not a member of this team');
    });

    test('should throw validation error for missing team ID', async () => {
      await expect(
        searchService.getTeamSearchList(null, teamTestUsers[0].id)
      ).rejects.toThrow('Team ID is required');
    });

    test('should throw validation error for missing user ID', async () => {
      await expect(
        searchService.getTeamSearchList(testTeam.id, null)
      ).rejects.toThrow('User ID is required');
    });
  });

  describe('isUserTeamMember', () => {
    let memberTestUser, nonMemberTestUser, testTeam;

    beforeEach(async () => {
      const prisma = dbClient.getClient();
      const uniqueId = Date.now() + Math.random();

      memberTestUser = await userService.createUser({
        name: 'Member User',
        email: `member${uniqueId}@teamtest.com`
      });
      nonMemberTestUser = await userService.createUser({
        name: 'Non Member User',
        email: `nonmember${uniqueId}@teamtest.com`
      });

      testTeam = await prisma.team.create({
        data: {
          name: 'Membership Test Team',
          description: 'Team for membership testing',
          ownerId: memberTestUser.id
        }
      });

      await prisma.teamMember.create({
        data: {
          teamId: testTeam.id,
          userId: memberTestUser.id,
          role: 'owner'
        }
      });
    });

    test('should return true for team member', async () => {
      const result = await searchService.isUserTeamMember(memberTestUser.id, testTeam.id);
      expect(result).toBe(true);
    });

    test('should return false for non-team member', async () => {
      const result = await searchService.isUserTeamMember(nonMemberTestUser.id, testTeam.id);
      expect(result).toBe(false);
    });
  });
});