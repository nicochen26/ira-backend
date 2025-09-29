const { jwtAuthMiddleware, optionalJwtAuthMiddleware, getCurrentUser, isAuthenticated } = require('../../src/middleware/auth');

// Mock fetch for backend service calls
global.fetch = jest.fn();

describe('JWT Authentication Middleware', () => {
  let mockContext;
  let mockNext;

  beforeEach(() => {
    mockContext = {
      req: {
        header: jest.fn()
      },
      json: jest.fn(),
      set: jest.fn(),
      get: jest.fn()
    };
    mockNext = jest.fn();
    fetch.mockClear();
  });

  describe('jwtAuthMiddleware', () => {
    test('should authenticate with valid token via backend service', async () => {
      const testUser = {
        id: 'test-123',
        email: 'test@example.com',
        name: 'Test User'
      };

      const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.test.signature';
      mockContext.req.header.mockReturnValue(`Bearer ${token}`);

      // Mock successful backend verification
      const mockVerifyResponse = {
        success: true,
        valid: true,
        user: testUser,
        expiringSoon: false
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVerifyResponse)
      });

      const middleware = jwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/verify-token'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token })
        })
      );
      expect(mockContext.set).toHaveBeenCalledWith('user', testUser);
      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.json).not.toHaveBeenCalled();
    });

    test('should reject request without token', async () => {
      mockContext.req.header.mockReturnValue(null);

      const middleware = jwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
        message: 'No token provided'
      }, 401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject request with invalid token', async () => {
      mockContext.req.header.mockReturnValue('Bearer invalid-token');

      // Mock backend service rejection
      const mockErrorResponse = {
        success: false,
        valid: false,
        error: 'Invalid token'
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockErrorResponse)
      });

      const middleware = jwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid token'
      }, 401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject request with malformed authorization header', async () => {
      mockContext.req.header.mockReturnValue('InvalidFormat token');

      const middleware = jwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
        message: 'No token provided'
      }, 401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should detect token expiring soon', async () => {
      const testUser = {
        id: 'test-123',
        email: 'test@example.com',
        name: 'Test User'
      };

      const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.expiring.signature';
      mockContext.req.header.mockReturnValue(`Bearer ${token}`);

      // Mock backend response with expiring token warning
      const mockVerifyResponse = {
        success: true,
        valid: true,
        user: testUser,
        expiringSoon: true
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVerifyResponse)
      });

      const middleware = jwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.set).toHaveBeenCalledWith('user', testUser);
      expect(mockContext.set).toHaveBeenCalledWith('tokenExpiringSoon', true);
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle backend service error', async () => {
      const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.test.signature';
      mockContext.req.header.mockReturnValue(`Bearer ${token}`);

      // Mock fetch error
      fetch.mockRejectedValueOnce(new Error('Service unavailable'));

      const middleware = jwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication service unavailable'
      }, 401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalJwtAuthMiddleware', () => {
    test('should authenticate with valid token via backend service', async () => {
      const testUser = {
        id: 'test-123',
        email: 'test@example.com',
        name: 'Test User'
      };

      const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.test.signature';
      mockContext.req.header.mockReturnValue(`Bearer ${token}`);

      // Mock successful backend verification
      const mockVerifyResponse = {
        success: true,
        valid: true,
        user: testUser,
        expiringSoon: false
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVerifyResponse)
      });

      const middleware = optionalJwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.set).toHaveBeenCalledWith('user', testUser);
      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.json).not.toHaveBeenCalled();
    });

    test('should continue without token', async () => {
      mockContext.req.header.mockReturnValue(null);

      const middleware = optionalJwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.json).not.toHaveBeenCalled();
      expect(mockContext.set).not.toHaveBeenCalledWith('user', expect.any(Object));
    });

    test('should continue with invalid token (no error)', async () => {
      mockContext.req.header.mockReturnValue('Bearer invalid-token');

      // Mock backend service error
      fetch.mockRejectedValueOnce(new Error('Invalid token'));

      const middleware = optionalJwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.json).not.toHaveBeenCalled();
      expect(mockContext.set).not.toHaveBeenCalledWith('user', expect.any(Object));
    });
  });

  describe('Helper functions', () => {
    test('getCurrentUser should return user from context', () => {
      const testUser = { id: '123', email: 'test@example.com' };
      mockContext.get.mockReturnValue(testUser);

      const user = getCurrentUser(mockContext);
      expect(user).toBe(testUser);
      expect(mockContext.get).toHaveBeenCalledWith('user');
    });

    test('getCurrentUser should return null if no user', () => {
      mockContext.get.mockReturnValue(undefined);

      const user = getCurrentUser(mockContext);
      expect(user).toBeNull();
    });

    test('isAuthenticated should return true if user exists', () => {
      mockContext.get.mockReturnValue({ id: '123' });

      const authenticated = isAuthenticated(mockContext);
      expect(authenticated).toBe(true);
    });

    test('isAuthenticated should return false if no user', () => {
      mockContext.get.mockReturnValue(undefined);

      const authenticated = isAuthenticated(mockContext);
      expect(authenticated).toBe(false);
    });
  });
});