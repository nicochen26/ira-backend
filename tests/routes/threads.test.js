const { getServiceByPath } = require('../../src/config/agents');

describe('Threads Routes', () => {
  beforeEach(() => {
    // Setup test environment variables
    process.env.IRA_BASE_URL = 'https://api.invest-research.example.com/v1';
    process.env.HAP_BASE_URL = 'https://api.hemera.example.com/v1';
    process.env.AUTH_BASE_URL = 'https://api.auth.example.com/v1';
  });

  describe('Threads service routing', () => {
    it('should route /api/ira/threads/history to IRA service', () => {
      const service = getServiceByPath('/api/ira/threads/history');

      expect(service).toMatchObject({
        key: 'ira',
        name: 'IRA Service',
        url: 'https://api.invest-research.example.com/v1',
        pathPrefix: '/api/ira',
        targetPath: '/threads/history'
      });
    });

    it('should route /api/hap/threads/history to HAP service', () => {
      const service = getServiceByPath('/api/hap/threads/history');

      expect(service).toMatchObject({
        key: 'hap',
        name: 'HAP Service',
        url: 'https://api.hemera.example.com/v1',
        pathPrefix: '/api/hap',
        targetPath: '/threads/history'
      });
    });

    it('should handle query parameters in threads endpoints', () => {
      const testCases = [
        {
          input: '/api/ira/threads/history?limit=10&offset=0',
          expectedPath: '/threads/history',
          expectedService: 'ira'
        },
        {
          input: '/api/hap/threads/history?limit=50&offset=100',
          expectedPath: '/threads/history',
          expectedService: 'hap'
        }
      ];

      testCases.forEach(({ input, expectedPath, expectedService }) => {
        // Remove query parameters for routing test
        const pathWithoutQuery = input.split('?')[0];
        const service = getServiceByPath(pathWithoutQuery);

        expect(service).not.toBeNull();
        expect(service.targetPath).toBe(expectedPath);
        expect(service.key).toBe(expectedService);
      });
    });
  });

  describe('Path prefix removal', () => {
    it('should correctly remove prefixes for threads endpoints', () => {
      const testCases = [
        {
          input: '/api/ira/threads/history',
          expected: '/threads/history'
        },
        {
          input: '/api/hap/threads/history',
          expected: '/threads/history'
        },
        {
          input: '/api/ira/threads/create',
          expected: '/threads/create'
        },
        {
          input: '/api/hap/threads/123/messages',
          expected: '/threads/123/messages'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const service = getServiceByPath(input);
        expect(service).not.toBeNull();
        expect(service.targetPath).toBe(expected);
      });
    });
  });

  describe('Request routing validation', () => {
    it('should handle threads history requests with proper routing', () => {
      // Test IRA service
      const iraService = getServiceByPath('/api/ira/threads/history');
      expect(iraService).toEqual({
        key: 'ira',
        name: 'IRA Service',
        url: 'https://api.invest-research.example.com/v1',
        pathPrefix: '/api/ira',
        targetPath: '/threads/history'
      });

      // Test HAP service
      const hapService = getServiceByPath('/api/hap/threads/history');
      expect(hapService).toEqual({
        key: 'hap',
        name: 'HAP Service',
        url: 'https://api.hemera.example.com/v1',
        pathPrefix: '/api/hap',
        targetPath: '/threads/history'
      });
    });
  });
});