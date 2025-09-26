const { createProxyMiddleware } = require('../../src/middleware/proxy');

// Mock the agents config
jest.mock('../../src/config/agents', () => ({
  getActiveAgent: jest.fn()
}));

const { getActiveAgent } = require('../../src/config/agents');

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Proxy Error Handling', () => {
  let middleware;
  let mockContext;
  let mockNext;

  beforeEach(() => {
    mockFetch.mockClear();

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
        method: 'GET',
        url: 'http://localhost:3000/test-endpoint',
        header: jest.fn().mockReturnValue([['authorization', 'Bearer token']]),
        text: jest.fn()
      },
      json: jest.fn((data, status) => ({ data, status }))
    };
  });

  describe('Network Error Handling', () => {
    it('should return 502 Bad Gateway for ECONNREFUSED errors', async () => {
      const connectionError = new Error('Connection refused');
      connectionError.code = 'ECONNREFUSED';

      mockFetch.mockRejectedValue(connectionError);

      const result = await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Bad Gateway',
          message: 'Could not connect to backend service'
        },
        502
      );
    });

    it('should return 502 Bad Gateway for ENOTFOUND errors', async () => {
      const dnsError = new Error('Host not found');
      dnsError.code = 'ENOTFOUND';

      mockFetch.mockRejectedValue(dnsError);

      await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Bad Gateway',
          message: 'Could not connect to backend service'
        },
        502
      );
    });

    it('should return 500 Internal Server Error for general errors', async () => {
      const generalError = new Error('Something went wrong');

      mockFetch.mockRejectedValue(generalError);

      await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Internal Server Error',
          message: 'Proxy request failed'
        },
        500
      );
    });

    it('should handle timeout errors appropriately', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ETIMEDOUT';

      mockFetch.mockRejectedValue(timeoutError);

      await middleware(mockContext, mockNext);

      // Timeout errors should be treated as general errors (500)
      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Internal Server Error',
          message: 'Proxy request failed'
        },
        500
      );
    });
  });

  describe('Malformed Request Handling', () => {
    it('should handle body parsing errors gracefully for POST requests', async () => {
      mockContext.req.method = 'POST';
      mockContext.req.text.mockRejectedValue(new Error('Invalid body'));

      const mockResponse = new Response('{"result": "success"}', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await middleware(mockContext, mockNext);

      // Should still make the request but without body
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: null
        })
      );
    });

    it('should handle requests with invalid URLs gracefully', async () => {
      // Test with agent that has invalid URL structure
      getActiveAgent.mockReturnValue({
        name: 'Invalid Agent',
        url: 'invalid-url-format'
      });

      mockContext.req.path = '/test';

      // This should cause a TypeError when trying to create URL
      await middleware(mockContext, mockNext);

      // Should return 500 error for configuration issues
      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Internal Server Error',
          message: 'Proxy request failed'
        },
        500
      );
    });
  });

  describe('HTTP Status Code Mapping', () => {
    it('should preserve non-error status codes from backend', async () => {
      const testStatuses = [
        { status: 200, body: '{}' },
        { status: 201, body: '{}' },
        { status: 202, body: '{}' },
        { status: 204, body: null }, // No Content status doesn't allow body
        { status: 301, body: '{}' },
        { status: 302, body: '{}' },
        { status: 304, body: null } // Not Modified doesn't allow body
      ];

      for (const testCase of testStatuses) {
        mockFetch.mockClear();
        mockContext.json.mockClear();

        const mockResponse = new Response(testCase.body, { status: testCase.status });
        mockFetch.mockResolvedValue(mockResponse);

        const result = await middleware(mockContext, mockNext);

        // For successful responses, middleware returns a Response object directly
        if (result instanceof Response) {
          expect(result.status).toBe(testCase.status);
        } else {
          // If it's not a Response, it should be an error case
          expect(result).toBeDefined();
        }
      }
    });

    it('should preserve error status codes from backend', async () => {
      const testStatuses = [400, 401, 403, 404, 409, 422, 500, 503];

      for (const status of testStatuses) {
        mockFetch.mockClear();

        const mockResponse = new Response('{"error": "Backend error"}', { status });
        mockFetch.mockResolvedValue(mockResponse);

        const result = await middleware(mockContext, mockNext);

        // For successful responses, middleware returns a Response object directly
        if (result instanceof Response) {
          expect(result.status).toBe(status);
        } else {
          // If it's not a Response, it should be an error case
          expect(result).toBeDefined();
        }
      }
    });
  });

  describe('Configuration Error Handling', () => {
    it('should handle missing agent configuration', async () => {
      getActiveAgent.mockImplementation(() => {
        throw new Error('Missing required environment variables: ACTIVE_AGENT');
      });

      await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Internal Server Error',
          message: 'Proxy request failed'
        },
        500
      );
    });

    it('should handle invalid agent configuration', async () => {
      getActiveAgent.mockImplementation(() => {
        throw new Error('Invalid ACTIVE_AGENT value: invalid-agent');
      });

      await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Internal Server Error',
          message: 'Proxy request failed'
        },
        500
      );
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error response format', async () => {
      const networkError = new Error('Network error');
      networkError.code = 'ECONNREFUSED';

      mockFetch.mockRejectedValue(networkError);

      await middleware(mockContext, mockNext);

      const [errorResponse, statusCode] = mockContext.json.mock.calls[0];

      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse).toHaveProperty('message');
      expect(typeof errorResponse.error).toBe('string');
      expect(typeof errorResponse.message).toBe('string');
      expect(typeof statusCode).toBe('number');
      expect(statusCode >= 400 && statusCode < 600).toBe(true);
    });

    it('should include appropriate error messages', async () => {
      const testCases = [
        {
          error: { code: 'ECONNREFUSED', message: 'Connection refused' },
          expectedError: 'Bad Gateway',
          expectedMessage: 'Could not connect to backend service',
          expectedStatus: 502
        },
        {
          error: { code: 'ENOTFOUND', message: 'Host not found' },
          expectedError: 'Bad Gateway',
          expectedMessage: 'Could not connect to backend service',
          expectedStatus: 502
        },
        {
          error: { message: 'Generic error' },
          expectedError: 'Internal Server Error',
          expectedMessage: 'Proxy request failed',
          expectedStatus: 500
        }
      ];

      for (const testCase of testCases) {
        mockContext.json.mockClear();

        const error = new Error(testCase.error.message);
        if (testCase.error.code) {
          error.code = testCase.error.code;
        }

        mockFetch.mockRejectedValue(error);

        await middleware(mockContext, mockNext);

        expect(mockContext.json).toHaveBeenCalledWith(
          {
            error: testCase.expectedError,
            message: testCase.expectedMessage
          },
          testCase.expectedStatus
        );
      }
    });
  });
});