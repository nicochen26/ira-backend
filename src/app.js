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
app.route('/api', apiRoutes);

// Health check endpoint
const { getAllAgents } = require('./config/agents');

app.get('/health', async (c) => {
  const baseHealth = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };

  try {
    // Get all configured agents
    const allAgents = getAllAgents();

    // Check connectivity to all agents
    const agentChecks = await Promise.allSettled(
      Object.entries(allAgents).map(async ([key, agent]) => {
        const startTime = Date.now();
        try {
          // Try to connect to agent's health endpoint (assume /health)
          const response = await fetch(`${agent.url}/health`, {
            method: 'GET',
            timeout: 5000, // 5 second timeout
            headers: {
              'Accept': 'application/json'
            }
          });

          const duration = Date.now() - startTime;

          return {
            name: key,
            url: agent.url,
            status: response.ok ? 'healthy' : 'unhealthy',
            httpStatus: response.status,
            responseTime: duration,
            isActive: key === process.env.ACTIVE_AGENT
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          return {
            name: key,
            url: agent.url,
            status: 'unreachable',
            error: error.message,
            responseTime: duration,
            isActive: key === process.env.ACTIVE_AGENT
          };
        }
      })
    );

    // Process the results
    const agents = agentChecks.map(result => result.value || result.reason);
    const hasUnhealthyAgents = agents.some(agent => agent.status !== 'healthy');

    return c.json({
      ...baseHealth,
      status: hasUnhealthyAgents ? 'DEGRADED' : 'OK',
      agents,
      activeAgent: process.env.ACTIVE_AGENT
    });

  } catch (error) {
    console.error('Health check error:', error);

    return c.json({
      ...baseHealth,
      status: 'ERROR',
      error: 'Failed to check agent connectivity',
      agents: [],
      activeAgent: process.env.ACTIVE_AGENT
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