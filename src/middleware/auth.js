const { getServiceByPath } = require('../config/agents');

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens via backend service and adds user information to the context
 */
const jwtAuthMiddleware = () => {
  return async (c, next) => {
    try {
      const authHeader = c.req.header('Authorization');
      const token = extractTokenFromHeader(authHeader);

      if (!token) {
        return c.json({
          success: false,
          error: 'Unauthorized',
          message: 'No token provided'
        }, 401);
      }

      // Verify token with backend service
      const verificationResult = await verifyTokenWithBackend(token);

      if (!verificationResult.success || !verificationResult.valid) {
        return c.json({
          success: false,
          error: 'Unauthorized',
          message: verificationResult.error || 'Invalid token'
        }, 401);
      }

      // Add user information to context for use in subsequent handlers
      c.set('user', verificationResult.user);

      // Add token expiry warning if close to expiring
      if (verificationResult.expiringSoon) {
        c.set('tokenExpiringSoon', true);
      }

      // Continue to next middleware/handler
      await next();

    } catch (error) {
      console.error('JWT Authentication error:', error.message);

      return c.json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication service unavailable'
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
      const token = extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const verificationResult = await verifyTokenWithBackend(token);

          if (verificationResult.success && verificationResult.valid) {
            // Add user information to context
            c.set('user', verificationResult.user);

            // Add token expiry warning if close to expiring
            if (verificationResult.expiringSoon) {
              c.set('tokenExpiringSoon', true);
            }
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

/**
 * Extract JWT token from Authorization header
 * @param {string} authHeader - The Authorization header value
 * @returns {string|null} - The extracted token or null if not found
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify token with backend service
 * @param {string} token - The JWT token to verify
 * @returns {Object} - Verification result from backend service
 */
async function verifyTokenWithBackend(token) {
  const service = getServiceByPath('/api/ira/auth/verify-token');
  if (!service) {
    throw new Error('Backend verification service not configured');
  }

  const targetUrl = `${service.url}/auth/verify-token`;

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ token })
  });

  if (!response.ok) {
    throw new Error(`Backend verification service returned ${response.status}`);
  }

  return await response.json();
}

module.exports = {
  jwtAuthMiddleware,
  optionalJwtAuthMiddleware,
  getCurrentUser,
  isAuthenticated,
  isTokenExpiringSoon,
  requireRoles
};