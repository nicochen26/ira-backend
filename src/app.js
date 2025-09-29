const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
require('dotenv').config();

// Validate agent configuration on startup
const { validateAgentConfig } = require('./config/agents');
try {
  validateAgentConfig();
} catch (error) {
  console.error('Agent configuration validation failed:', error.message);
  process.exit(1);
}

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

// Proxy middleware - apply to all routes except health
const { createProxyMiddleware } = require('./middleware/proxy');
app.use('*', createProxyMiddleware());

// Routes
const apiRoutes = require('./routes/api');
const exampleRoutes = require('./routes/examples');
const authRoutes = require('./routes/auth');
const threadsRoutes = require('./routes/threads');

app.route('/api', apiRoutes);
app.route('/api', exampleRoutes);
app.route('/api', authRoutes);
app.route('/api', threadsRoutes);

// Health check endpoint
const { getAllServices } = require('./config/agents');

app.get('/health', async (c) => {
  const baseHealth = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };

  try {
    // Get all configured services
    const allServices = getAllServices();

    // Check connectivity to all services
    const serviceChecks = await Promise.allSettled(
      Object.entries(allServices).map(async ([serviceKey, service]) => {
        const startTime = Date.now();
        try {
          // Try to connect to service's health endpoint (assume /health)
          const response = await fetch(`${service.url}/health`, {
            method: 'GET',
            timeout: 5000, // 5 second timeout
            headers: {
              'Accept': 'application/json'
            }
          });

          const duration = Date.now() - startTime;

          return {
            name: service.name,
            key: serviceKey,
            url: service.url,
            pathPrefix: service.pathPrefix,
            status: response.ok ? 'healthy' : 'unhealthy',
            httpStatus: response.status,
            responseTime: duration
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          return {
            name: service.name,
            key: serviceKey,
            url: service.url,
            pathPrefix: service.pathPrefix,
            status: 'unreachable',
            error: error.message,
            responseTime: duration
          };
        }
      })
    );

    // Process the results
    const services = serviceChecks.map(result => result.value || result.reason);
    const hasUnhealthyServices = services.some(service => service.status !== 'healthy');

    return c.json({
      ...baseHealth,
      status: hasUnhealthyServices ? 'DEGRADED' : 'OK',
      services,
      routingInfo: {
        description: 'Automatic path-based routing',
        routes: Object.entries(allServices).map(([key, service]) => ({
          path: `${service.pathPrefix}/*`,
          service: service.name,
          target: service.url
        }))
      }
    });

  } catch (error) {
    console.error('Health check error:', error);

    return c.json({
      ...baseHealth,
      status: 'ERROR',
      error: 'Failed to check service connectivity',
      services: []
    });
  }
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