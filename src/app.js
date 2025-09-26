const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
require('dotenv').config();

const app = new Hono();
const PORT = process.env.PORT || 3000;

// Middleware for logging (built-in logger)
const { logger } = require('hono/logger');
const { cors } = require('hono/cors');
const { secureHeaders } = require('hono/secure-headers');

// Apply middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', secureHeaders());

// Routes
const apiRoutes = require('./routes/api');
app.route('/api', apiRoutes);

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested resource was not found'
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  }, 500);
});

// Start server
if (require.main === module) {
  serve({
    fetch: app.fetch,
    port: PORT
  }, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

module.exports = app;