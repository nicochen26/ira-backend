const originalEnv = process.env;

describe('Agent Configuration', () => {
  let getAgentConfig, validateAgentConfig, getActiveAgent, getAllAgents;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    // Set valid environment variables
    process.env.INVEST_RESEARCH_AGENT_URL = 'https://api.invest-research.example.com/v1';
    process.env.HEMERA_AGENT_URL = 'https://api.hemera.example.com/v1';
    process.env.ACTIVE_AGENT = 'invest-research';

    // Reload the module after setting env vars
    const config = require('../../src/config/agents');
    getAgentConfig = config.getAgentConfig;
    validateAgentConfig = config.validateAgentConfig;
    getActiveAgent = config.getActiveAgent;
    getAllAgents = config.getAllAgents;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateAgentConfig', () => {
    it('should pass with valid configuration', () => {
      expect(() => validateAgentConfig()).not.toThrow();
    });

    it('should throw error when INVEST_RESEARCH_AGENT_URL is missing', () => {
      delete process.env.INVEST_RESEARCH_AGENT_URL;
      expect(() => validateAgentConfig()).toThrow('Missing required environment variables: INVEST_RESEARCH_AGENT_URL');
    });

    it('should throw error when HEMERA_AGENT_URL is missing', () => {
      delete process.env.HEMERA_AGENT_URL;
      expect(() => validateAgentConfig()).toThrow('Missing required environment variables: HEMERA_AGENT_URL');
    });

    it('should throw error when ACTIVE_AGENT is missing', () => {
      delete process.env.ACTIVE_AGENT;
      expect(() => validateAgentConfig()).toThrow('Missing required environment variables: ACTIVE_AGENT');
    });

    it('should throw error when ACTIVE_AGENT has invalid value', () => {
      process.env.ACTIVE_AGENT = 'invalid-agent';
      expect(() => validateAgentConfig()).toThrow('Invalid ACTIVE_AGENT value: invalid-agent. Must be one of: invest-research, hemera');
    });

    it('should throw error when agent URL is invalid', () => {
      process.env.INVEST_RESEARCH_AGENT_URL = 'invalid-url';
      expect(() => validateAgentConfig()).toThrow('Invalid URL for Invest Research Agent: invalid-url');
    });

    it('should accept hemera as active agent', () => {
      process.env.ACTIVE_AGENT = 'hemera';
      expect(() => validateAgentConfig()).not.toThrow();
    });
  });

  describe('getActiveAgent', () => {
    it('should return the active agent configuration', () => {
      const activeAgent = getActiveAgent();
      expect(activeAgent).toEqual({
        name: 'Invest Research Agent',
        url: 'https://api.invest-research.example.com/v1'
      });
    });

    it('should return hemera agent when ACTIVE_AGENT is hemera', () => {
      process.env.ACTIVE_AGENT = 'hemera';
      const activeAgent = getActiveAgent();
      expect(activeAgent).toEqual({
        name: 'Hemera Agent',
        url: 'https://api.hemera.example.com/v1'
      });
    });
  });

  describe('getAllAgents', () => {
    it('should return all configured agents', () => {
      const allAgents = getAllAgents();
      expect(allAgents).toEqual({
        'invest-research': {
          name: 'Invest Research Agent',
          url: 'https://api.invest-research.example.com/v1'
        },
        'hemera': {
          name: 'Hemera Agent',
          url: 'https://api.hemera.example.com/v1'
        }
      });
    });
  });
});