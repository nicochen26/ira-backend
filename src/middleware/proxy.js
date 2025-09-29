const { getServiceByPath } = require('../config/agents');

const createProxyMiddleware = () => {
  return async (c, next) => {
    const path = c.req.path;

    // Skip proxy for health endpoint, auth endpoints, and protected routes we handle locally
    if (path === '/health' ||
        path === '/api/auth/generate-token' ||
        path === '/api/auth/verify-token' ||
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

module.exports = { createProxyMiddleware };