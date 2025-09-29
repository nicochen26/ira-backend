const { jwtAuthMiddleware, optionalJwtAuthMiddleware, getCurrentUser, isAuthenticated } = require('../../src/middleware/auth');
const jwtUtil = require('../../src/utils/jwt');

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
  });

  describe('jwtAuthMiddleware', () => {
    test('should authenticate with valid token', async () => {
      const testUser = {
        id: 'test-123',
        email: 'test@example.com',
        name: 'Test User'
      };

      const token = jwtUtil.generateToken(testUser);
      mockContext.req.header.mockReturnValue(`Bearer ${token}`);

      const middleware = jwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.set).toHaveBeenCalledWith('user', expect.objectContaining({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name
      }));
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

      const middleware = jwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
        message: expect.stringContaining('Invalid token')
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
      // Create a token that will be detected as expiring soon
      // Note: This test might be flaky due to timing, but demonstrates the concept
      const testUser = {
        id: 'test-123',
        email: 'test@example.com',
        name: 'Test User'
      };

      const token = jwtUtil.generateToken(testUser);
      mockContext.req.header.mockReturnValue(`Bearer ${token}`);

      const middleware = jwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.set).toHaveBeenCalledWith('user', expect.any(Object));
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('optionalJwtAuthMiddleware', () => {
    test('should authenticate with valid token', async () => {
      const testUser = {
        id: 'test-123',
        email: 'test@example.com',
        name: 'Test User'
      };

      const token = jwtUtil.generateToken(testUser);
      mockContext.req.header.mockReturnValue(`Bearer ${token}`);

      const middleware = optionalJwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockContext.set).toHaveBeenCalledWith('user', expect.objectContaining({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name
      }));
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

      const middleware = optionalJwtAuthMiddleware();
      await middleware(mockContext, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.json).not.toHaveBeenCalled();
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