const { getServiceByPath } = require('../config/agents');
const userService = require('../services/userService');

const createProxyMiddleware = () => {
  return async (c, next) => {
    const path = c.req.path;

    // Skip proxy for health endpoint and protected routes we handle locally
    if (path === '/health' ||
        path.startsWith('/api/protected/') ||
        path.startsWith('/api/users/')) {
      return next();
    }

    try {
      // Get service configuration based on path
      const service = getServiceByPath(path);

      if (!service) {
        // No matching service found, continue to next middleware
        return next();
      }

      // Special handling for auth endpoints - add user management
      if (path.endsWith('/auth/generate-token')) {
        return await handleAuthGenerateToken(c, service);
      }

      if (path.endsWith('/auth/verify-token')) {
        return await handleAuthVerifyToken(c, service);
      }

      const targetUrl = new URL(service.url);

      // Build the target URL with the transformed path (prefix removed)
      const proxyUrl = `${service.url}${service.targetPath}`;

      // Get original request details
      const method = c.req.method;
      const headers = {};

      // Copy all headers from original request
      for (const [key, value] of c.req.header()) {
        headers[key] = value;
      }

      // Update Host header to target service
      headers['Host'] = targetUrl.host;

      // Get request body if present
      let body = null;
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        try {
          body = await c.req.text();
        } catch (error) {
          // If body parsing fails, continue without body
        }
      }

      // Build query string from original request
      const url = new URL(c.req.url);
      const searchParams = url.searchParams.toString();
      const finalUrl = searchParams ? `${proxyUrl}?${searchParams}` : proxyUrl;

      // Log the proxy request
      console.log(`[PROXY] ${method} ${path} -> ${service.name} (${finalUrl})`);

      // Make the proxy request
      const response = await fetch(finalUrl, {
        method,
        headers,
        body: body,
      });

      // Copy response headers
      const responseHeaders = {};
      for (const [key, value] of response.headers.entries()) {
        // Skip headers that should not be forwarded
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      }

      // Get response body
      const responseBody = await response.text();

      // Log the proxy response
      console.log(`[PROXY] ${method} ${path} <- ${response.status} (${responseBody.length} bytes)`);

      // Return the proxied response
      return new Response(responseBody, {
        status: response.status,
        headers: responseHeaders
      });

    } catch (error) {
      console.error(`[PROXY ERROR] ${c.req.method} ${path}:`, error.message);

      // Return appropriate error response
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return c.json({
          error: 'Bad Gateway',
          message: 'Could not connect to backend service'
        }, 502);
      }

      return c.json({
        error: 'Internal Server Error',
        message: 'Proxy request failed'
      }, 500);
    }
  };
};

// Handle auth generate-token with user management
async function handleAuthGenerateToken(c, service) {
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

    // Step 1: Check if user exists in database, create if not exists
    let user;
    try {
      // Try to find user by email first
      user = await userService.getUserByEmail(body.email);
      console.log(`Found existing user: ${user.email} with ID: ${user.id}`);
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

    // Step 2: Call the backend service to get the actual token
    const backendBody = {
      userId: body.userId,
      email: body.email,
      name: body.name,
      dbUserId: user.id // Include our database user ID for reference
    };

    const targetUrl = `${service.url}${service.targetPath}`;
    console.log(`[AUTH PROXY] Calling backend service: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(backendBody),
      timeout: 10000 // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend service error: ${response.status} - ${errorText}`);
      return c.json({
        success: false,
        error: 'Backend service error',
        message: `Authentication service returned ${response.status}`
      }, response.status);
    }

    const backendResponse = await response.json();
    console.log('Backend service response received successfully');

    // Step 3: Add our database user information to the response
    if (backendResponse.success && backendResponse.data) {
      backendResponse.data.dbUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
    }

    return c.json(backendResponse, 201);

  } catch (error) {
    console.error('Auth generate token error:', error.message);
    return c.json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to generate token'
    }, 500);
  }
}

// Handle auth verify-token by forwarding to backend service
async function handleAuthVerifyToken(c, service) {
  try {
    const body = await c.req.json();

    if (!body.token) {
      return c.json({
        success: false,
        error: 'Missing token',
        message: 'Token is required'
      }, 400);
    }

    // Forward the token verification to the backend service
    const targetUrl = `${service.url}${service.targetPath}`;
    console.log(`[AUTH PROXY] Calling backend verification service: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ token: body.token }),
      timeout: 10000 // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend verification service error: ${response.status} - ${errorText}`);
      return c.json({
        success: false,
        valid: false,
        error: 'Token verification failed',
        message: `Verification service returned ${response.status}`
      }, response.status);
    }

    const backendResponse = await response.json();
    console.log('Backend verification service response received successfully');

    // Return the backend service response directly
    return c.json(backendResponse);

  } catch (error) {
    console.error('Auth verify token error:', error.message);
    return c.json({
      success: false,
      valid: false,
      error: 'Verification service unavailable',
      message: 'Could not connect to token verification service'
    }, 502);
  }
}

module.exports = { createProxyMiddleware };