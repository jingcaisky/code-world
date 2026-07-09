# AGENTS.md

Working handbook for agents in `D:\MZmulti_agent`.

## Project Snapshot

`multi_agent` is a template-generated full-stack app with:

- FastAPI + Pydantic v2 backend
- PostgreSQL with async SQLAlchemy / asyncpg
- JWT refresh tokens, API keys, and Google OAuth
- Redis for cache, rate limiting, and Celery plumbing
- LangGraph-based agent orchestration
- RAG on PostgreSQL pgvector
- Next.js 15 + React 19 frontend with i18n
- Stripe billing, admin screens, file uploads, chat, and knowledge-base tools

The repo is split into `backend/` and `frontend/`, with shared operational docs in the root and `docs/`.

## Source Of Truth

When docs disagree, trust the code and config files first:

1. `backend/app/core/config.py`
2. `backend/app/main.py`
3. `backend/app/api/router.py`
4. `backend/app/services/`
5. `backend/app/repositories/`
6. `frontend/src/`
7. `backend/.env.example`
8. `frontend/.env.example`

Use the docs as a map, but re-check the implementation before changing anything significant.

## Repository Map

### Backend

`backend/app/` is organized as:

- `api/routes/v1/` - HTTP endpoints
- `api/deps.py` - dependency aliases and service factories
- `core/` - config, security, middleware, cache, rate limiting, exceptions
- `db/models/` - SQLAlchemy models
- `repositories/` - pure data access, `flush()` only
- `schemas/` - Pydantic request/response models
- `services/` - business logic and orchestration
- `agents/` - agent wrappers, prompts, tools
- `services/rag/` - embeddings, retrieval, chunking, vector store, ingestion
- `services/rag/connectors/` - pluggable sync connectors
- `worker/` - Celery app and async background tasks
- `commands/` - auto-discovered Click commands

### Frontend

`frontend/src/` is organized as:

- `app/` - Next.js App Router, locale-prefixed routes, API route handlers
- `components/` - UI, chat, billing, marketing, admin, onboarding, KB
- `hooks/` - React hooks for chat, auth, orgs, billing, sources, websocket
- `stores/` - Zustand stores
- `lib/` - API clients, helpers, query keys, SEO, RAG helpers
- `types/` - shared TypeScript types
- `messages/` - translation catalogs (`zh`, `en`, `pl`)

## Architecture Rules

### Layering

The backend follows a strict route -> service -> repository flow:

- Routes validate input and call services.
- Services contain business rules and raise domain exceptions.
- Repositories perform database access only.
- Models define persistence.
- Schemas define create/update/read/list contracts.

Do not put direct database access in routes.

### Repository Rules

- Use `db.flush()` and `db.refresh()` in repositories.
- Do not call `commit()` inside repositories.
- Keep repository methods small and keyword-oriented.

### Service Rules

- Raise `NotFoundError`, `AlreadyExistsError`, `BadRequestError`, etc. from services.
- Treat services as the only layer that knows domain behavior.
- Keep services thin when the domain is thin; split into subpackages when the domain grows.

### Schema Rules

- Keep separate `Create`, `Update`, `Response`, and `List` schemas.
- Use `from_attributes=True` for response schemas.
- Updates should be nullable fields, not partial dicts.

### Route Rules

- Prefer `Annotated[...]` dependencies from `app/api/deps.py`.
- Route handlers usually return `-> Any`; `response_model` owns serialization.
- Keep routes thin and side-effect free beyond service calls.

### Identity, Scope, and Permissions

- Auth is JWT + refresh token + API key + Google OAuth.
- Role model is `admin` / `user`.
- Admin access is checked with `RoleChecker` and `CurrentAdmin`.
- Conversations and chat files are user-scoped and protected against IDOR at the service layer.
- RAG collections are global across users; search is broadly available, but collection management is admin-only.
- Organization-level scoping exists in the app model; many resources are tied to `organization_id`.

## Runtime Subsystems

