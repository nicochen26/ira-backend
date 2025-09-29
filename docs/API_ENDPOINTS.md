# API 接口文档

## 认证接口 (Auth Service)

### POST /api/auth/generate-token

生成JWT令牌用于用户认证。

**请求路径:** `/api/auth/generate-token`
**HTTP方法:** POST
**Content-Type:** application/json

#### 请求体

```json
{
  "userId": "string",
  "email": "string",
  "name": "string"
}
```

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/auth/generate-token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "email": "john.doe@example.com",
    "name": "John Doe"
  }'
```

#### 路由详情

- **内部路由:** `/auth/generate-token`
- **目标服务:** Auth Service (`AUTH_BASE_URL`)
- **最终转发到:** `{AUTH_BASE_URL}/generate-token`

#### 响应

响应格式由后端认证服务决定，通常包含：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

---

## 会话管理接口 (Threads)

### GET /api/ira/threads/history

获取IRA服务中当前认证用户的所有历史会话（threads）列表。

**请求路径:** `/api/ira/threads/history`
**HTTP方法:** GET

#### 请求头

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

#### 查询参数

| 参数 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| limit | number | 否 | 100 | 返回记录数量限制 (1-1000) |
| offset | number | 否 | 0 | 偏移量，用于分页 |

#### 请求示例

```bash
curl -X GET "http://localhost:3000/api/ira/threads/history?limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### 路由详情

- **内部路由:** `/threads/history`
- **目标服务:** IRA Service (`IRA_BASE_URL`)
- **最终转发到:** `{IRA_BASE_URL}/threads/history`

#### 成功响应 (200)

```json
{
  "success": true,
  "data": [
    {
      "thread_id": "a8c5d8c5-d2b0-4188-a642-3897c18cc2cb",
      "created_at": "2025-09-28T11:04:21.559Z",
      "metadata": {
        "user_id": "098ac058-778e-4dfe-81d7-7397cb364cd8",
        "graph_id": "planned-supervisor-agent"
      },
      "values": {
        "messages": [...]
      }
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

#### 错误响应

**400 参数错误**
```json
{
  "success": false,
  "error": "Invalid limit parameter. Must be between 1 and 1000."
}
```

**401 未认证**
```json
{
  "success": false,
  "error": "Authentication required. Please provide a valid Bearer token."
}
```

### GET /api/hap/threads/history

获取HAP服务中当前认证用户的所有历史会话（threads）列表。

功能与IRA服务的threads/history接口完全相同，只是路由到不同的后端服务。

**请求路径:** `/api/hap/threads/history`
**路由详情:** `{HAP_BASE_URL}/threads/history`

---

## 其他服务接口示例

### IRA 服务接口

所有以 `/api/ira/` 开头的请求会自动路由到 IRA 服务。

```bash
# 示例：获取用户列表
GET /api/ira/users → IRA_BASE_URL/users

# 示例：创建投资
POST /api/ira/investments → IRA_BASE_URL/investments
```

### HAP 服务接口

所有以 `/api/hap/` 开头的请求会自动路由到 HAP 服务。

```bash
# 示例：获取报表
GET /api/hap/reports → HAP_BASE_URL/reports

# 示例：更新设置
PUT /api/hap/settings/123 → HAP_BASE_URL/settings/123
```

---

## 健康检查

### GET /health

检查所有服务的健康状态和路由配置。

```bash
curl http://localhost:3000/health
```

#### 响应示例

```json
{
  "status": "OK",
  "timestamp": "2024-09-28T10:00:00.000Z",
  "uptime": 123.456,
  "services": [
    {
      "name": "IRA Service",
      "key": "ira",
      "pathPrefix": "/api/ira",
      "status": "healthy",
      "responseTime": 45
    },
    {
      "name": "HAP Service",
      "key": "hap",
      "pathPrefix": "/api/hap",
      "status": "healthy",
      "responseTime": 32
    },
    {
      "name": "Auth Service",
      "key": "auth",
      "pathPrefix": "/api/auth",
      "status": "healthy",
      "responseTime": 28
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
      },
      {
        "path": "/api/auth/*",
        "service": "Auth Service",
        "target": "https://api.auth.example.com/v1"
      }
    ]
  }
}
```

---

## 错误处理

### 客户端错误 (4xx)

- **400 Bad Request:** 请求参数缺失或格式错误
- **404 Not Found:** 请求的资源不存在

### 服务器错误 (5xx)

- **500 Internal Server Error:** 代理请求失败
- **502 Bad Gateway:** 无法连接到后端服务

### 错误响应格式

```json
{
  "error": "Error Type",
  "message": "详细错误信息"
}
```