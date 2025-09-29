# IRA Backend Brownfield Enhancement PRD

## Intro Project Analysis and Context

### Existing Project Overview

**Analysis Source**: IDE-based 实时分析

**Current Project State**:
- **项目名称**: IRA Backend (Investment Research API)
- **主要功能**: 基于Hono.js的投资研究后端API，使用代理中间件模式进行服务路由
- **核心架构**: 代理网关，将请求路由到不同的后端服务
- **当前状态**: 基础框架已搭建，包含健康检查、认证路由、线程管理等核心功能

### Available Documentation Analysis

**现有文档检查**:
- ✅ Tech Stack: Hono.js + Node.js + PostgreSQL
- ✅ 基础架构: 代理中间件模式 + 路径路由
- ✅ API模式: RESTful API，带有基础验证
- ❌ 详细API文档
- ❌ 数据库架构文档
- ❌ UX/UI指南
- ❌ 技术债务文档

### Enhancement Scope Definition

**Enhancement Type**:
- ✅ 新功能添加 (用户/团队管理系统)
- ✅ 与新系统集成 (PostgreSQL直连 + SSE)

**Enhancement Description**:
创建一套完整的用户和团队管理API系统，包括用户注册、令牌生成、团队管理、搜索功能和实时流式响应，数据存储在PostgreSQL中。

**Impact Assessment**:
- ✅ 重大影响 (需要架构变更)
  - 新增数据库层 (目前主要是代理模式)
  - 新增SSE流式响应功能
  - 新增用户身份验证和授权系统
  - 需要8个新的API端点

### Goals and Background Context

**Goals**:
- 为IRA系统添加完整的用户和团队管理功能
- 实现基于PostgreSQL的数据持久化
- 提供搜索功能和实时思考过程展示
- 建立团队协作和权限管理机制

**Background Context**:
当前IRA后端主要作为代理网关运行，将请求路由到外部服务。这个增强将添加第一个主要的本地数据存储和业务逻辑功能，需要在保持现有代理功能不变的情况下，集成新的用户管理、团队协作和搜索功能。

**Change Log**:
| Change | Date | Version | Description | Author |
|--------|------|---------|-------------|---------|
| Initial PRD Creation | 2025-09-29 | v1.0 | 用户/团队管理API系统规划 | John (PM) |

## Requirements

### Functional Requirements

**FR1**: 系统应提供用户注册API，创建新用户账户并存储在PostgreSQL数据库中，不影响现有代理路由功能

**FR2**: 系统应提供generate-token API，如果用户不存在则在PostgreSQL中创建用户记录，然后将用户信息传递给现有后端服务生成实际token，返回后端服务生成的认证令牌

**FR3**: 系统应提供创建团队API，允许已认证用户创建新团队并成为团队管理员

**FR4**: 系统应提供成员加入团队API，支持邀请和批准机制，管理团队成员关系

**FR5**: 系统应提供search API，记录用户搜索请求，包括search topic、时间戳、生成的报告和思考过程数据

**FR6**: 系统应提供个人search list API，返回指定成员的搜索历史（仅标题和创建时间）

**FR7**: 系统应提供团队search list API，返回团队所有成员的搜索历史汇总（仅标题和创建时间）

**FR8**: 系统应提供search stream API，需要token验证身份，通过SSE实时返回搜索思考过程和最终markdown报告，数据同步存储到PostgreSQL

### Non Functional Requirements

**NFR1**: 新增API必须与现有Hono.js代理中间件架构兼容，不干扰现有路由和健康检查功能

**NFR2**: PostgreSQL连接必须使用连接池，支持并发访问，连接配置通过.env管理（已有POSTGRES_URI配置）

**NFR3**: SSE实现必须支持至少100个并发连接，响应时间不超过100ms（初始连接）

**NFR4**: API响应时间应保持在500ms以内（不包括SSE流式响应），与现有系统性能特征一致

**NFR5**: 所有新增API必须包含适当的错误处理和日志记录，遵循现有中间件模式

**NFR6**: 数据库操作必须支持事务处理，确保数据一致性，特别是用户-团队关系管理

### Compatibility Requirements

**CR1**: 现有代理路由功能保持完全不变，新API使用独立的路由路径（如/api/users, /api/teams, /api/search）

**CR2**: 数据库架构设计必须支持未来扩展，不影响可能的现有数据结构（如果存在）

**CR3**: 新的generate-token API将完全替换现有/api/auth/generate-token，但必须保持对后端认证服务的调用，确保token生成逻辑的一致性

**CR4**: SSE实现必须与现有CORS和安全头中间件兼容，不破坏现有安全策略

**CR5**: 数据库表结构设计必须从零开始，包括users, teams, team_members, searches, search_results等表，支持未来的schema演进

### Integration Requirements

**IR1**: Generate-token API必须集成现有的后端认证服务调用逻辑，确保token生成的一致性和兼容性

