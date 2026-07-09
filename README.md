# Multi-Agent — AI 营销 SaaS 平台

一站式 AI 营销全栈解决方案，基于 **TypeScript + Next.js** 前端、**Python + FastAPI + MZmulti_agent** 编排层、**PostgreSQL + pgvector** 数据底座构建。

> **愿景**：以 MZmulti_agent 智能体编排为核心，为营销团队提供从内容洞察、策略规划到多平台分发的全链路 AI 化解决方案。

---

## 📦 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| **前端语言** | TypeScript (TSX) | 类型安全，Next.js 官方推荐 |
| **前端框架** | Next.js 15 (React 19) | SSR、App Router、API 路由代理、多语言 i18n |
| **后端语言** | Python 3.11+ | AI 生态核心语言 |
| **后端框架** | FastAPI | 异步高性能、WebSocket 网关、自动 OpenAPI 文档 |
| **AI 编排** | LangGraph | 多智能体工作流、状态管理、条件路由、人工审批 (HITL) |
| **数据库** | PostgreSQL + pgvector | 业务数据存储 + 向量检索（RAG 底座） |
| **缓存/队列** | Redis | Session 缓存、速率限制、Celery 消息队列 |
| **异步任务** | Celery | 后台耗时任务（批量生成、数据同步） |
| **容器化** | Docker + Docker Compose | 一键启动、环境隔离 |
| **国际化** | next-intl (zh / en / pl) | 多语言路由、完整翻译框架 |

---

## ✨ 已实现功能

### 🧱 项目基础架构
- 前后端分离项目骨架（frontend/ + backend/）
- Docker Compose 多容器编排（Backend + PostgreSQL + Redis + Celery + Flower）
- Alembic 数据库迁移机制，已成功执行
- 完整的 CI/测试体系（后端 100% 覆盖率）

### 🔐 用户与认证
- JWT 双 Token 机制（Access + Refresh Token）
- Google OAuth 社交登录
- API Key 鉴权
- 角色权限系统（Admin / User）
- 多语言路由支持 `/zh`（默认）、`/en`、`/pl`

### 🤖 AI 供应商管理
- **前端**：`/settings/providers` 配置页面
- **预置供应商**：Google Gemini、GitHub Models、NVIDIA NIM、ModelScope、Cohere、Agnes AI
- **自定义供应商**：用户可自由添加名称和 API URL
- **后端 API**：`/api/v1/me/providers` 完整 CRUD
- **数据库持久化**：`user_providers` 表安全存储 API Key

### 💬 AI 对话引擎（Chat）
- WebSocket 实时流式输出
- 多轮对话、思维链展示
- 文件上传与分析（PDF、DOCX、TXT、图片等 80+ 格式）
- 模型切换、温度控制、知识库绑定
- 斜杠命令（/clear、/regen、/summarize 等）
- 对话分享、导出、评分系统
- 工具调用卡片（Web 搜索、RAG、Python 执行等）
- 人工审批 (Human-in-the-Loop)

### 📚 知识库（RAG）
- PostgreSQL pgvector 向量存储
- 文件上传 + 自动分块 + 向量化
- 多 Collection 管理
- 同步源接入（Google Drive、S3 等插件式 Connector）
- 混合搜索（BM25 + 向量）

### 🏢 组织管理
- 多组织工作空间
- 角色层级（Owner / Admin / Member / Viewer）
- 邀请机制（邮箱 + Token）
- 组织级集成配置

### 💳 计费系统
- Stripe 订阅管理
- Checkout / Portal 集成
- 信用额度与用量追踪
- 发票记录

### ⚙️ 设置与管理
- 个人资料 / 账户安全
- 外观主题（亮色 / 暗色）
- 通知偏好
- 斜杠命令自定义
- 管理后台（SQLAdmin + REST API）
- 系统健康监控

---

## 🚀 快速开始

### 前置要求

- Docker Desktop
- Node.js >= 18
- Python 3.11+
- pnpm / bun / npm

### 一键启动

```bash
# Windows 双击 start.bat，脚本会自动：
# 1. 创建后端 .env 配置文件
# 2. 启动 Docker 容器（PostgreSQL + Redis）
# 3. 执行数据库迁移
# 4. 启动 FastAPI 后端
# 5. 启动 Next.js 前端开发服务器
```

### 手动启动

```bash
# 后端
cd backend
cp .env.example .env
uv run uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
bun install
bun dev
```

### 访问地址

| 服务 | 地址 |
|------|------|
| **前端界面** | http://localhost:3000 |
| **后端 API** | http://localhost:8000 |
| **API 文档 (Swagger)** | http://localhost:8000/docs |
| **管理后台** | http://localhost:8000/admin |
| **后端可观测 (Logfire)** | 配置后可用 |

### 默认管理员

| 项目 | 值 |
|------|-----|
| 邮箱 | `admin@multi-agent.local` |
| 密码 | 注册后自动提升为管理员 |

---

## 🧪 测试

```bash
cd backend
uv run pytest           # 运行全部测试
uv run pytest -v        # 详细输出
uv run pytest tests/    # 指定目录

cd frontend
bun test                # 前端单元测试
bun test:e2e            # E2E 测试（Playwright）
```

---

## 🌐 国际化

项目支持三种语言，默认中文：

| 语言 | 代码 | 默认 | 翻译覆盖 |
|------|:----:|:----:|:--------:|
| **简体中文** | `zh` | ✅ | 100% |
| English | `en` | | 100% |
| Polski | `pl` | | 100% |

---

## 🧩 项目结构

```
multi_agent/
├── backend/                  # Python FastAPI 后端
│   ├── app/
│   │   ├── api/              # API 路由 & 异常处理
│   │   ├── core/             # 配置、安全、中间件、缓存
│   │   ├── db/models/        # SQLAlchemy 数据模型
│   │   ├── repositories/     # 数据访问层
│   │   ├── schemas/          # Pydantic 请求/响应模型
│   │   ├── services/         # 业务逻辑层
│   │   ├── agents/           # AI Agent 工具 & 提示词
│   │   ├── workers/          # Celery 后台任务
│   │   └── commands/         # CLI 管理命令
│   ├── alembic/              # 数据库迁移
│   └── tests/                # 测试套件
│
├── frontend/                 # Next.js 前端
│   ├── src/
│   │   ├── app/              # App Router 页面 & API 路由
│   │   ├── components/       # UI 组件
│   │   ├── hooks/            # React Hooks
│   │   ├── stores/           # Zustand 状态管理
│   │   ├── lib/              # API 客户端、工具函数
│   │   └── messages/         # i18n 翻译文件
│   └── public/               # 静态资源
│
├── docker-compose.yml        # 容器编排
├── Makefile                  # 常用命令
├── AGENTS.md                 # AI 代理工作手册
└── start.bat                 # Windows 一键启动
```

---

## 📄 许可证

MIT License — 详见 [LICENSE](LICENSE) 文件。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解开发规范。
