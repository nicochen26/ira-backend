const { getServiceByPath, getAllServices, validateAgentConfig } = require('../../src/config/agents');

describe('Path-based Routing Configuration', () => {
  beforeEach(() => {
    // Ensure environment variables are set for tests
    process.env.IRA_BASE_URL = 'https://api.invest-research.example.com/v1';
    process.env.HAP_BASE_URL = 'https://api.hemera.example.com/v1';
  });

  describe('validateAgentConfig', () => {
    it('should validate required environment variables', () => {
      expect(() => validateAgentConfig()).not.toThrow();
    });

    it('should throw error for missing IRA_BASE_URL', () => {
      delete process.env.IRA_BASE_URL;
      expect(() => validateAgentConfig()).toThrow('Missing required environment variables: IRA_BASE_URL');
    });

    it('should throw error for missing HAP_BASE_URL', () => {
      delete process.env.HAP_BASE_URL;
      expect(() => validateAgentConfig()).toThrow('Missing required environment variables: HAP_BASE_URL');
    });

    it('should validate URL format', () => {
      process.env.IRA_BASE_URL = 'invalid-url';
      expect(() => validateAgentConfig()).toThrow('Invalid URL for IRA Service');
    });
  });

  describe('getServiceByPath', () => {
    it('should return IRA service for /api/ira paths', () => {
      const service = getServiceByPath('/api/ira/users');

      expect(service).toMatchObject({
        key: 'ira',
        name: 'IRA Service',
        url: 'https://api.invest-research.example.com/v1',
        pathPrefix: '/api/ira',
        targetPath: '/users'
      });
    });

    it('should return HAP service for /api/hap paths', () => {
      const service = getServiceByPath('/api/hap/reports');

      expect(service).toMatchObject({
        key: 'hap',
        name: 'HAP Service',
        url: 'https://api.hemera.example.com/v1',
        pathPrefix: '/api/hap',
        targetPath: '/reports'
      });
    });

    it('should remove path prefix correctly', () => {
      const testCases = [
        {
          input: '/api/ira/users/123',
          expected: '/users/123'
        },
        {
          input: '/api/hap/reports/monthly',
          expected: '/reports/monthly'
        },
        {
          input: '/api/ira',
          expected: ''
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const service = getServiceByPath(input);
        expect(service.targetPath).toBe(expected);
      });
    });

    it('should return null for non-matching paths', () => {
      const testCases = [
        '/api/unknown/path',
        '/health',
        '/api',
        '/api/other'
      ];

      testCases.forEach(path => {
        const service = getServiceByPath(path);
        expect(service).toBeNull();
      });
    });
  });

  describe('getAllServices', () => {
    it('should return all configured services', () => {
      const services = getAllServices();

      expect(services).toEqual({
        ira: {
          name: 'IRA Service',
          url: 'https://api.invest-research.example.com/v1',
          pathPrefix: '/api/ira'
        },
        hap: {
          name: 'HAP Service',
          url: 'https://api.hemera.example.com/v1',
          pathPrefix: '/api/hap'
        },
        auth: {
          name: 'Auth Service',
          url: 'https://api.auth.example.com/v1',
          pathPrefix: '/api/auth'
        }
      });
    });
  });
});