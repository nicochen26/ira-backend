const jwtUtil = require('../utils/jwt');
const fetch = require('node-fetch');

/**
 * IRA-aware JWT Authentication Middleware
 * First tries to verify tokens with IRA service, falls back to local verification
 */
const localJwtAuthMiddleware = () => {
  return async (c, next) => {
    try {
      const authHeader = c.req.header('Authorization');
      let token = jwtUtil.extractTokenFromHeader(authHeader);

      // Fallback to query parameter for SSE (EventSource can't send custom headers)
      if (!token) {
        token = c.req.query('authorization') || c.req.query('token');
      }

      if (!token) {
        return c.json({
          success: false,
          error: 'Unauthorized',
          message: 'No token provided'
        }, 401);
      }

      // Try to verify with IRA service first
      const iraBaseUrl = process.env.IRA_BASE_URL;
      if (iraBaseUrl) {
        try {
          const iraVerifyUrl = `${iraBaseUrl}/auth/verify`;

          const iraResponse = await fetch(iraVerifyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            timeout: 5000 // 5 second timeout
          });

          if (iraResponse.ok) {
            const iraData = await iraResponse.json();

            // Check if verification was successful
            if (iraData.success && iraData.data && iraData.data.valid) {
              // Add user information from IRA to context
              c.set('user', {
                id: iraData.data.userId,
                email: iraData.data.email,
                name: iraData.data.name || 'IRA User'
              });

              // Continue to next middleware/handler
              await next();
              return;
            }
          } else {
            console.warn('IRA token verification failed, trying local verification');
          }
        } catch (iraError) {
          console.warn('Failed to connect to IRA for token verification, trying local verification:', iraError.message);
        }
      }

      // Fallback to local verification
      try {
        // Try to decode the token first to check if it's an IRA token (ES256)
        const decodedHeader = jwtUtil.decodeToken(token);

        // If it's an ES256 token (from IRA), try to decode without verification as fallback
        if (decodedHeader?.header?.alg === 'ES256') {
          console.warn('ES256 token detected but IRA verification failed. Using fallback decoding for debugging.');

          try {
            // For debugging/development: decode ES256 token without signature verification
            const payload = decodedHeader.payload;

            // Check if token is expired
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
              return c.json({
                success: false,
                error: 'Unauthorized',
                message: 'Token has expired'
              }, 401);
            }

            // Add user information to context from decoded payload
            c.set('user', {
              id: payload.userId || payload.id,
              email: payload.email,
              name: payload.name || 'IRA User'
            });

            // Continue to next middleware/handler
            await next();
            return;

          } catch (decodeError) {
            console.error('Failed to decode ES256 token:', decodeError.message);
            return c.json({
              success: false,
              error: 'Unauthorized',
              message: 'Invalid token format'
            }, 401);
          }
        }

        // Try local verification for non-ES256 tokens
        const decoded = jwtUtil.verifyToken(token);

        // Add user information to context for use in subsequent handlers
        c.set('user', {
          id: decoded.id,
          email: decoded.email,
          name: decoded.name
        });

        // Check if token is expiring soon
        if (jwtUtil.isTokenExpiringSoon(decoded)) {
          c.set('tokenExpiringSoon', true);
        }

        // Continue to next middleware/handler
        await next();

      } catch (localError) {
        console.error('Both IRA and local JWT verification failed:', localError.message);

        return c.json({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid token'
        }, 401);
      }

    } catch (error) {
      console.error('JWT Authentication error:', error.message);

      return c.json({
        success: false,
        error: 'Unauthorized',
        message: error.message || 'Authentication failed'
      }, 401);
    }
  };
};

/**
 * Optional Local JWT Authentication Middleware
 * Verifies JWT tokens if present, but allows requests without tokens
 */
const optionalLocalJwtAuthMiddleware = () => {
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
            name: decoded.name
          });

          // Check if token is expiring soon
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
      console.error('Optional local JWT middleware error:', error.message);
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

module.exports = {
  localJwtAuthMiddleware,
  optionalLocalJwtAuthMiddleware,
  getCurrentUser,
  isAuthenticated,
  isTokenExpiringSoon
};