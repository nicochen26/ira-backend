const { Hono } = require('hono');

const app = new Hono();

/**
 * GET /api/ira/threads/history
 * 获取当前认证用户的所有历史会话（threads）列表
 *
 * Headers:
 * - Authorization: Bearer <JWT_TOKEN>
 * - Content-Type: application/json
 *
 * Query Parameters:
 * - limit: number (1-1000, default: 100) - 返回记录数量限制
 * - offset: number (default: 0) - 偏移量，用于分页
 */
app.get('/ira/threads/history', async (c) => {
  // 框架会自动将此请求路由到 IRA_BASE_URL/threads/history
  // 直接进行代理转发，无需特殊处理

  // 基础参数验证（可选）
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  // 验证参数范围
  if (limit < 1 || limit > 1000) {
    return c.json({
      success: false,
      error: 'Invalid limit parameter. Must be between 1 and 1000.'
    }, 400);
  }

  if (offset < 0) {
    return c.json({
      success: false,
      error: 'Invalid offset parameter. Must be >= 0.'
    }, 400);
  }

  // 验证Authorization头部存在（可选）
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      error: 'Authentication required. Please provide a valid Bearer token.'
    }, 401);
  }

  // 参数验证通过后，请求会自动转发到 IRA_BASE_URL/threads/history
  // 包含所有原始的查询参数和认证头部
});

/**
 * 如果 HAP 服务也需要同样的接口，可以添加：
 * GET /api/hap/threads/history
 */
app.get('/hap/threads/history', async (c) => {
  // 框架会自动将此请求路由到 HAP_BASE_URL/threads/history
  // 与 IRA 服务使用相同的验证逻辑

  // 基础参数验证（可选）
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  // 验证参数范围
  if (limit < 1 || limit > 1000) {
    return c.json({
      success: false,
      error: 'Invalid limit parameter. Must be between 1 and 1000.'
    }, 400);
  }

  if (offset < 0) {
    return c.json({
      success: false,
      error: 'Invalid offset parameter. Must be >= 0.'
    }, 400);
  }

  // 验证Authorization头部存在（可选）
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      error: 'Authentication required. Please provide a valid Bearer token.'
    }, 401);
  }

  // 参数验证通过后，请求会自动转发到 HAP_BASE_URL/threads/history
});

module.exports = app;