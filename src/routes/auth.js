const { Hono } = require('hono');
const userService = require('../services/userService');
const jwtUtil = require('../utils/jwt');
const fetch = require('node-fetch');

const auth = new Hono();

// Generate token endpoint (no login required)
auth.post('/generate-token', async (c) => {
  try {
    // Get IRA service URL from environment
    const iraBaseUrl = process.env.IRA_BASE_URL;
    if (!iraBaseUrl) {
      return c.json({
        success: false,
        message: 'IRA service not configured'
      }, 500);
    }

    // Call IRA generate-token endpoint
    try {
      const iraTokenUrl = `${iraBaseUrl}/auth/generate-token`;
      console.log('Generating token from IRA service:', iraTokenUrl);

      const iraResponse = await fetch(iraTokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          userId: 'debug-user-' + Date.now(),
          email: 'debug-' + Date.now() + '@ira-backend.local'
        })
      });

      const iraData = await iraResponse.json();

      if (!iraResponse.ok) {
        console.error('IRA token generation failed:', iraResponse.status, iraData);
        return c.json({
          success: false,
          message: iraData.message || 'Token generation failed with IRA service',
          error: iraData.error
        }, iraResponse.status);
      }

      // Check if we have the access token
      const accessToken = iraData.access_token || iraData.token || (iraData.data && iraData.data.token);
      if (!accessToken) {
        console.error('No access token returned from IRA service:', iraData);
        return c.json({
          success: false,
          message: 'No access token received from IRA service'
        }, 500);
      }

      return c.json({
        success: true,
        message: 'Token generated successfully',
        access_token: accessToken,
        user: iraData.user || (iraData.data && iraData.data.user) || {
          id: 'ira-user',
          email: 'ira@debug.local',
          name: 'IRA Debug User'
        }
      });

    } catch (fetchError) {
      console.error('Failed to connect to IRA service:', fetchError);
      return c.json({
        success: false,
        message: 'Failed to connect to IRA service',
        error: fetchError.message
      }, 503);
    }

  } catch (error) {
    console.error('Token generation error:', error);
    return c.json({
      success: false,
      message: 'Token generation failed',
      error: error.message
    }, 500);
  }
});

// Legacy login endpoint (kept for backward compatibility but uses generate-token)
auth.post('/login', async (c) => {
  try {
    // Just call generate-token instead of actual login
    const iraBaseUrl = process.env.IRA_BASE_URL;
    if (!iraBaseUrl) {
      return c.json({
        success: false,
        message: 'IRA service not configured'
      }, 500);
    }

    const iraTokenUrl = `${iraBaseUrl}/auth/generate-token`;
    console.log('Generating token from IRA service (via login):', iraTokenUrl);

    const iraResponse = await fetch(iraTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        userId: 'debug-user-' + Date.now(),
        email: 'debug-' + Date.now() + '@ira-backend.local'
      })
    });

    const iraData = await iraResponse.json();

    if (!iraResponse.ok) {
      console.error('IRA token generation failed:', iraResponse.status, iraData);
      return c.json({
        success: false,
        message: iraData.message || 'Token generation failed',
        error: iraData.error
      }, iraResponse.status);
    }

    const accessToken = iraData.access_token || iraData.token || (iraData.data && iraData.data.token);
    if (!accessToken) {
      return c.json({
        success: false,
        message: 'No access token received from IRA service'
      }, 500);
    }

    return c.json({
      success: true,
      message: 'Login successful',
      access_token: accessToken,
      user: iraData.user || (iraData.data && iraData.data.user) || {
        id: 'ira-user',
        email: 'ira@debug.local',
        name: 'IRA Debug User'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return c.json({
      success: false,
      message: 'Login failed',
      error: error.message
    }, 500);
  }
});

// Verify token endpoint
auth.get('/verify', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = jwtUtil.extractTokenFromHeader(authHeader);

    if (!token) {
      return c.json({
        success: false,
        message: 'No token provided'
      }, 401);
    }

    // Get IRA service URL from environment
    const iraBaseUrl = process.env.IRA_BASE_URL;
    if (!iraBaseUrl) {
      return c.json({
        success: false,
        message: 'IRA service not configured'
      }, 500);
    }

    // Forward token verification to IRA service
    try {
      const iraVerifyUrl = `${iraBaseUrl}/auth/verify`;

      const iraResponse = await fetch(iraVerifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      const iraData = await iraResponse.json();

      if (!iraResponse.ok) {
        console.error('IRA token verification failed:', iraResponse.status, iraData);
        return c.json({
          success: false,
          message: iraData.message || 'Token verification failed'
        }, iraResponse.status);
      }

      return c.json({
        success: true,
        message: 'Token is valid',
        user: iraData.user || iraData
      });

    } catch (fetchError) {
      console.error('Failed to connect to IRA service for verification:', fetchError);
      return c.json({
        success: false,
        message: 'Failed to connect to authentication service'
      }, 503);
    }

  } catch (error) {
    console.error('Token verification error:', error);
    return c.json({
      success: false,
      message: error.message
    }, 401);
  }
});

module.exports = auth;