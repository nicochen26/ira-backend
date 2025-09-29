const jwt = require('jsonwebtoken');

class JWTUtil {
  constructor() {
    this.secret = process.env.JWT_SECRET;
    this.expiresIn = process.env.JWT_EXPIRES_IN || '24h';

    if (!this.secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  /**
   * Generate a JWT token for a user
   * @param {Object} payload - User payload {id, email, name}
   * @returns {string} JWT token
   */
  generateToken(payload) {
    try {
      const tokenPayload = {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        iat: Math.floor(Date.now() / 1000),
      };

      return jwt.sign(tokenPayload, this.secret, {
        expiresIn: this.expiresIn,
        issuer: 'ira-backend',
        audience: 'ira-client'
      });
    } catch (error) {
      throw new Error(`Failed to generate token: ${error.message}`);
    }
  }

  /**
   * Verify and decode a JWT token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded payload
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.secret, {
        issuer: 'ira-backend',
        audience: 'ira-client'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('Token not active yet');
      } else {
        throw new Error(`Token verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Decode a JWT token without verification (for debugging)
   * @param {string} token - JWT token to decode
   * @returns {Object} Decoded payload
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      throw new Error(`Failed to decode token: ${error.message}`);
    }
  }

  /**
   * Extract token from Authorization header
   * @param {string} authHeader - Authorization header value
   * @returns {string|null} Extracted token or null
   */
  extractTokenFromHeader(authHeader) {
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
   * Check if token is close to expiring (within 5 minutes)
   * @param {Object} decodedToken - Decoded token payload
   * @returns {boolean} True if token is close to expiring
   */
  isTokenExpiringSoon(decodedToken) {
    if (!decodedToken.exp) {
      return false;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decodedToken.exp - currentTime;

    // Consider token expiring soon if less than 5 minutes remaining
    return timeUntilExpiry < 300;
  }
}

// Export singleton instance
module.exports = new JWTUtil();