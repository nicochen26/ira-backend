#!/usr/bin/env node

// 测试 threads/history 接口的路由功能
const { getServiceByPath } = require('./src/config/agents');

console.log('📝 测试 GET /api/ira/threads/history 和 /api/hap/threads/history 接口路由');

// 加载环境变量
require('dotenv').config();

try {
  console.log('\n🔍 IRA服务路由测试:');

  // 测试IRA服务路由解析
  const iraService = getServiceByPath('/api/ira/threads/history');
  if (iraService) {
    console.log('✅ IRA路由解析成功:');
    console.log(`   原始路径: /api/ira/threads/history`);
    console.log(`   目标服务: ${iraService.name}`);
    console.log(`   服务URL: ${iraService.url}`);
    console.log(`   转发路径: ${iraService.targetPath}`);
    console.log(`   完整URL: ${iraService.url}${iraService.targetPath}`);
  } else {
    console.log('❌ IRA路由解析失败');
  }

  console.log('\n🔍 HAP服务路由测试:');

  // 测试HAP服务路由解析
  const hapService = getServiceByPath('/api/hap/threads/history');
  if (hapService) {
    console.log('✅ HAP路由解析成功:');
    console.log(`   原始路径: /api/hap/threads/history`);
    console.log(`   目标服务: ${hapService.name}`);
    console.log(`   服务URL: ${hapService.url}`);
    console.log(`   转发路径: ${hapService.targetPath}`);
    console.log(`   完整URL: ${hapService.url}${hapService.targetPath}`);
  } else {
    console.log('❌ HAP路由解析失败');
  }

  console.log('\n📋 接口信息:');
  console.log('   方法: GET');
  console.log('   功能: 获取用户历史会话列表');
  console.log('   认证: Bearer Token (必需)');
  console.log('   查询参数:');
  console.log('     - limit: 返回记录数量 (1-1000, 默认100)');
  console.log('     - offset: 分页偏移量 (默认0)');

  console.log('\n🎯 使用示例:');

  console.log('\n   IRA服务:');
  console.log('   curl -X GET "http://localhost:3000/api/ira/threads/history?limit=10&offset=0" \\');
  console.log('     -H "Authorization: Bearer YOUR_JWT_TOKEN" \\');
  console.log('     -H "Content-Type: application/json"');

  console.log('\n   HAP服务:');
  console.log('   curl -X GET "http://localhost:3000/api/hap/threads/history?limit=10&offset=0" \\');
  console.log('     -H "Authorization: Bearer YOUR_JWT_TOKEN" \\');
  console.log('     -H "Content-Type: application/json"');

  console.log('\n📄 期望响应格式:');
  console.log(`   {
     "success": true,
     "data": [
       {
         "thread_id": "uuid",
         "created_at": "ISO-8601",
         "metadata": { ... },
         "values": { ... }
       }
     ],
     "total": 1,
     "limit": 10,
     "offset": 0
   }`);

  console.log('\n🚨 错误处理:');
  console.log('   - 401: 缺少或无效的认证令牌');
  console.log('   - 400: 无效的查询参数 (limit超出范围或offset为负数)');
  console.log('   - 500: 后端服务错误');

} catch (error) {
  console.error('❌ 配置错误:', error.message);
  console.log('\n请检查环境变量配置:');
  console.log('- IRA_BASE_URL');
  console.log('- HAP_BASE_URL');
  console.log('- AUTH_BASE_URL');
}