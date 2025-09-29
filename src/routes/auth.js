const { Hono } = require('hono');
const jwtUtil = require('../utils/jwt');
const userService = require('../services/userService');

const app = new Hono();

/**
 * POST /api/auth/generate-token
 * Generate JWT token from user data (userId, email, name)
 * New implementation with user creation and JWT generation
 *
 * 请求体格式:
 * {
 *   "userId": "string",
 *   "email": "string",
 *   "name": "string"
 * }
 */
app.post('/auth/generate-token', async (c) => {
  try {
    const body = await c.req.json();

    // Basic parameter validation
    if (!body.userId || !body.email || !body.name) {
      return c.json({
        success: false,
        error: 'Missing required fields',
        message: 'userId, email, and name are required'
      }, 400);
    }

    // Step 1: Check if user exists in database, create if not
    let user;
    try {
      // Try to find user by email first
      user = await userService.getUserByEmail(body.email);
    } catch (error) {
      if (error.message === 'User not found') {
        // User doesn't exist, create new user
        try {
          user = await userService.createUser({
            email: body.email,
            name: body.name
          });
          console.log(`Created new user: ${user.email} with ID: ${user.id}`);
        } catch (createError) {
          console.error('Error creating user:', createError.message);
          return c.json({
            success: false,
            error: 'User creation failed',
            message: 'Could not create user record'
          }, 500);
        }
      } else {
        console.error('Error looking up user:', error.message);
        return c.json({
          success: false,
          error: 'Database error',
          message: 'Could not verify user information'
        }, 500);
      }
    }

    // Step 2: Call backend auth service for additional validation/processing
    let backendResponse;
    try {
      const authBaseUrl = process.env.AUTH_BASE_URL;
      if (!authBaseUrl) {
        throw new Error('AUTH_BASE_URL not configured');
      }

      const backendBody = {
        userId: body.userId,
        email: body.email,
        name: body.name,
        dbUserId: user.id // Include our database user ID
      };

      const response = await fetch(`${authBaseUrl}/auth/generate-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(backendBody),
        timeout: 5000
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Backend auth service error: ${response.status} - ${errorText}`);
        // Continue with JWT generation even if backend service fails
        backendResponse = null;
      } else {
        backendResponse = await response.json();
      }
    } catch (backendError) {
      console.error('Backend auth service call failed:', backendError.message);
      // Continue with JWT generation even if backend service fails
      backendResponse = null;
    }

    // Step 3: Generate our own JWT token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      originalUserId: body.userId // Keep reference to original userId
    };

    const token = jwtUtil.generateToken(tokenPayload);

    // Step 4: Return response with our JWT and backend service info
    const response = {
      success: true,
      token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    };

    // Include backend service response if available
    if (backendResponse) {
      response.backendAuth = backendResponse;
    }

    return c.json(response, 201);

  } catch (error) {
    console.error('Generate token error:', error.message);
    return c.json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to generate token'
    }, 500);
  }
});

/**
 * POST /api/auth/verify-token
 * Verify JWT token and return user information
 */
app.post('/auth/verify-token', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.token) {
      return c.json({
        success: false,
        error: 'Missing token',
        message: 'Token is required'
      }, 400);
    }

    // Verify token
    const decoded = jwtUtil.verifyToken(body.token);

    // Check if token is expiring soon
    const expiringSoon = jwtUtil.isTokenExpiringSoon(decoded);

    return c.json({
      success: true,
      valid: true,
      user: {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name
      },
      issuedAt: new Date(decoded.iat * 1000).toISOString(),
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
      expiringSoon: expiringSoon
    });

  } catch (error) {
    return c.json({
      success: false,
      valid: false,
      error: error.message
    }, 401);
  }
});

module.exports = app;