### Chat And Conversations

- Chat is implemented with WebSocket streaming and message persistence.
- Conversation features include create/list/update/archive/delete, shares, exports, and ratings.
- Message ratings support like/dislike plus optional feedback.
- Conversation shares are tokenized and exposed through dedicated routes.

### File Uploads

- Chat uploads go through validation, classification, parsing, storage, and DB tracking.
- Supported types include images, PDF, DOCX, TXT, and MD.
- Files are stored under `media/{user_id}/`.
- Parsed text is attached when it is useful for the agent.

### RAG

- RAG uses PostgreSQL pgvector, not a separate vector DB service.
- Ingestion can happen via CLI, API upload, or sync source.
- Search is available to authenticated users; management is admin-only.
- Sync sources are pluggable connector classes registered in `CONNECTOR_REGISTRY`.
- The current tree has the connector base and registry, but no built-in connector modules are present in the package yet.

### Billing

- Stripe powers subscriptions, checkout, portal, invoices, events, and credits.
- Billing return URLs are built from frontend settings in `app/core/config.py`.
- Admin dashboards surface usage, plans, events, and subscription state.

### Background Work

- Celery is used for background tasks and scheduling.
- Worker, beat, and flower are all wired through the CLI and Make targets.
- In-process background handling exists for fallback paths.

## Development Commands

### Backend

```bash
cd backend
uv run uvicorn app.main:app --reload
uv run pytest
uv run pytest tests/api/test_health.py -v
uv run ruff check . --fix
uv run ruff format .
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "Description"
uv run multi_agent server run --reload
uv run multi_agent db upgrade
uv run multi_agent cmd rag-sources
uv run multi_agent cmd rag-ingest /path/to/file.pdf --collection docs
uv run multi_agent cmd rag-search "query" --collection docs
```

### Frontend

```bash
cd frontend
bun install
bun dev
bun run build
bun run lint
bun run type-check
bun test
bun test:e2e
```

### Make Targets

Common targets in the root `Makefile` include:

- `make dev`, `make bootstrap`, `make seed`, `make dev-down`, `make dev-logs`, `make dev-rebuild`
- `make dev-frontend`
- `make stage`, `make stage-down`
- `make prod`, `make prod-down`, `make prod-logs`
- `make test`, `make test-cov`, `make lint`, `make format`
- `make db-init`, `make db-migrate`, `make db-upgrade`, `make db-downgrade`, `make db-current`, `make db-history`
- `make run`, `make run-prod`, `make routes`
- `make create-admin`, `make user-create`, `make user-list`
- `make celery-worker`, `make celery-beat`, `make celery-flower`
- `make docker-*` targets for lower-level container workflows

## Project CLI

The backend package exposes `multi_agent` from `backend/cli/commands.py`.

Top-level command groups:

- `server`
- `db`
- `user`
- `celery`
- `cmd`

The `cmd` group auto-discovers commands from `backend/app/commands/`.

RAG-oriented commands currently documented in the codebase include:

- `rag-collections`
- `rag-stats`
- `rag-drop`
- `rag-sources`
- `rag-source-add`
- `rag-source-remove`
- `rag-source-sync`
- `rag-ingest`
- `rag-search`

## Configuration

### Backend Settings

`backend/app/core/config.py` is the authoritative settings source. It reads `.env` from the current or parent directory.

Important groups:

