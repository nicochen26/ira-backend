const { Hono } = require('hono');

const app = new Hono();

/**
 * POST /api/auth/generate-token
 * Generate JWT token from user data (userId, email, name)
 *
 * 请求体格式:
 * {
 *   "userId": "string",
 *   "email": "string",
 *   "name": "string"
 * }
 */
app.post('/auth/generate-token', async (c) => {
  // 框架会根据路径前缀自动路由到对应的后端服务
  // 这个接口会被直接转发，无需特殊处理

  // 可以在这里添加基础的请求验证（可选）
  try {
    const body = await c.req.json();

    // 基础参数验证（可选）
    if (!body.userId || !body.email || !body.name) {
      return c.json({
        error: 'Missing required fields',
        message: 'userId, email, and name are required'
      }, 400);
    }
  } catch (error) {
    return c.json({
      error: 'Invalid JSON',
      message: 'Request body must be valid JSON'
    }, 400);
  }

  // 请求验证通过后，会自动转发到后端服务
  // 无需额外处理，代理中间件会处理转发逻辑
});

module.exports = app;