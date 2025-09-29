const config = {
  development: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  production: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'production',
  },
  test: {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'test',
  }
};

const getAgentConfig = () => {
  return {
    services: {
      'ira': {
        name: 'IRA Service',
        url: process.env.IRA_BASE_URL,
        pathPrefix: '/api/ira'
      },
      'hap': {
        name: 'HAP Service',
        url: process.env.HAP_BASE_URL,
        pathPrefix: '/api/hap'
      }
    }
  };
};

const validateAgentConfig = () => {
  const requiredEnvVars = [
    'IRA_BASE_URL',
    'HAP_BASE_URL',
    'JWT_SECRET'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate URLs are properly formatted
  const agentConfig = getAgentConfig();
  Object.entries(agentConfig.services).forEach(([, service]) => {
    try {
      new URL(service.url);
    } catch (error) {
      throw new Error(`Invalid URL for ${service.name}: ${service.url}`);
    }
  });

  return true;
};

// Get service by path prefix
const getServiceByPath = (path) => {
  validateAgentConfig();
  const agentConfig = getAgentConfig();

  // Find matching service by path prefix
  for (const [key, service] of Object.entries(agentConfig.services)) {
    if (path.startsWith(service.pathPrefix)) {
      return {
        key,
        ...service,
        // Remove the prefix from the path for forwarding
        targetPath: path.replace(service.pathPrefix, '')
      };
    }
  }

  return null;
};

const getAllServices = () => {
  const agentConfig = getAgentConfig();
  return agentConfig.services;
};

const currentEnv = process.env.NODE_ENV || 'development';

module.exports = {
  ...config[currentEnv],
  getAgentConfig,
  validateAgentConfig,
  getServiceByPath,
  getAllServices
};