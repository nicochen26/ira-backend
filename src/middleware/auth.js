const jwtUtil = require('../utils/jwt');

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and adds user information to the context
 */
const jwtAuthMiddleware = () => {
  return async (c, next) => {
    try {
      const authHeader = c.req.header('Authorization');
      const token = jwtUtil.extractTokenFromHeader(authHeader);

      if (!token) {
        return c.json({
          success: false,
          error: 'Unauthorized',
          message: 'No token provided'
        }, 401);
      }

      // Verify token and extract user information
      const decoded = jwtUtil.verifyToken(token);

      // Add user information to context for use in subsequent handlers
      c.set('user', {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        iat: decoded.iat,
        exp: decoded.exp
      });

      // Add token expiry warning if close to expiring
      if (jwtUtil.isTokenExpiringSoon(decoded)) {
        c.set('tokenExpiringSoon', true);
      }

      // Continue to next middleware/handler
      await next();

    } catch (error) {
      console.error('JWT Authentication error:', error.message);

      return c.json({
        success: false,
        error: 'Unauthorized',
        message: error.message || 'Invalid token'
      }, 401);
    }
  };
};

/**
 * Optional JWT Authentication Middleware
 * Verifies JWT tokens if present, but allows requests without tokens
 */
const optionalJwtAuthMiddleware = () => {
  return async (c, next) => {
    try {
      const authHeader = c.req.header('Authorization');
      const token = jwtUtil.extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const decoded = jwtUtil.verifyToken(token);

          // Add user information to context
          c.set('user', {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            iat: decoded.iat,
            exp: decoded.exp
          });

          // Add token expiry warning if close to expiring
          if (jwtUtil.isTokenExpiringSoon(decoded)) {
            c.set('tokenExpiringSoon', true);
          }
        } catch (error) {
          // Log error but don't fail the request
          console.warn('Optional JWT verification failed:', error.message);
        }
      }

      // Continue regardless of token validation result
      await next();

    } catch (error) {
      // Log error but don't fail the request in optional mode
      console.error('Optional JWT middleware error:', error.message);
      await next();
    }
  };
};

/**
 * User context helper to get current user from context
 */
const getCurrentUser = (c) => {
  return c.get('user') || null;
};

/**
 * Check if user is authenticated
 */
const isAuthenticated = (c) => {
  return !!c.get('user');
};

/**
 * Check if token is expiring soon
 */
const isTokenExpiringSoon = (c) => {
  return !!c.get('tokenExpiringSoon');
};

/**
 * Role-based authorization middleware (for future use)
 * @param {Array<string>} allowedRoles - Array of allowed roles
 */
const requireRoles = (allowedRoles = []) => {
  return async (c, next) => {
    const user = getCurrentUser(c);

    if (!user) {
      return c.json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required'
      }, 401);
    }

    // For now, all authenticated users are allowed
    // This can be extended when role system is implemented
    if (allowedRoles.length > 0 && user.role && !allowedRoles.includes(user.role)) {
      return c.json({
        success: false,
        error: 'Forbidden',
        message: 'Insufficient permissions'
      }, 403);
    }

    await next();
  };
};

module.exports = {
  jwtAuthMiddleware,
  optionalJwtAuthMiddleware,
  getCurrentUser,
  isAuthenticated,
  isTokenExpiringSoon,
  requireRoles
};