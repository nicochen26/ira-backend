const { Hono } = require('hono');

const app = new Hono();

// IRA 服务的示例接口
// 开发者只需要关注业务逻辑，无需处理路由配置
// 框架会自动将 /api/ira/* 路由到 IRA_BASE_URL/*

app.get('/ira/users', async (c) => {
  // 这个请求会自动代理到: IRA_BASE_URL/users
  // 开发者可以在这里添加请求预处理、数据验证等逻辑

  // 示例：添加自定义头部
  c.req.header('X-Custom-Header', 'ira-service');

  // 请求会自动转发，无需手动处理代理逻辑
  // 如果需要响应后处理，可以在代理中间件返回后处理
});

app.post('/ira/investments', async (c) => {
  // POST /api/ira/investments -> IRA_BASE_URL/investments
  // 可以在这里添加请求体验证、转换等逻辑

  try {
    const body = await c.req.json();

    // 示例：数据验证
    if (!body.amount || body.amount <= 0) {
      return c.json({ error: 'Invalid investment amount' }, 400);
    }

    // 验证通过后，请求会自动转发到后端服务
  } catch (error) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
});

// HAP 服务的示例接口
// 框架会自动将 /api/hap/* 路由到 HAP_BASE_URL/*

app.get('/hap/reports', async (c) => {
  // GET /api/hap/reports -> HAP_BASE_URL/reports
  // 可以添加查询参数处理、权限验证等

  const userId = c.req.query('userId');
  if (!userId) {
    return c.json({ error: 'userId is required' }, 400);
  }

  // 查询参数会自动传递给后端服务
});

app.put('/hap/settings/:id', async (c) => {
  // PUT /api/hap/settings/123 -> HAP_BASE_URL/settings/123
  // 路径参数会自动保留

  const settingId = c.req.param('id');

  // 可以添加权限检查、数据预处理等
  console.log(`Updating setting ${settingId}`);

  // 请求自动转发，路径参数保持不变
});

module.exports = app;