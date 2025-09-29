const dbClient = require('../db/client');

const getHealth = async (c) => {
  const dbHealth = await dbClient.healthCheck();

  return c.json({
    success: true,
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      database: dbHealth
    }
  });
};

const getApiHealth = (c) => {
  return c.json({
    success: true,
    data: {
      status: 'API OK',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  });
};

module.exports = {
  getHealth,
  getApiHealth
};