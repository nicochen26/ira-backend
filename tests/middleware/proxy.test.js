const { createProxyMiddleware } = require('../../src/middleware/proxy');

// Mock the agents config
jest.mock('../../src/config/agents', () => ({
  getActiveAgent: jest.fn()
}));

const { getActiveAgent } = require('../../src/config/agents');

// Mock fetch globally
global.fetch = jest.fn();

describe('Proxy Middleware', () => {
  let middleware;
  let mockContext;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default active agent
    getActiveAgent.mockReturnValue({
      name: 'Test Agent',
      url: 'https://api.test.example.com/v1'
    });

    middleware = createProxyMiddleware();

    mockNext = jest.fn();
    mockContext = {
      req: {
        path: '/test-path',
        method: 'GET',
        url: 'http://localhost:3000/test-path?param=value',
        header: jest.fn().mockReturnValue([['authorization', 'Bearer token']]),
        text: jest.fn()
      },
      json: jest.fn()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Health endpoint bypass', () => {
    it('should call next() for /health path', async () => {
      mockContext.req.path = '/health';

      await middleware(mockContext, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('Proxy functionality', () => {
    it('should proxy GET request successfully', async () => {
      const mockResponse = new Response('{"result": "success"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      fetch.mockResolvedValue(mockResponse);

      const result = await middleware(mockContext, mockNext);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.example.com/v1/test-path?param=value',
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer token',
            'Host': 'api.test.example.com'
          },
          body: null
        }
      );

      expect(result).toBeInstanceOf(Response);
    });

    it('should proxy POST request with body', async () => {
      mockContext.req.method = 'POST';
      mockContext.req.text.mockResolvedValue('{"data": "test"}');

      const mockResponse = new Response('{"result": "created"}', {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });

      fetch.mockResolvedValue(mockResponse);

      const result = await middleware(mockContext, mockNext);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.example.com/v1/test-path?param=value',
        {
          method: 'POST',
          headers: {
            'authorization': 'Bearer token',
            'Host': 'api.test.example.com'
          },
          body: '{"data": "test"}'
        }
      );

      expect(result).toBeInstanceOf(Response);
    });

    it('should handle request without query parameters', async () => {
      mockContext.req.url = 'http://localhost:3000/test-path';

      const mockResponse = new Response('{"result": "success"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      fetch.mockResolvedValue(mockResponse);

      await middleware(mockContext, mockNext);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.example.com/v1/test-path',
        expect.any(Object)
      );
    });

    it('should handle different HTTP methods', async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        mockContext.req.method = method;

        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          mockContext.req.text.mockResolvedValue('{"data": "test"}');
        }

        const mockResponse = new Response('{}', { status: 200 });
        fetch.mockResolvedValue(mockResponse);

        await middleware(mockContext, mockNext);

        expect(fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ method })
        );

        fetch.mockClear();
      }
    });
  });

  describe('Error handling', () => {
    it('should handle network connection errors', async () => {
      const networkError = new Error('Network error');
      networkError.code = 'ECONNREFUSED';

      fetch.mockRejectedValue(networkError);

      const result = await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Bad Gateway',
          message: 'Could not connect to backend service'
        },
        502
      );
    });

    it('should handle DNS resolution errors', async () => {
      const dnsError = new Error('DNS error');
      dnsError.code = 'ENOTFOUND';

      fetch.mockRejectedValue(dnsError);

      const result = await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Bad Gateway',
          message: 'Could not connect to backend service'
        },
        502
      );
    });

    it('should handle general errors', async () => {
      const generalError = new Error('Something went wrong');

      fetch.mockRejectedValue(generalError);

      const result = await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Internal Server Error',
          message: 'Proxy request failed'
        },
        500
      );
    });

    it('should handle body parsing errors gracefully', async () => {
      mockContext.req.method = 'POST';
      mockContext.req.text.mockRejectedValue(new Error('Body parsing failed'));

      const mockResponse = new Response('{}', { status: 200 });
      fetch.mockResolvedValue(mockResponse);

      await middleware(mockContext, mockNext);

      // Should still make the request but without body
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: null
        })
      );
    });
  });
});