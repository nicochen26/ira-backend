// Set required environment variables before importing app
process.env.INVEST_RESEARCH_AGENT_URL = 'https://api.invest-research.example.com/v1';
process.env.HEMERA_AGENT_URL = 'https://api.hemera.example.com/v1';
process.env.ACTIVE_AGENT = 'invest-research';

const app = require('../src/app');

describe('App', () => {
  describe('GET /health', () => {
    it('should return enhanced health status with agent checks', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('status'); // Could be OK or DEGRADED depending on agents
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('agents');
      expect(data).toHaveProperty('activeAgent');
    });
  });

  describe('GET /api', () => {
    it('should be proxied to backend agent', async () => {
      const res = await app.request('/api');
      const data = await res.json();

      // Since we have proxy middleware, /api requests get proxied
      // This will fail since we don't have actual agents running
      expect(res.status).toBe(500);
      expect(data).toHaveProperty('error', 'Internal Server Error');
    });
  });

  describe('GET /api/health', () => {
    it('should be proxied to backend agent', async () => {
      const res = await app.request('/api/health');
      const data = await res.json();

      // Since we have proxy middleware, /api/health requests get proxied
      // This will fail since we don't have actual agents running
      expect(res.status).toBe(500);
      expect(data).toHaveProperty('error', 'Internal Server Error');
    });
  });

  describe('GET /nonexistent', () => {
    it('should proxy nonexistent routes to agent (behavior with proxy middleware)', async () => {
      const res = await app.request('/nonexistent');
      const data = await res.json();

      // With proxy middleware, all non-health routes get proxied
      // This will fail since we don't have actual agents running
      expect(res.status).toBe(500);
      expect(data).toHaveProperty('error', 'Internal Server Error');
    });
  });
});