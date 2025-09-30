const { Hono } = require('hono');
const { searchService, SearchNotFoundError, SearchValidationError, SearchServiceError } = require('../services/searchService');
const { localJwtAuthMiddleware } = require('../middleware/localAuth');
const { PaginationValidationError } = require('../utils/pagination');
const { getSSeManager } = require('../sse/sseManager');

const search = new Hono();

search.use('/*', localJwtAuthMiddleware());

/**
 * POST /api/search/stream
 * Perform a streaming search using IRA backend service with two-step flow
 */
search.post('/stream', async (c) => {
  try {
    const user = c.get('user');
    const authToken = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!authToken) {
      return c.json({
        success: false,
        error: 'Authentication token required'
      }, 401);
    }

    const searchParams = await c.req.json();

    // Validate required fields
    if (!searchParams.query) {
      return c.json({
        success: false,
        error: 'Search query is required'
      }, 400);
    }

    const searchResults = await searchService.performStreamingSearch(
      searchParams,
      user,
      authToken
    );

    return c.json({
      success: true,
      data: searchResults
    }, 200);

  } catch (error) {
    if (error instanceof SearchValidationError) {
      console.error('Streaming search validation error:', error);
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    if (error instanceof SearchServiceError) {
      console.error('Streaming search service error:', error);
      return c.json({
        success: false,
        error: error.message
      }, 503);
    }

    console.error('Streaming search endpoint error:', error);
    return c.json({
      success: false,
      error: 'Streaming search operation failed'
    }, 500);
  }
});

/**
 * GET /api/search/stream/:searchId
 * Establish SSE connection for real-time search results
 */
