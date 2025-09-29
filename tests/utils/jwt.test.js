const jwtUtil = require('../../src/utils/jwt');

describe('JWT Utility Functions', () => {
  const testUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User'
  };

  describe('generateToken', () => {
    test('should generate a valid JWT token', () => {
      const token = jwtUtil.generateToken(testUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should include user information in token payload', () => {
      const token = jwtUtil.generateToken(testUser);
      const decoded = jwtUtil.decodeToken(token);

      expect(decoded.payload.id).toBe(testUser.id);
      expect(decoded.payload.email).toBe(testUser.email);
      expect(decoded.payload.name).toBe(testUser.name);
      expect(decoded.payload.iss).toBe('ira-backend');
      expect(decoded.payload.aud).toBe('ira-client');
    });

    test('should include timestamp in token payload', () => {
      const token = jwtUtil.generateToken(testUser);
      const decoded = jwtUtil.decodeToken(token);

      expect(decoded.payload.iat).toBeDefined();
      expect(decoded.payload.exp).toBeDefined();
      expect(decoded.payload.exp).toBeGreaterThan(decoded.payload.iat);
    });
  });

  describe('verifyToken', () => {
    test('should verify a valid token', () => {
      const token = jwtUtil.generateToken(testUser);
      const decoded = jwtUtil.verifyToken(token);

      expect(decoded.id).toBe(testUser.id);
      expect(decoded.email).toBe(testUser.email);
      expect(decoded.name).toBe(testUser.name);
    });

    test('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => {
        jwtUtil.verifyToken(invalidToken);
      }).toThrow('Invalid token');
    });

    test('should throw error for malformed token', () => {
      const malformedToken = 'not-a-jwt-token';

      expect(() => {
        jwtUtil.verifyToken(malformedToken);
      }).toThrow();
    });
  });

  describe('extractTokenFromHeader', () => {
    test('should extract token from valid Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      const authHeader = `Bearer ${token}`;

      const extracted = jwtUtil.extractTokenFromHeader(authHeader);
      expect(extracted).toBe(token);
    });

    test('should return null for missing header', () => {
      const extracted = jwtUtil.extractTokenFromHeader(null);
      expect(extracted).toBeNull();
    });

    test('should return null for invalid header format', () => {
      const extracted = jwtUtil.extractTokenFromHeader('Invalid format');
      expect(extracted).toBeNull();
    });

    test('should return null for non-Bearer token', () => {
      const extracted = jwtUtil.extractTokenFromHeader('Basic dGVzdA==');
      expect(extracted).toBeNull();
    });
  });

  describe('isTokenExpiringSoon', () => {
    test('should return false for recently issued token', () => {
      const token = jwtUtil.generateToken(testUser);
      const decoded = jwtUtil.verifyToken(token);

      const isExpiring = jwtUtil.isTokenExpiringSoon(decoded);
      expect(isExpiring).toBe(false);
    });

    test('should return false for token without exp claim', () => {
      const tokenWithoutExp = { iat: Math.floor(Date.now() / 1000) };

      const isExpiring = jwtUtil.isTokenExpiringSoon(tokenWithoutExp);
      expect(isExpiring).toBe(false);
    });

    test('should return true for soon-to-expire token', () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const soonToExpireToken = {
        iat: currentTime - 1000,
        exp: currentTime + 100 // Expires in 100 seconds (less than 5 minutes)
      };

      const isExpiring = jwtUtil.isTokenExpiringSoon(soonToExpireToken);
      expect(isExpiring).toBe(true);
    });
  });

  describe('decodeToken', () => {
    test('should decode token without verification', () => {
      const token = jwtUtil.generateToken(testUser);
      const decoded = jwtUtil.decodeToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.payload).toBeDefined();
      expect(decoded.header).toBeDefined();
      expect(decoded.signature).toBeDefined();
    });

    test('should handle invalid token format gracefully', () => {
      // The jwt.decode function actually returns null for invalid tokens rather than throwing
      const result = jwtUtil.decodeToken('invalid-token');
      expect(result).toBeNull();
    });
  });
});