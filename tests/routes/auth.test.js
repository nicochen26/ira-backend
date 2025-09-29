const { getServiceByPath } = require('../../src/config/agents');

describe('Auth Routes', () => {
  beforeEach(() => {
    // Setup test environment variables
    process.env.IRA_BASE_URL = 'https://api.invest-research.example.com/v1';
    process.env.HAP_BASE_URL = 'https://api.hemera.example.com/v1';
    process.env.AUTH_BASE_URL = 'https://api.auth.example.com/v1';
  });

  describe('Auth service routing', () => {
    it('should route /api/auth/generate-token to Auth service', () => {
      const service = getServiceByPath('/api/auth/generate-token');

      expect(service).toMatchObject({
        key: 'auth',
        name: 'Auth Service',
        url: 'https://api.auth.example.com/v1',
        pathPrefix: '/api/auth',
        targetPath: '/generate-token'
      });
    });

    it('should remove auth prefix correctly for auth endpoints', () => {
      const testCases = [
        {
          input: '/api/auth/generate-token',
          expected: '/generate-token'
        },
        {
          input: '/api/auth/verify-token',
          expected: '/verify-token'
        },
        {
          input: '/api/auth/refresh',
          expected: '/refresh'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const service = getServiceByPath(input);
        expect(service).not.toBeNull();
        expect(service.targetPath).toBe(expected);
        expect(service.key).toBe('auth');
      });
    });
  });

  describe('Request validation', () => {
    it('should handle auth requests with proper routing', () => {
      const service = getServiceByPath('/api/auth/generate-token');

      expect(service).toEqual({
        key: 'auth',
        name: 'Auth Service',
        url: 'https://api.auth.example.com/v1',
        pathPrefix: '/api/auth',
        targetPath: '/generate-token'
      });
    });
  });
});