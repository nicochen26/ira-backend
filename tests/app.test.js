const app = require('../src/app');

describe('App', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('status', 'OK');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
    });
  });

  describe('GET /api', () => {
    it('should return API welcome message', async () => {
      const res = await app.request('/api');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('message', 'Welcome to IRA Backend API');
      expect(data).toHaveProperty('version', '1.0.0');
    });
  });

  describe('GET /api/health', () => {
    it('should return API health status', async () => {
      const res = await app.request('/api/health');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('status', 'API OK');
      expect(data).toHaveProperty('timestamp');
    });
  });

  describe('GET /nonexistent', () => {
    it('should return 404 for nonexistent routes', async () => {
      const res = await app.request('/nonexistent');
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data).toHaveProperty('error', 'Not Found');
    });
  });
});