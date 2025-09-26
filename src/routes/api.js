const { Hono } = require('hono');

const api = new Hono();

// Health check for API
api.get('/health', (c) => {
  return c.json({
    status: 'API OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Welcome endpoint
api.get('/', (c) => {
  return c.json({
    message: 'Welcome to IRA Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      docs: '/api/docs'
    }
  });
});

module.exports = api;