**IR2**: SSE端点必须实现token验证机制，验证用户身份后提供实时数据流

**IR3**: 所有需要身份验证的API必须支持token-based认证，与后端服务生成的token格式兼容

## Technical Constraints and Integration Requirements

### Existing Technology Stack

**Languages**: JavaScript (Node.js)
**Frameworks**: Hono.js v4.9.8, Prisma ORM
**Database**: PostgreSQL + Prisma Client
**Infrastructure**: Node.js服务器，代理中间件架构，SSE library
**External Dependencies**:
- 现有: dotenv v17.2.2, Hono.js, 现有后端认证服务 (AUTH_BASE_URL)
- 新增: @prisma/client, prisma, jsonwebtoken, sse-channel

### Integration Approach

**Database Integration Strategy**:
- 添加Prisma ORM和客户端库
- 创建数据库迁移系统 (users, teams, team_members, searches, search_results表)
- 实现事务支持的数据访问层
- 集成现有POSTGRES_URI配置

**API Integration Strategy**:
- 替换现有/api/auth/generate-token路由，保持后端服务调用
- 添加新路由组: /api/users, /api/teams, /api/search
- 保持现有代理中间件不变，新API使用直接处理
- SSE端点需要绕过代理中间件，直接处理

**Frontend Integration Strategy**:
- SSE客户端需要支持token-based认证
- 新API返回JSON格式，与现有API风格一致
- CORS设置需要支持SSE连接
- 错误响应格式保持与现有模式一致

**Testing Integration Strategy**:
- 扩展现有Jest测试框架
- 添加数据库测试环境配置
- SSE端点测试需要WebSocket/EventSource测试工具
- 集成测试需要覆盖与后端服务的交互

### Code Organization and Standards

**File Structure Approach**:
```
src/
├── controllers/          # 用户、团队、搜索控制器
├── middleware/
│   ├── proxy.js         # 现有代理中间件
│   └── auth.js          # 新增JWT认证中间件
├── routes/              # 扩展路由
├── sse/                 # SSE实现和连接管理
├── prisma/
│   ├── schema.prisma    # 数据库schema定义
│   └── migrations/      # 自动生成的迁移文件
└── utils/
    └── jwt.js           # JWT验证工具
```

**Naming Conventions**:
- 遵循现有驼峰命名法
- 数据库表使用下划线命名 (user_teams, search_results)
- API端点使用复数名词 (/users, /teams, /searches)
- 控制器文件使用 {entity}Controller.js 格式

**Coding Standards**:
- 遵循现有ESLint配置
- 使用async/await模式处理异步操作
- 错误处理遵循现有模式 (返回JSON错误对象)
- 使用现有的Hono.js中间件模式

**Documentation Standards**:
- API文档使用JSDoc注释格式
- 数据库schema文档化
- SSE事件格式文档化

### Deployment and Operations

**Build Process Integration**:
- 使用现有npm脚本 (npm start, npm dev, npm test)
- 添加数据库迁移脚本 (npm run migrate)
- 扩展测试脚本覆盖新功能

**Deployment Strategy**:
- 数据库迁移作为部署前步骤
- 环境变量管理保持现有.env模式
- 零停机部署需要考虑SSE连接处理

**Monitoring and Logging**:
- 使用现有Hono logger中间件
- 添加数据库连接池监控
- SSE连接数和性能监控
- 错误日志与现有系统集成

**Configuration Management**:
- 扩展现有.env配置
- 数据库连接配置已存在 (POSTGRES_URI)
- 新增SSE相关配置选项
- 保持现有服务URL配置模式

### Risk Assessment and Mitigation

**Technical Risks**:
- SSE长连接可能影响服务器资源 → 实现连接限制和超时机制
- 数据库连接池耗尽 → 配置合理的连接池大小和超时
- 新认证流程可能破坏现有集成 → 分阶段迁移，保持向后兼容

**Integration Risks**:
- 代理中间件可能干扰新API → 确保路径匹配规则正确配置
- 后端认证服务依赖 → 实现降级机制和重试逻辑
- 数据库迁移失败 → 实现回滚机制和备份策略

**Deployment Risks**:
- 数据库schema变更 → 使用渐进式迁移，支持多版本兼容
- SSE连接中断 → 实现自动重连和状态恢复
- 现有功能回归 → 全面的集成测试覆盖

**Mitigation Strategies**:
- 分阶段实施: 先数据库层，再API层，最后SSE
- 功能开关: 使用环境变量控制新功能启用
- 监控就绪: 实现关键指标监控和告警
- 回滚计划: 数据库和代码都支持快速回滚

## Epic and Story Structure

**Epic Approach**: 单个综合Epic，包含6-7个故事，确保每个故事都能独立交付价值同时维护系统完整性

## Epic 1: 用户和团队管理API系统

**Epic Goal**: 为IRA Backend添加完整的用户和团队管理功能，包括认证、团队协作和实时搜索功能，同时保持现有代理架构的完整性

