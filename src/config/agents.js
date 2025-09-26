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
    agents: {
      'invest-research': {
        name: 'Invest Research Agent',
        url: process.env.INVEST_RESEARCH_AGENT_URL,
      },
      'hemera': {
        name: 'Hemera Agent',
        url: process.env.HEMERA_AGENT_URL,
      }
    },
    activeAgent: process.env.ACTIVE_AGENT
  };
};

const validateAgentConfig = () => {
  const requiredEnvVars = [
    'INVEST_RESEARCH_AGENT_URL',
    'HEMERA_AGENT_URL',
    'ACTIVE_AGENT'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  const validAgents = ['invest-research', 'hemera'];
  const activeAgent = process.env.ACTIVE_AGENT;
  if (!validAgents.includes(activeAgent)) {
    throw new Error(`Invalid ACTIVE_AGENT value: ${activeAgent}. Must be one of: ${validAgents.join(', ')}`);
  }

  // Validate URLs are properly formatted
  const agentConfig = getAgentConfig();
  Object.entries(agentConfig.agents).forEach(([key, agent]) => {
    try {
      new URL(agent.url);
    } catch (error) {
      throw new Error(`Invalid URL for ${agent.name}: ${agent.url}`);
    }
  });

  return true;
};

const getActiveAgent = () => {
  validateAgentConfig();
  const agentConfig = getAgentConfig();
  const activeAgentKey = agentConfig.activeAgent;
  return agentConfig.agents[activeAgentKey];
};

const getAllAgents = () => {
  const agentConfig = getAgentConfig();
  return agentConfig.agents;
};

const currentEnv = process.env.NODE_ENV || 'development';

module.exports = {
  ...config[currentEnv],
  getAgentConfig,
  validateAgentConfig,
  getActiveAgent,
  getAllAgents
};