- Project and runtime: `PROJECT_NAME`, `API_V1_STR`, `DEBUG`, `ENVIRONMENT`, `TIMEZONE`
- Security: `SECRET_KEY`, `API_KEY`, `API_KEY_HEADER`, token TTLs
- Database: `POSTGRES_*`, computed `DATABASE_URL` and `DATABASE_URL_SYNC`
- Redis and Celery: `REDIS_*`, `CELERY_*`
- AI and agenting: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `AI_MODEL`, `AI_TEMPERATURE`
- RAG: `EMBEDDING_MODEL`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_CHUNKING_STRATEGY`, `RAG_DEFAULT_COLLECTION`, `RAG_TOP_K`, `RAG_HYBRID_SEARCH`, `RAG_ENABLE_OCR`
- Billing: `STRIPE_*`, `BILLING_*`, `CREDITS_*`
- Email: `EMAIL_*`
- CORS: `CORS_ORIGINS`, `CORS_ALLOW_*`

Note: some older docs mention alternate Google OAuth variable names, but the code currently uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Frontend Settings

Frontend environment variables live in `frontend/.env.local`:

- `BACKEND_URL`
- `BACKEND_WS_URL`
- `NEXT_PUBLIC_AUTH_ENABLED`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_RAG_ENABLED`

## Testing

- Backend tests live under `backend/tests/`.
- Test fixtures in `backend/tests/conftest.py` mock the DB session by default, so most tests do not need a live Postgres instance.
- Coverage is configured to fail under 100 percent for backend code.
- Frontend unit tests use Vitest.
- Frontend E2E tests use Playwright.

When changing behavior, update tests close to the affected layer:

- route changes -> API tests
- business rules -> service tests
- query behavior -> repository tests
- UI/state changes -> frontend unit or E2E tests

## Deployment And Operations

- Local backend docs are available only in `local`, `staging`, and `development` environments.
- `backend/app/main.py` starts Redis, warms the embedding service, and initializes the pgvector store during lifespan startup when possible.
- Admin UI is enabled in non-production environments.
- Docker Compose files exist for dev, frontend, and production workflows.
- Nginx in `nginx/` proxies frontend, API, and WebSocket traffic.

## Documentation Index

### Root Docs

- `README.md` - project overview, stack, quickstart, Docker, deployment
- `CLAUDE.md` - agent-oriented architecture and conventions
- `CONTRIBUTING.md` - setup, style, testing, PR checklist
- `ENV_VARS.md` - exhaustive environment variable reference
- `MANUAL_STEPS.md` - one-time external setup checklist
- `SECURITY.md` - auth model, hardening, and known limitations

### Backend And Platform Docs

- `docs/architecture.md` - layered architecture, auth, file flow, RAG flow
- `docs/adding_features.md` - end-to-end feature, CLI, and migration patterns
- `docs/commands.md` - Makefile and `multi_agent` CLI reference
- `docs/configuration.md` - settings reference and production checklist
- `docs/deploy.md` - deployment recipes and post-deploy checks
- `docs/file-processing.md` - chat upload and RAG ingestion pipeline
- `docs/patterns.md` - dependency injection, services, repositories, connectors, frontend patterns
- `docs/permissions.md` - access matrix, RBAC, IDOR, API keys
- `docs/testing.md` - backend/frontend testing and fixtures

### How-To Guides

- `docs/howto/add-api-endpoint.md` - new REST endpoint walkthrough
- `docs/howto/add-agent-tool.md` - add a LangChain tool
- `docs/howto/add-background-task.md` - add a Celery task
- `docs/howto/add-rag-source.md` - add a new RAG document source
- `docs/howto/add-sync-connector.md` - add a sync connector and register it
- `docs/howto/configure-sync-sources.md` - manage sync sources, schedules, and modes
- `docs/howto/customize-agent-prompt.md` - tune system prompts
- `docs/howto/use-ratings.md` - message ratings and admin analytics

### Frontend Docs

- `frontend/README.md` - frontend setup, env vars, scripts, and deployment

## Internationalization (i18n)

### Language Support

Frontend uses **`next-intl`** v3.25.3 with `localePrefix: "as-needed"` (default language has no URL prefix).

| Language | Code | Default | Status |
|----------|:----:|:-------:|:------:|
| **中文 (简体)** | `zh` | **是** | ✅ 完整翻译 (~1018 条键值) |
| English | `en` | 否 | ✅ 完整翻译 |
| Polski | `pl` | 否 | ✅ 完整翻译 |

### Key Files

