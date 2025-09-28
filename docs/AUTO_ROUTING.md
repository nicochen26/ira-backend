# 自动路由架构使用指南

## 概述

IRA Backend 现在支持基于路径的自动路由系统。开发者无需关心路由配置，只需要按照约定的路径前缀开发接口即可。

## 路由规则

### 自动路由映射

```
/api/ira/*  -> IRA_BASE_URL/*
/api/hap/*  -> HAP_BASE_URL/*
```

### 环境配置

在 `.env` 文件中配置后端服务 URL：

```env
IRA_BASE_URL=https://api.invest-research.example.com/v1
HAP_BASE_URL=https://api.hemera.example.com/v1
```

## 开发指南

### 1. 创建接口

开发者只需要按照正常的 Hono 路由方式创建接口：

```javascript
const { Hono } = require('hono');
const app = new Hono();

// IRA 服务接口
app.get('/ira/users', async (c) => {
  // 请求会自动代理到: IRA_BASE_URL/users
  // 在这里添加业务逻辑、验证等
});

// HAP 服务接口
app.get('/hap/reports', async (c) => {
  // 请求会自动代理到: HAP_BASE_URL/reports
  // 在这里添加业务逻辑、验证等
});
```

### 2. 请求处理流程

1. 客户端请求: `GET /api/ira/users`
2. 框架识别路径前缀 `/api/ira`
3. 自动选择 IRA 服务 (IRA_BASE_URL)
4. 移除路径前缀: `/ira/users` -> `/users`
5. 代理到: `IRA_BASE_URL/users`
6. 返回响应给客户端

### 3. 支持的功能

- **所有 HTTP 方法**: GET, POST, PUT, DELETE, PATCH 等
- **查询参数**: 自动透传
- **请求头**: 完全透传
- **请求体**: 完全透传
- **路径参数**: 自动保留

### 4. 开发示例

```javascript
// 数据验证示例
app.post('/ira/investments', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.amount || body.amount <= 0) {
      return c.json({ error: 'Invalid amount' }, 400);
    }

    // 验证通过，请求自动转发
  } catch (error) {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
});

// 权限检查示例
app.get('/hap/reports', async (c) => {
  const userId = c.req.query('userId');
  if (!userId) {
    return c.json({ error: 'userId required' }, 400);
  }

  // 权限检查通过，请求自动转发
});
```

## 健康检查

访问 `/health` 端点可以查看所有服务的状态和路由信息：

```json
{
  "status": "OK",
  "services": [
    {
      "name": "IRA Service",
      "key": "ira",
      "pathPrefix": "/api/ira",
      "status": "healthy"
    },
    {
      "name": "HAP Service",
      "key": "hap",
      "pathPrefix": "/api/hap",
      "status": "healthy"
    }
  ],
  "routingInfo": {
    "description": "Automatic path-based routing",
    "routes": [
      {
        "path": "/api/ira/*",
        "service": "IRA Service",
        "target": "https://api.invest-research.example.com/v1"
      },
      {
        "path": "/api/hap/*",
        "service": "HAP Service",
        "target": "https://api.hemera.example.com/v1"
      }
    ]
  }
}
```

## 优势

1. **零配置**: 开发者无需配置路由映射
2. **自动选择**: 基于路径自动选择后端服务
3. **透明代理**: 完整保留请求/响应数据
4. **简单扩展**: 添加新服务只需更新配置
5. **专注业务**: 开发者专注于接口逻辑而非路由管理

## 注意事项

- 路径前缀必须是 `/api/ira` 或 `/api/hap`
- 不匹配任何前缀的请求会继续到下一个中间件
- 健康检查接口 `/health` 不会被代理
- 后端服务需要提供 `/health` 端点用于连通性检查