**Integration Requirements**: 与现有Hono.js代理中间件和谐共存，使用Prisma进行数据管理，通过JWT进行身份验证，支持SSE实时通信

### Story 1.1: 数据库基础设施和用户模型

作为一个系统管理员，
我希望建立PostgreSQL数据库连接和基础用户表结构，
以便为整个用户管理系统提供数据存储基础。

#### Acceptance Criteria

1. Prisma配置完成，连接到现有PostgreSQL数据库
2. 用户表(users)创建，包含id、email、name、created_at等基础字段
3. 数据库连接池配置和错误处理实现
4. 基础的用户CRUD操作实现
5. 数据库迁移系统建立

#### Integration Verification

- IV1: 现有代理中间件功能完全不受影响，健康检查正常
- IV2: 数据库连接不影响应用启动时间和内存使用
- IV3: 错误情况下应用能够正常降级，不影响代理功能

### Story 1.2: JWT认证中间件和Token生成

作为一个开发者，
我希望实现JWT认证系统和新的generate-token API，
以便替换现有认证同时保持与后端服务的集成。

#### Acceptance Criteria

1. JWT认证中间件实现，支持token验证和用户信息提取
2. 新的/api/auth/generate-token端点替换现有实现
3. 用户不存在时自动创建用户记录
4. 与现有后端认证服务集成，保持token生成逻辑
5. 错误处理和用户反馈机制

#### Integration Verification

- IV1: 现有使用旧token的客户端不受影响（向后兼容期）
- IV2: 后端认证服务调用正常，响应时间符合现有标准
- IV3: 认证失败时的错误响应格式与现有模式一致

### Story 1.3: 团队管理API

作为一个用户，
我希望能够创建团队并管理团队成员，
以便与其他用户协作进行投资研究。

#### Acceptance Criteria

1. 团队表(teams)和成员关系表(team_members)创建
2. 创建团队API实现，支持团队名称和描述
3. 成员加入团队API实现，支持邀请机制
4. 团队成员列表和权限管理
5. 团队删除和成员移除功能

#### Integration Verification

- IV1: JWT认证中间件正确验证团队操作权限
- IV2: 数据库事务确保团队-成员关系一致性
- IV3: API响应格式与现有路由风格保持一致

### Story 1.4: 基础搜索API和数据模型

作为一个用户，
我希望能够发起搜索请求并保存搜索结果，
以便追踪我的研究历史和结果。

#### Acceptance Criteria

1. 搜索表(searches)创建，包含topic、用户关联、时间戳
2. 搜索结果表(search_results)创建，存储报告和思考过程
3. 发起搜索API实现，记录搜索元数据
4. 搜索数据持久化和查询接口
5. 用户权限验证和数据关联

#### Integration Verification

- IV1: 搜索API使用JWT认证，正确识别用户身份
- IV2: 数据库查询性能不影响其他API响应时间
- IV3: 搜索数据结构支持未来的扩展需求

### Story 1.5: 搜索列表查询API

作为一个用户，
我希望能够查看自己和团队的搜索历史，
以便快速浏览过往的研究成果。

#### Acceptance Criteria

1. 个人搜索列表API(/api/search/my)实现
2. 团队搜索列表API(/api/search/team/{teamId})实现
3. 分页和排序功能支持
4. 仅返回标题和创建时间，优化性能
5. 权限验证确保数据访问安全

#### Integration Verification

- IV1: 查询API响应时间在500ms内，符合现有性能标准
- IV2: 团队权限验证正确，用户只能访问授权团队数据
- IV3: API分页机制与潜在的前端集成兼容

### Story 1.6: SSE实时搜索流

作为一个用户，
我希望通过SSE实时接收搜索思考过程和最终报告，
以便实时了解AI的分析过程和结果。

#### Acceptance Criteria

1. SSE库集成和连接管理实现
2. 搜索流API(/api/search/stream/{searchId})实现
3. 实时发送思考过程和最终markdown报告
4. 数据同步存储到PostgreSQL
5. JWT token验证和连接授权

#### Integration Verification

- IV1: SSE连接不干扰现有代理中间件和CORS设置
- IV2: 并发SSE连接不影响服务器内存和性能
- IV3: 连接中断时的重连机制和状态恢复正常

### Story 1.7: 系统集成和文档

作为一个开发者，
我希望完善系统文档和集成测试，
以便确保整个用户管理系统稳定可靠。

#### Acceptance Criteria

1. API文档完整，包含所有端点和参数说明
2. 数据库schema文档和关系图
3. 集成测试覆盖所有主要用户流程
4. 错误处理和边界情况测试
5. 性能测试和负载测试基准

#### Integration Verification

- IV1: 所有新功能不影响现有代理路由和健康检查
- IV2: 完整的用户注册-团队创建-搜索流程端到端测试通过
- IV3: 系统在各种故障情况下都能优雅降级