- `frontend/src/i18n.ts` — locale list, default locale, labels, flags
- `frontend/src/middleware.ts` — `next-intl` middleware config
- `frontend/messages/zh.json` — 完整中文翻译文件
- `frontend/messages/en.json` — 英文翻译文件
- `frontend/messages/pl.json` — 波兰语翻译文件
- `frontend/src/lib/seo.ts` — SEO 元数据含 OG locale 映射 (`zh_CN`, `en_US`, `pl_PL`)
- `frontend/src/components/language-switcher.tsx` — 语言切换组件（三种变体）

### Adding a New Language

1. 在 `frontend/src/i18n.ts` 的 `locales` 数组中添加新语言代码
2. 在 `getLocaleLabel` 和 `getLocaleFlag` 中添加标签和国旗
3. 在 `frontend/src/lib/seo.ts` 的 `OG_LOCALE` 中添加映射
4. 创建 `frontend/messages/{code}.json`（参考 `en.json` 的结构）
5. 语言切换器组件会自动适配

## Frontend Pages

前端共 **55 个页面文件** (`page.tsx`)，用户实际可用的有效页面 **52 个**，所有页面支持 3 种语言。

### 分类统计

| 分类 | 数量 | 访问权限 |
|------|:----:|----------|
| 公开营销页面 | 16 | 无需登录 |
| 认证页面 | 7 | 未登录用户 |
| 用户工作台 | 23 | 需登录 |
| 管理后台 | 6 | 管理员 |
| **合计** | **52** | — |

### 公开页面（16 个）

`/`(首页), `/pricing`, `/about`, `/blog`, `/blog/[slug]`, `/changelog`, `/help`, `/contact`, `/community`, `/security`, `/demo`, `/demo/[id]`, `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/shared/[token]`

### 认证页面（7 个）

`/login`, `/register`, `/forgot-password`, `/reset-password`, `/magic-link-sent`, `/auth/magic-link`, `/auth/callback`

### 用户工作台（23 个）

`/dashboard`, `/chat`, `/kb`, `/kb/[id]`, `/rag`, `/orgs`, `/orgs/[id]/members`, `/orgs/[id]/integrations`, `/billing`, `/billing/usage`, `/billing/credits`, `/billing/invoices`, `/billing/payment-methods`, `/billing/subscription`, `/settings/profile`, `/settings/account`, `/settings/appearance`, `/settings/notifications`, `/settings/slash-commands`, `/settings/providers`, `/invitations/[token]`, `/onboarding`, `/onboarding/[step]`

### 管理后台（6 个）

`/admin`, `/admin/users`, `/admin/conversations`, `/admin/ratings`, `/admin/stripe-events`, `/admin/system`

### 特殊/内部页面

`/profile` → 重定向到 `/settings/profile`；`/settings` → 重定向到 `/settings/profile`；`/dev/components` → 开发沙盒

### Settings 子页面

| 页面 | 功能说明 |
|------|----------|
| `/settings/profile` | 个人资料（姓名、头像） |
| `/settings/account` | 账户安全（密码、会话管理） |
| `/settings/slash-commands` | 斜杠命令管理（内置/自定义） |
| `/settings/notifications` | 通知偏好（邮件/应用内） |
| `/settings/appearance` | 外观主题（亮色/暗色） |
| `/settings/providers` | **AI 提供商配置**（详见下方） |

### AI Provider Configuration (`/settings/providers`)

**预置提供商**（带官方 API URL）：
- **Google Gemini** — `https://generativelanguage.googleapis.com/v1beta`
- **GitHub Models** — `https://models.inference.ai.azure.com`
- **NVIDIA NIM** — `https://integrate.api.nvidia.com/v1`
- **ModelScope** — `https://api.modelscope.cn/v1`
- **Cohere** — `https://api.cohere.ai/v1`
- **Agnes AI** — `https://api.agnesai.com/v1`

**自定义提供商**：用户可自行添加名称和 URL

