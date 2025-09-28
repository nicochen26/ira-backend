#!/usr/bin/env node

// 演示自动路由架构
const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
require('dotenv').config();

// 导入配置
const { getServiceByPath, validateAgentConfig } = require('./src/config/agents');

console.log('🚀 IRA Backend 自动路由架构演示\n');

// 验证配置
try {
  validateAgentConfig();
  console.log('✅ 配置验证成功');
} catch (error) {
  console.error('❌ 配置验证失败:', error.message);
  console.log('\n请确保设置了以下环境变量:');
  console.log('- IRA_BASE_URL');
  console.log('- HAP_BASE_URL');
  process.exit(1);
}

// 测试路由解析
console.log('\n📍 路由解析测试:');

const testPaths = [
  '/api/ira/users',
  '/api/ira/investments/123',
  '/api/hap/reports',
  '/api/hap/settings/456',
  '/health',
  '/api/unknown'
];

testPaths.forEach(path => {
  const service = getServiceByPath(path);
  if (service) {
    console.log(`  ${path} -> ${service.name} (${service.url}${service.targetPath})`);
  } else {
    console.log(`  ${path} -> 无匹配服务`);
  }
});

// 创建演示应用
const app = new Hono();

// 导入自动路由中间件
const { createProxyMiddleware } = require('./src/middleware/proxy');

// 应用中间件
app.use('*', createProxyMiddleware());

// 添加示例路由
app.get('/api/ira/demo', async (c) => {
  console.log('📞 IRA 演示接口被调用');
  // 这里可以添加业务逻辑
  // 请求会自动代理到 IRA_BASE_URL/demo
});

app.get('/api/hap/demo', async (c) => {
  console.log('📞 HAP 演示接口被调用');
  // 这里可以添加业务逻辑
  // 请求会自动代理到 HAP_BASE_URL/demo
});

// 健康检查
app.get('/health', async (c) => {
  return c.json({
    status: 'OK',
    message: '自动路由架构运行正常',
    timestamp: new Date().toISOString()
  });
});

// 根路径
app.get('/', async (c) => {
  return c.html(`
    <h1>🏗️ IRA Backend 自动路由架构</h1>
    <p>演示服务器运行中...</p>
    <h3>可用端点:</h3>
    <ul>
      <li><a href="/health">/health</a> - 健康检查</li>
      <li>/api/ira/* - 自动路由到 IRA 服务</li>
      <li>/api/hap/* - 自动路由到 HAP 服务</li>
    </ul>
    <h3>示例:</h3>
    <ul>
      <li>/api/ira/demo - IRA 演示接口</li>
      <li>/api/hap/demo - HAP 演示接口</li>
    </ul>
  `);
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  console.log(`\n🌐 启动演示服务器在端口 ${PORT}`);
  console.log(`访问 http://localhost:${PORT} 查看演示\n`);

  serve({
    fetch: app.fetch,
    port: PORT
  }, () => {
    console.log(`✅ 服务器运行在 http://localhost:${PORT}`);
    console.log('\n💡 开发者使用指南:');
    console.log('1. 创建路由时使用 /api/ira/* 或 /api/hap/* 路径');
    console.log('2. 框架会自动选择对应的后端服务');
    console.log('3. 专注于业务逻辑，无需处理路由配置');
  });
}

module.exports = app;