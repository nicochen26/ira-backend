const { Hono } = require('hono');
const { jwtAuthMiddleware, getCurrentUser } = require('../middleware/auth');

const app = new Hono();

// Apply JWT middleware to all routes in this file
app.use('*', jwtAuthMiddleware());

/**
 * GET /api/protected/profile
 * Get current user profile (protected endpoint)
 */
app.get('/profile', async (c) => {
  const user = getCurrentUser(c);

  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    },
    message: 'This is a protected endpoint'
  });
});

/**
 * GET /api/protected/test
 * Simple test endpoint to verify JWT middleware
 */
app.get('/test', async (c) => {
  const user = getCurrentUser(c);

  return c.json({
    success: true,
    message: `Hello ${user.name}, you are authenticated!`,
    timestamp: new Date().toISOString()
  });
});

module.exports = app;