**存储方式**：通过后端 API 持久化到 PostgreSQL（`user_providers` 表），前端通过 Next.js API 路由代理：
- 前端 API 客户端：`frontend/src/lib/providers-api.ts`
- Next.js 代理路由：`/api/me/providers` → 后端 `/api/v1/me/providers`
- 后端 API 路由：`backend/app/api/routes/v1/me_providers.py`
- 后端 Service：`backend/app/services/user_provider.py`
- 后端 Repository：`backend/app/repositories/user_provider.py`
- 后端 Model：`backend/app/db/models/user_provider.py`

**UI 风格**：与 `/settings/notifications` 一致的 `SectionCard` 卡片布局，API Key 支持显示/隐藏切换。

### 测试报告 — Provider 功能

**运行命令**：`uv run pytest tests/test_services_user_provider.py tests/api/test_providers.py -v`

```
tests/test_services_user_provider.py ........ [ 50%]
tests/api/test_providers.py .............   [100%]
======================= 16 passed in 0.37s =======================
```

| 测试文件 | 测试用例 | 覆盖内容 |
|----------|:--------:|----------|
| `test_services_user_provider.py` | 8 | 当空时自动播种预设、返回已有数据、创建自定义成功、创建重复名称失败、更新成功、更新不存在报 404、删除自定义成功、删除预设报错 |
| `tests/api/test_providers.py` | 8 | GET 列表、POST 创建、创建重复 409、PATCH 更新、更新不存 404、DELETE 自定义、DELETE 预设 400、未认证 401 |

### 认证机制

- `(dashboard)/layout.tsx` 使用 `<AuthGuard>` 包裹所有子页面
- 公开页面直接位于 `[locale]/` 下，无 AuthGuard
- 管理后台权限在 API 层校验
- 页面总路由数：52 页面 × 3 语言 = 156 条 + 84 条 API 路由 (`route.ts`)

## Current Caveats

- **Port Conflict & Migration**: The default backend port has been migrated to `8001` (from `8000`) to avoid conflicts with system processes like `Manager.exe`.
- **Database Model Registration**: All core database models (including billing/stripe/items/user_providers) **must be imported** in [backend/app/db/models/__init__.py](file:///d:/MZmulti_agent/backend/app/db/models/__init__.py) to ensure they register on the SQLAlchemy metadata, preventing Alembic autogenerate from trying to drop them.
- **Alembic Migrations**: The `user_providers` table database migration has been fully generated and applied (Revision `bf9bb610e20b`, in [backend/alembic/versions/2026-07-09_add_user_providers.py](file:///d:/MZmulti_agent/backend/alembic/versions/2026-07-09_add_user_providers.py)).
- **Startup Script (start.bat)**: The root [start.bat](file:///d:/MZmulti_agent/start.bat) is configured to automatically pull up Docker backend dependencies, run local database migrations, seed the default admin account, boot the Next.js frontend locally via `bun dev` (in a separate window), and automatically launch the default browser to [http://localhost:3000](http://localhost:3000).
- `backend/app/services/rag/connectors/__init__.py` only defines the base class and registry; connector modules still need to be added and registered for concrete source types.
- Some docs mention older naming or legacy examples. Prefer the code and settings module when they conflict.
- The frontend is locale-prefixed (`localePrefix: "as-needed"`) and ships with Chinese (default), English, and Polish catalogs.
- The AI Provider Configuration page (`/settings/providers`) uses the backend API (`/api/v1/me/providers`) for data persistence. API keys are stored in the database (plain text; production should encrypt at rest). Frontend proxies through Next.js API routes (`/api/me/providers`, `/api/me/providers/[id]`).
- The repo contains rich admin, billing, chat, and knowledge-base surfaces, so changes often need cross-cutting updates in backend, frontend, and docs.

## Editing Guidance

- Keep changes tightly scoped.
- Follow the existing layered architecture.
- Prefer existing patterns over new abstractions.
- Update the matching docs when behavior or configuration changes.
- Avoid touching unrelated files.

