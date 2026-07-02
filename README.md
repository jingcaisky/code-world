# Code World v2.0 — AI 智能编程助手

<p align="center">
  <strong>5 层混合检索架构 · 30 个 Agent 工具 · RAG 检索增强 · Zvec 向量数据库</strong>
</p>

<p align="center">
  <a href="#功能特性">功能</a> •
  <a href="#技术架构">架构</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#环境配置">配置</a> •
  <a href="#项目结构">项目结构</a>
</p>

---

## 简介

**Code World** 是一款基于 [Agent-Native](https://github.com/nichochar/framework) 框架构建的 **AI 智能编程助手**，采用 **对话优先 (Chat-First)** 设计理念。它实现了业界领先的 **Pre-L0 混合检索 + RAG 增强生成** 架构，将关键词搜索与语义理解深度融合，让 AI 编程助手具备真正的代码理解和知识检索能力。

### 核心亮点

| 能力 | 说明 |
|------|------|
| 🧠 **混合检索** | TF-IDF 关键词 + Zvec 语义向量双通道，RRF 融合排序 |
| 🔍 **RAG 增强** | Pre-L0 检索结果注入上下文，从第一轮对话即增强模型认知 |
| ⚡ **Gemini Flash 分流** | 快速分类简单/复杂任务，节省主模型 Token 消耗 |
| 🛠️ **30 个工具** | 覆盖编辑、搜索、执行、质量、Git、洞察全链路 |
| 💾 **三层知识同步** | AGENTS.md → SQL → Zvec 自动同步，启动即用 |
| 📋 **用户确认机制** | 主模型生成计划 → 用户确认 → 执行，杜绝盲改代码 |

## 功能特性

### 30 个 Agent 工具

| 分类 | 工具 |
|------|------|
| ✏️ **编辑** | `file-create`, `file-update`, `file-delete`, `file-batch-update`, `file-restore`, `mcp-file-read` |
| 🔍 **搜索** | `zvec-search`(混合), `web-search`, `grep-search`, `image-analyze` |
| ⚡ **执行** | `run-command`, `run-test`, `terminal`, `process-manage` |
| ✅ **质量** | `type-check`, `lint-fix`, `format-code`, `code-review` |
| 🌿 **Git** | `git-ops`, `diff-preview` |
| 📊 **洞察** | `code-insights` |
| 📦 **项目** | `index-content`(双写), `env-ops`, `dependency-manage`, `sync-knowledge` |
| 🧭 **导航** | `view-screen`, `navigate`, `launch-app`, `hello` |

### 6 大 AI 能力

1. **Hybrid Retrieval (混合检索)** — 关键词 TF-IDF + 语义 Embedding 双通道并行，RRF 融合排序
2. **RAG 增强 (检索增强生成)** — Pre-L0 检索结果注入 L0/L1/L2 各层 Prompt
3. **Intelligent Triage (智能分流)** — Gemini Flash 快速分类，复杂任务走编排管道
4. **Plan-Confirm-Execute (计划确认执行)** — 用户始终掌控代码变更
5. **Sub-Agent Review (子代理审查)** — 类型安全 / 安全漏洞 / 代码风格三级评分
6. **Knowledge Sync (知识同步)** — 三层存储自动同步，零手动维护

## 技术架构

```
User Input
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Pre-L0: Hybrid Retrieval (混合检索)                        │
│  ├─ Keyword Channel:  TF-IDF → vector-store → cosine sim   │
│  └─ Semantic Channel: Zvec → embedding API → ranked list   │
│                    ↓ RRF Fusion (Reciprocal Rank Fusion)     │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  L0: Context Assembly (上下文组装)                           │
│  RAG Context + Thread History + Memory + Learnings + Rules  │
│  → Token Budget (8K max, priority truncation)               │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  L1: Search + Triage (搜索 + 分流)                          │
│  ├─ Parallel: Hybrid / MCP / Web Search                    │
│  └─ Gemini Flash: simple? → direct answer                  │
│                     complex? → L2 orchestration             │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  L2: Plan Generation (计划生成)                             │
│  Main Model → structured plan → user confirmation          │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  L3: Sub-Agent Execution + Review (子代理执行 + 审查)       │
│  └─ frontend-designer / backend-creator / test-writer /     │
│    code-reviewer → dependency-scheduled parallel execution  │
│    → critical/warning/suggest grading                       │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  L4: Integration + Memory (集成 + 记忆)                     │
│  Change report + OM compaction + learnings + CodeGraph      │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

```
Server Startup
  │
  └─ knowledge-sync.ts (Nitro hook: "ready")
       ├─ AGENTS.md        → SQL resources 表
       ├─ Project files    → vector_index 表 (TF-IDF)
       └─ All above        → Zvec 向量库 (语义) [可选]
```

```
Content Indexing (Dual-Write)
  │
  ├─ Local:  chunk → TF-IDF embed → SQLite vector_index
  └─ Remote: chunk → Zvec upsert  → Zvec Vector DB [可选]
```

## 快速开始

### 前置要求

- **Node.js** >= 22.22.0
- **pnpm** >= 9.0.0

### 一键启动 (Windows)

```bash
start-chat.bat
```

该脚本自动完成：
1. 安装依赖 (`pnpm install`)
2. 启动开发服务器 (`agent-native dev`)
3. 等待端口就绪后打开浏览器

### 手动启动

```bash
# 进入项目目录
cd templates/chat

# 安装依赖
pnpm install

# 初始化 .env（如不存在）
cp .env.example .env

# 启动开发服务器
pnpm dev
```

访问 http://localhost:8080 即可使用。

## 环境配置

### 必选（核心功能可用）

`.env` 文件基础配置：

```bash
# 关闭认证（开发模式）
AUTH_DISABLED=true
```

以下功能 **无需任何额外配置即可使用**：

- ✅ 混合关键词搜索 (TF-IDF)
- ✅ 文件 CRUD 操作
- ✅ 代码执行 (命令/测试/终端)
- ✅ 类型检查 + 代码格式化
- ✅ Git 操作 + Diff 预览
- ✅ 上下文压缩 + 观察记忆
- ✅ Learnings 用户偏好持久化
- ✅ AGENTS.md ↔ SQL 自动同步
- ✅ Token 预算管理

### 可选（增强功能）

```bash
# ════════════════════════════════════════
# Zvec 向量数据库 (语义搜索)
# ════════════════════════════════════════
AGENT_NATIVE_ZVEC_ENDPOINT="http://localhost:9090/api"
AGENT_NATIVE_ZVEC_API_KEY=""                    # 可选
AGENT_NATIVE_ZVEC_MODEL="bge-large-zh-v1.5"     # Embedding 模型

# ════════════════════════════════════════
# Web 搜索
# ════════════════════════════════════════
AGENT_NATIVE_WEB_SEARCH_PROVIDER="tavily"        # tavily | serpapi | bing
AGENT_NATIVE_TAVILY_API_KEY=""                   # Tavily API Key

# ════════════════════════════════════════
# Gemini Flash 分流 (L1 Triage)
# ════════════════════════════════════════
AGENT_NATIVE_GEMINI_API_KEY=""                   # Google Gemini API Key

# ════════════════════════════════════════
# 混合检索调优
# ════════════════════════════════════════
AGENT_NATIVE_HYBRID_SEARCH_TIMEOUT="1500"        # 搜索超时 (ms)
AGENT_NATIVE_RAG_CONTEXT_BUDGET="2000"           # RAG 注入最大 Token 数

# ════════════════════════════════════════
# 调试
# ════════════════════════════════════════
AGENT_NATIVE_DEBUG_CONTEXT="0"                   # 设为 "1" 日志 Token 预算
AGENT_NATIVE_REINDEX="false"                     # 设为 "true" 强制重建索引
```

### 功能依赖矩阵

| 功能 | 依赖 | 无依赖时的行为 |
|------|------|---------------|
| Zvec 语义搜索 | `ZVEC_ENDPOINT` | 降级为纯 TF-IDF 关键词搜索 |
| Web 搜索 | `TAVILY_API_KEY` | 不可用 |
| Gemini 分流 | `GEMINI_API_KEY` | 使用关键词规则分流 |
| 完整代码审查 | `oxlint` 二进制 | 仅 TypeScript 类型检查 |

## 项目结构

```
templates/chat/
├── app/                          # React Router SSR 前端
│   ├── components/              # UI 组件 (shadcn/ui)
│   ├── lib/                      # 客户端工具函数
│   └── routes/                   # 页面路由
│
├── actions/                      # Agent 工具定义 (30 个)
│   ├── zvec-search.ts           # ⭐ 混合搜索 (关键词+语义+RRF)
│   ├── web-search.ts            # Web 搜索 (Tavily/SerpAPI)
│   ├── mcp-file-read.ts         # 精确文件读取
│   ├── index-content.ts         # 内容索引 (双写)
│   ├── file-create.ts           # 文件创建
│   ├── file-update.ts           # 文件更新
│   ├── file-delete.ts           # 文件删除
│   ├── run-command.ts           # 命令执行
│   ├── run-test.ts              # 测试运行
│   ├── code-review.ts           # 代码审查管道
│   └── ... (20+ more actions)
│
├── server/                       # 后端服务 (Nitro)
│   ├── lib/
│   │   ├── token-budget.ts      # P0: Token 预算管理
│   │   ├── context-assembler.ts # P0: 上下文组装 (RAG 感知)
│   │   ├── embedder.ts          # P1: TF-IDF + 语义 Embedding
│   │   ├── vector-store.ts      # P1: SQLite 向量存储
│   │   ├── zvec-client.ts       # P1: Zvec 向量数据库客户端
│   │   ├── hybrid-retriever.ts  # P1: ⭐ 混合检索器 (Pre-L0)
│   │   ├── content-indexer.ts   # P1: 双写索引管道
│   │   ├── search-orchestrator.ts # P1: 搜索编排 (L1)
│   │   ├── triage-service.ts    # P1: RAG 增强 Gemini 分流
│   │   ├── plan-engine.ts       # P2: 计划生成引擎 (L2)
│   │   ├── sub-agent-runner.ts  # P3: 子代理执行器 (L3)
│   │   ├── review-checker.ts    # P3: 审查评分器 (L3)
│   │   ├── change-reporter.ts   # P4: 变更报告 (L4)
│   │   ├── memory-writer.ts     # P4: 记忆写入 (L4)
│   │   ├── knowledge-sync.ts    # SYS: SQL 知识同步
│   │   └── knowledge-sync-zvec.ts # SYS: Zvec 语义同步
│   ├── plugins/
│   │   ├── plan-routes.ts       # 计划 API 路由
│   │   └── knowledge-sync.ts    # 启动时自动同步钩子
│   └── routes/                  # API 路由
│
├── config/                       # 配置文件
│   └── const.ts                 # 常量 + 特性开关
│
├── docs/                         # 文档
│   ├── architecture-spec.md     # 完整架构规范 (v2.0, 370 行)
│   └── integration-plan.md      # 集成计划
│
├── public/                       # 静态资源
├── data/                         # 运行时数据
│
├── AGENTS.md                     # Agent 行为指南 (v2.0)
├── CHANGELOG.md                  # 变更日志
├── package.json                  # 项目配置
├── vite.config.ts               # Vite + SSR 配置
└── react-router.config.ts       # React Router 配置
```

## 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | Agent-Native Core + React Router v8 (SSR) |
| **语言** | TypeScript 6.0 (Strict Mode) |
| **构建** | Vite + Nitro (Server Engine) |
| **UI** | shadcn/ui + Radix UI + Tailwind CSS v4 |
| **数据** | SQLite (本地) / Postgres (部署) via libSQL |
| **向量** | SQLite TF-IDF (内置) + Zvec (可选远程) |
| **终端** | xterm.js + node-pty |
| **测试** | Vitest + Testing Library |
| **AI** | Gemini Flash (Triage) + 可插拔主模型 |

## 开发状态

| 阶段 | 模块 | 状态 |
|------|------|------|
| **P0** | Token 预算、上下文组装、搜索 Actions、配置 | ✅ 完成 |
| **P1** | 搜索编排、分流服务、Embedding、向量存储、内容索引 | ✅ 完成 |
| **P2** | 计划引擎、进度推送 (SSE) | ✅ 完成 |
| **P3** | 子代理执行、审查评分、代码审查 Action | ✅ 完成 |
| **P4** | 变更报告、记忆写入 | ✅ 完成 |

| 组件 | 状态 |
|------|------|
| 向量数据库 (SQLite TF-IDF) | ✅ 内置，零依赖 |
| Zvec 远程向量库 | ✅ 可选接入 |
| 混合检索 (Hybrid RRF) | ✅ 核心能力 |
| RAG 检索增强 | ✅ 全链路注入 |
| Agent Chat 集成 | ✅ 30 工具已注册 |
| Web 搜索 | 🟡 需要 API Key |
| Gemini 分流 | 🟡 需要 API Key (有降级) |

## 关于 MCP

本项目使用 **Agent Tool (Action)** 协议（Function Calling），**不是** MCP 协议：

| 概念 | 协议 | 调用方 | 端点 |
|------|------|--------|------|
| Agent Tool (Action) | Function Calling | Chat Agent | `/_agent-native/actions/:name` |
| MCP Tool | MCP Protocol | 外部 IDE | `/_agent-native/mcp` |

框架内置了 MCP 支持（用于 Claude Desktop / Cursor 等 IDE），但我们的 30 个 Actions 通过 Function Calling 在 Chat 内部调用，无需额外注册。

## 许可证

本项目基于 [Agent-Native](https://github.com/nichochar/framework) 框架模板构建。

---

<p align="center">
  <strong>Code World v2.0</strong> — 让 AI 真正理解你的代码
</p>
