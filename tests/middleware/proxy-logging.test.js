const { createProxyMiddleware } = require('../../src/middleware/proxy');

// Mock the agents config
jest.mock('../../src/config/agents', () => ({
  getActiveAgent: jest.fn()
}));

const { getActiveAgent } = require('../../src/config/agents');

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console.log and console.error
const mockConsoleLog = jest.fn();
const mockConsoleError = jest.fn();

describe('Proxy Logging Functionality', () => {
  let middleware;
  let mockContext;
  let mockNext;
  let originalConsoleLog;
  let originalConsoleError;

  beforeEach(() => {
    mockFetch.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();

    // Mock console methods
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = mockConsoleLog;
    console.error = mockConsoleError;

    // Setup default active agent
    getActiveAgent.mockReturnValue({
      name: 'Test Agent',
      url: 'https://api.test.example.com/v1'
    });

    middleware = createProxyMiddleware();

    mockNext = jest.fn();
    mockContext = {
      req: {
        path: '/test-endpoint',
        method: 'POST',
        url: 'http://localhost:3000/test-endpoint?param=value',
        header: jest.fn().mockReturnValue([
          ['authorization', 'Bearer token'],
          ['content-type', 'application/json']
        ]),
        text: jest.fn().mockResolvedValue('{"request": "data"}')
      },
      json: jest.fn()
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('Request Logging', () => {
    it('should log detailed request information', async () => {
      const mockResponse = new Response('{"result": "success"}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Response-ID': '12345'
        }
      });

      mockFetch.mockResolvedValue(mockResponse);

      await middleware(mockContext, mockNext);

      // Verify request logging
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[PROXY] POST /test-endpoint -> https://api.test.example.com/v1/test-endpoint?param=value'
      );
    });

    it('should log requests with different HTTP methods', async () => {
      const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        mockConsoleLog.mockClear();
        mockContext.req.method = method;
        mockContext.req.path = `/test-${method.toLowerCase()}`;

        const mockResponse = new Response('{}', { status: 200 });
        mockFetch.mockResolvedValue(mockResponse);

        await middleware(mockContext, mockNext);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining(`[PROXY] ${method} /test-${method.toLowerCase()}`)
        );
      }
    });

    it('should log requests without query parameters', async () => {
      mockContext.req.url = 'http://localhost:3000/test-endpoint';

      const mockResponse = new Response('{}', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await middleware(mockContext, mockNext);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[PROXY] POST /test-endpoint -> https://api.test.example.com/v1/test-endpoint'
      );
    });
  });

  describe('Response Logging', () => {
    it('should log successful response with status and size', async () => {
      const responseBody = '{"result": "success", "data": {"key": "value"}}';
      const mockResponse = new Response(responseBody, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      mockFetch.mockResolvedValue(mockResponse);

      await middleware(mockContext, mockNext);

      // Verify response logging
      expect(mockConsoleLog).toHaveBeenCalledWith(
        `[PROXY] POST /test-endpoint <- 200 (${responseBody.length} bytes)`
      );
    });

    it('should log error responses with correct status codes', async () => {
      const errorResponse = '{"error": "Not found"}';
      const mockResponse = new Response(errorResponse, {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });

      mockFetch.mockResolvedValue(mockResponse);

      await middleware(mockContext, mockNext);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        `[PROXY] POST /test-endpoint <- 404 (${errorResponse.length} bytes)`
      );
    });

    it('should log different response sizes correctly', async () => {
      const testCases = [
        { body: '{}', expectedSize: 2 },
        { body: '{"small": "response"}', expectedSize: 21 },
        { body: '{"larger": "response", "with": {"nested": "objects", "and": ["arrays"]}}', expectedSize: 72 }
      ];

      for (const testCase of testCases) {
        mockConsoleLog.mockClear();

        const mockResponse = new Response(testCase.body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });

        mockFetch.mockResolvedValue(mockResponse);
        await middleware(mockContext, mockNext);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining(`<- 200 (${testCase.expectedSize} bytes)`)
        );
      }
    });
  });

  describe('Error Logging', () => {
    it('should log network connection errors with details', async () => {
      const networkError = new Error('Connection timeout');
      networkError.code = 'ECONNREFUSED';

      mockFetch.mockRejectedValue(networkError);

      await middleware(mockContext, mockNext);

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[PROXY ERROR] POST /test-endpoint:', 'Connection timeout'
      );
    });

    it('should log DNS resolution errors', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND api.test.example.com');
      dnsError.code = 'ENOTFOUND';

      mockFetch.mockRejectedValue(dnsError);

      await middleware(mockContext, mockNext);

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[PROXY ERROR] POST /test-endpoint:', 'getaddrinfo ENOTFOUND api.test.example.com'
      );
    });

    it('should log general proxy errors', async () => {
      const generalError = new Error('Request failed');
      mockFetch.mockRejectedValue(generalError);

      await middleware(mockContext, mockNext);

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[PROXY ERROR] POST /test-endpoint:', 'Request failed'
      );
    });

    it('should log errors for different paths and methods', async () => {
      const testCases = [
        { method: 'GET', path: '/users' },
        { method: 'PUT', path: '/users/123' },
        { method: 'DELETE', path: '/posts/456' }
      ];

      for (const testCase of testCases) {
        mockConsoleError.mockClear();
        mockContext.req.method = testCase.method;
        mockContext.req.path = testCase.path;

        const error = new Error('Service unavailable');
        mockFetch.mockRejectedValue(error);

        await middleware(mockContext, mockNext);

        expect(mockConsoleError).toHaveBeenCalledWith(
          `[PROXY ERROR] ${testCase.method} ${testCase.path}:`, 'Service unavailable'
        );
      }
    });
  });

  describe('Logging Integration', () => {
    it('should log complete request-response cycle', async () => {
      const mockResponse = new Response('{"success": true}', {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });

      mockFetch.mockResolvedValue(mockResponse);

      await middleware(mockContext, mockNext);

      // Should have exactly 2 log calls: request and response
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);

      expect(mockConsoleLog).toHaveBeenNthCalledWith(1,
        '[PROXY] POST /test-endpoint -> https://api.test.example.com/v1/test-endpoint?param=value'
      );

      expect(mockConsoleLog).toHaveBeenNthCalledWith(2,
        '[PROXY] POST /test-endpoint <- 201 (17 bytes)'
      );
    });

    it('should not log sensitive information in headers', async () => {
      // This test verifies we're not accidentally logging sensitive data
      mockContext.req.header = jest.fn().mockReturnValue([
        ['authorization', 'Bearer secret-token'],
        ['x-api-key', 'sensitive-api-key'],
        ['cookie', 'session=secret-session-data']
      ]);

      const mockResponse = new Response('{}', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await middleware(mockContext, mockNext);

      // Verify that log messages don't contain sensitive data
      const allLogCalls = mockConsoleLog.mock.calls.flat();
      const logContent = allLogCalls.join(' ');

      expect(logContent).not.toContain('secret-token');
      expect(logContent).not.toContain('sensitive-api-key');
      expect(logContent).not.toContain('secret-session-data');
    });
  });
});