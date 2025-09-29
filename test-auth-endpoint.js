#!/usr/bin/env node

// 测试认证接口的路由功能
const { getServiceByPath } = require('./src/config/agents');

console.log('🔐 测试 POST /api/auth/generate-token 接口路由');

// 加载环境变量
require('dotenv').config();

try {
  // 测试路由解析
  const service = getServiceByPath('/api/auth/generate-token');

  if (service) {
    console.log('✅ 路由解析成功:');
    console.log(`   原始路径: /api/auth/generate-token`);
    console.log(`   目标服务: ${service.name}`);
    console.log(`   服务URL: ${service.url}`);
    console.log(`   转发路径: ${service.targetPath}`);
    console.log(`   完整URL: ${service.url}${service.targetPath}`);

    console.log('\n📋 接口信息:');
    console.log('   方法: POST');
    console.log('   路径: /api/auth/generate-token');
    console.log('   功能: 生成JWT令牌');
    console.log('   请求体: { userId, email, name }');
    console.log('   转发到: AUTH_BASE_URL/generate-token');

    console.log('\n🎯 使用示例:');
    console.log('   curl -X POST http://localhost:3000/api/auth/generate-token \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"userId":"123","email":"user@example.com","name":"John Doe"}\'');

  } else {
    console.log('❌ 路由解析失败 - 没有匹配的服务');
  }

} catch (error) {
  console.error('❌ 配置错误:', error.message);
  console.log('\n请检查环境变量配置:');
  console.log('- AUTH_BASE_URL');
  console.log('- IRA_BASE_URL');
  console.log('- HAP_BASE_URL');
}