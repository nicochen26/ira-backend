const { Hono } = require('hono');
const { searchService, SearchNotFoundError, SearchValidationError, SearchServiceError } = require('../services/searchService');
const { jwtAuthMiddleware } = require('../middleware/auth');

const search = new Hono();

search.use('/*', jwtAuthMiddleware());

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

module.exports = search;