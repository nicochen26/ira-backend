const originalEnv = process.env;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Enhanced Health Check', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockClear();

    // Set up environment variables
    process.env = {
      ...originalEnv,
      INVEST_RESEARCH_AGENT_URL: 'https://api.invest-research.example.com/v1',
      HEMERA_AGENT_URL: 'https://api.hemera.example.com/v1',
      ACTIVE_AGENT: 'invest-research'
    };

    // Import app after setting env vars
    app = require('../src/app');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('GET /health with agent connectivity', () => {
    it('should return OK status when all agents are healthy', async () => {
      // Mock successful health checks for both agents
      mockFetch
        .mockResolvedValueOnce(new Response('{}', { status: 200, ok: true })) // invest-research
        .mockResolvedValueOnce(new Response('{}', { status: 200, ok: true })); // hemera

      const res = await app.request('/health');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('OK');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('agents');
      expect(data).toHaveProperty('activeAgent', 'invest-research');
      expect(data.agents).toHaveLength(2);

      // Check agent details
      const investAgent = data.agents.find(agent => agent.name === 'invest-research');
      const hemeraAgent = data.agents.find(agent => agent.name === 'hemera');

      expect(investAgent).toMatchObject({
        name: 'invest-research',
        url: 'https://api.invest-research.example.com/v1',
        status: 'healthy',
        httpStatus: 200,
        isActive: true
      });

      expect(hemeraAgent).toMatchObject({
        name: 'hemera',
        url: 'https://api.hemera.example.com/v1',
        status: 'healthy',
        httpStatus: 200,
        isActive: false
      });
    });

    it('should return DEGRADED status when some agents are unhealthy', async () => {
      // Mock one successful and one failed health check
      mockFetch
        .mockResolvedValueOnce(new Response('{}', { status: 200, ok: true })) // invest-research healthy
        .mockResolvedValueOnce(new Response('{}', { status: 500, ok: false })); // hemera unhealthy

      const res = await app.request('/health');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('DEGRADED');
      expect(data.agents).toHaveLength(2);

      const investAgent = data.agents.find(agent => agent.name === 'invest-research');
      const hemeraAgent = data.agents.find(agent => agent.name === 'hemera');

      expect(investAgent.status).toBe('healthy');
      expect(hemeraAgent.status).toBe('unhealthy');
      expect(hemeraAgent.httpStatus).toBe(500);
    });

    it('should return DEGRADED status when agents are unreachable', async () => {
      // Mock network errors
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused')) // invest-research unreachable
        .mockResolvedValueOnce(new Response('{}', { status: 200, ok: true })); // hemera healthy

      const res = await app.request('/health');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('DEGRADED');
      expect(data.agents).toHaveLength(2);

      const investAgent = data.agents.find(agent => agent.name === 'invest-research');
      const hemeraAgent = data.agents.find(agent => agent.name === 'hemera');

      expect(investAgent.status).toBe('unreachable');
      expect(investAgent.error).toBe('Connection refused');
      expect(hemeraAgent.status).toBe('healthy');
    });

    it('should include response time measurements', async () => {
      // Mock health checks with delays
      mockFetch
        .mockImplementationOnce(() =>
          new Promise(resolve => setTimeout(() => resolve(new Response('{}', { status: 200, ok: true })), 100))
        )
        .mockImplementationOnce(() =>
          new Promise(resolve => setTimeout(() => resolve(new Response('{}', { status: 200, ok: true })), 50))
        );

      const res = await app.request('/health');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.agents).toHaveLength(2);

      data.agents.forEach(agent => {
        expect(agent).toHaveProperty('responseTime');
        expect(typeof agent.responseTime).toBe('number');
        expect(agent.responseTime).toBeGreaterThan(0);
      });
    });

    it('should identify the correct active agent', async () => {
      // Change active agent to hemera
      process.env.ACTIVE_AGENT = 'hemera';

      // Mock successful health checks
      mockFetch
        .mockResolvedValueOnce(new Response('{}', { status: 200, ok: true }))
        .mockResolvedValueOnce(new Response('{}', { status: 200, ok: true }));

      const res = await app.request('/health');
      const data = await res.json();

      expect(data.activeAgent).toBe('hemera');

      const investAgent = data.agents.find(agent => agent.name === 'invest-research');
      const hemeraAgent = data.agents.find(agent => agent.name === 'hemera');

      expect(investAgent.isActive).toBe(false);
      expect(hemeraAgent.isActive).toBe(true);
    });

    it('should handle all agents being unreachable', async () => {
      // Mock all agents failing
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const res = await app.request('/health');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('DEGRADED');
      expect(data.agents).toHaveLength(2);
      expect(data.agents.every(agent => agent.status === 'unreachable')).toBe(true);
    });
  });
});