search.get('/stream/:searchId', async (c) => {
  try {
    const user = c.get('user');
    const searchId = c.req.param('searchId');

    console.log(`[SSE] Establishing connection for search ${searchId}, user ${user.id}`);

    // Verify search ownership
    const searchQuery = await searchService.getSearchById(searchId, user.id);

    console.log(`[SSE] Search verified, creating connection...`);

    // Get SSE manager
    const sseManager = getSSeManager();

    // Set SSE headers
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');

    // Create a custom response that keeps the connection open
    return new Response(
      new ReadableStream({
        start(controller) {
          // Create SSE connection with the controller
          const connection = sseManager.addConnection(searchId, user.id, {
            write: (data) => {
              try {
                controller.enqueue(new TextEncoder().encode(data));
              } catch (error) {
                console.error('SSE write error:', error);
              }
            },
            end: () => {
              try {
                controller.close();
              } catch (error) {
                console.error('SSE close error:', error);
              }
            },
            on: (event, callback) => {
              // Mock response events for compatibility
              if (event === 'close') {
                // Handle client disconnect
              }
            }
          });

          // Store connection reference for cleanup
          c.set('sseConnection', connection);
        },
        cancel() {
          const connection = c.get('sseConnection');
          if (connection) {
            sseManager.removeConnection(connection);
          }
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        }
      }
    );

  } catch (error) {
    if (error instanceof SearchNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof SearchValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('SSE stream endpoint error:', error);
    return c.json({
      success: false,
      error: 'Failed to establish stream connection'
    }, 500);
  }
});

/**
 * POST /api/search
 * Perform a search using IRA backend service
 */
search.post('/', async (c) => {
  try {
    const user = c.get('user');
    const authToken = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!authToken) {
      return c.json({
        success: false,
        error: 'Authentication token required'
      }, 401);
    }

    const searchParams = await c.req.json();

    // Validate required fields
    if (!searchParams.query) {
      return c.json({
        success: false,
        error: 'Search query is required'
      }, 400);
    }

    const searchResults = await searchService.performSearch(
      searchParams,
      user.id,
      authToken
    );

    return c.json({
      success: true,
      data: searchResults
    }, 200);

  } catch (error) {
    if (error instanceof SearchValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    if (error instanceof SearchServiceError) {
      return c.json({
        success: false,
        error: error.message
      }, 503);
    }

    console.error('Search endpoint error:', error);
    return c.json({
      success: false,
      error: 'Search operation failed'
    }, 500);
  }
});

/**
 * GET /api/search/history
 * Get user's search history
 */
search.get('/history', async (c) => {
  try {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit')) || 10;
    const offset = parseInt(c.req.query('offset')) || 0;

    if (limit > 100) {
      return c.json({
        success: false,
        error: 'Limit cannot exceed 100'
      }, 400);
    }

    const searchHistory = await searchService.getUserSearchHistory(
      user.id,
      limit,
      offset
    );

    return c.json({
      success: true,
      data: searchHistory
    });

  } catch (error) {
    if (error instanceof SearchValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Search history endpoint error:', error);
    return c.json({
      success: false,
      error: 'Failed to retrieve search history'
    }, 500);
  }
});

/**
 * GET /api/search/:queryId/results
 * Get detailed results for a specific search query
 */
search.get('/:queryId/results', async (c) => {
  try {
    const user = c.get('user');
    const queryId = c.req.param('queryId');
    const limit = parseInt(c.req.query('limit')) || 20;
    const offset = parseInt(c.req.query('offset')) || 0;

    if (limit > 100) {
      return c.json({
        success: false,
        error: 'Limit cannot exceed 100'
      }, 400);
    }

    const searchResults = await searchService.getSearchResults(
      queryId,
      user.id,
      limit,
      offset
    );

    return c.json({
      success: true,
      data: searchResults
    });

  } catch (error) {
    if (error instanceof SearchNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof SearchValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Search results endpoint error:', error);
    return c.json({
      success: false,
      error: 'Failed to retrieve search results'
    }, 500);
  }
});

/**
 * DELETE /api/search/:queryId
 * Delete a search query and its results
 */
search.delete('/:queryId', async (c) => {
  try {
    const user = c.get('user');
    const queryId = c.req.param('queryId');

    const result = await searchService.deleteSearchQuery(queryId, user.id);

    return c.json({
      success: true,
      data: result
    });

  } catch (error) {
    if (error instanceof SearchNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof SearchValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Search delete endpoint error:', error);
    return c.json({
      success: false,
      error: 'Failed to delete search query'
    }, 500);
  }
});

/**
 * GET /api/search/:queryId
 * Get search query details
 */
search.get('/:queryId', async (c) => {
  try {
    const user = c.get('user');
    const queryId = c.req.param('queryId');

    // Get just the basic query info (first page of results)
    const searchResults = await searchService.getSearchResults(
      queryId,
      user.id,
      5, // Just show first 5 results for query overview
      0
    );

    return c.json({
      success: true,
      data: {
        queryId: searchResults.queryId,
        query: searchResults.query,
        createdAt: searchResults.createdAt,
        totalResults: searchResults.totalResults,
        sampleResults: searchResults.results
      }
    });

  } catch (error) {
    if (error instanceof SearchNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof SearchValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Search query endpoint error:', error);
    return c.json({
      success: false,
      error: 'Failed to retrieve search query'
    }, 500);
  }
});

/**
 * GET /api/search/my
 * Get personal search list with pagination and sorting
 */
search.get('/my', async (c) => {
  try {
    const user = c.get('user');
    const queryParams = {
      page: c.req.query('page'),
      limit: c.req.query('limit'),
      sort: c.req.query('sort'),
      status: c.req.query('status'),
      from: c.req.query('from'),
      to: c.req.query('to')
    };

    const searchList = await searchService.getPersonalSearchList(user.id, queryParams);

    return c.json({
      success: true,
      ...searchList
    });

  } catch (error) {
    if (error instanceof SearchValidationError || error instanceof PaginationValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Personal search list endpoint error:', error);
    return c.json({
      success: false,
      error: 'Failed to retrieve personal search list'
    }, 500);
  }
});

/**
 * GET /api/search/team/:teamId
 * Get team search list with pagination and sorting
 * Requires team membership verification
 */
search.get('/team/:teamId', async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('teamId');

    const queryParams = {
      page: c.req.query('page'),
      limit: c.req.query('limit'),
      sort: c.req.query('sort'),
      status: c.req.query('status'),
      from: c.req.query('from'),
      to: c.req.query('to')
    };

    const searchList = await searchService.getTeamSearchList(teamId, user.id, queryParams);

    return c.json({
      success: true,
      ...searchList
    });

  } catch (error) {
    if (error instanceof SearchValidationError || error instanceof PaginationValidationError) {
      // Check if it's an access denied error (team membership)
      if (error.message.includes('Access denied')) {
        return c.json({
          success: false,
          error: error.message
        }, 403);
      }

      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Team search list endpoint error:', error);
    return c.json({
      success: false,
      error: 'Failed to retrieve team search list'
    }, 500);
  }
});

module.exports = search;