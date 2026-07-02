# 集成实施计划 (Integration Plan)

> 目标：将 Code World 架构的零层→四层全部接入 agent-chat 请求流，实现端到端可用。

---

## 当前状态 vs 目标状态

| 组件 | 当前 | 目标 |
|------|------|------|
| Zvec 向量检索 | Action 骨架 | 可运行的本地向量库 + embedding |
| Web 搜索 | Action 骨架 | 配置 API Key 后可运行 |
| MCP 文件读取 | 可运行 | ✅ 已是完整实现 |
| 搜索编排器 | 骨架 | 接入 agent-chat 请求流 |
| Gemini Flash 分流 | 骨架 | 接入 + API Key 配置 |
| Plan 引擎 | 完整 | 接入 agent-chat SSE 流 |
| 子代理执行 | 完整 | 接入真实的 delegate_task |
| 审查管道 | 骨架 | 接入 oxlint 真实调用 |
| 变更报告 | 完整 | 接入第四层输出流 |
| 记忆固化 | 骨架 | 接入 OM + Learnings 写入 |

---

## Phase 1: 向量基础设施（零外部依赖）

### 1.1 本地 Embedding 实现

使用纯 JS 方案，不需要 GPU 或外部 API：
- **方案 A**：`@xenova/transformers` — 浏览器/Node 通用，模型自动下载
- **方案 B**：自写 TF-IDF + 余弦相似度 — 最轻量，零模型下载
- **选中**：**方案 B**（先跑通，后续可平滑升级到方案 A）

### 1.2 SQLite 向量存储

在现有 SQLite 中新增表：
```sql
CREATE TABLE IF NOT EXISTS vector_index (
  id TEXT PRIMARY KEY,
  source_file TEXT NOT NULL,
  source_type TEXT NOT NULL,        -- 'code' | 'docs' | 'faq'
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  tokens TEXT NOT NULL,             -- JSON array: TF-IDF token weights
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 1.3 交付文件

| 文件 | 功能 |
|------|------|
| `server/lib/vector-store.ts` | SQLite 向量存储 CRUD |
| `server/lib/embedder.ts` | TF-IDF 文本向量化（→ 后续可换 xenova） |
| `server/lib/content-indexer.ts` | 文件→分块→embedding→入库 管道 |
| `actions/index-content.ts` | 内容索引 Action |

---

## Phase 2: 接入 Agent Chat 请求流

修改 `server/plugins/agent-chat.ts` 的 systemPrompt，注入架构层的上下文装配和检索结果。

### 2.1 请求流改造

```
用户 POST /_agent-native/agent-chat
  │
  ├─ L0: assembleContext(threadId, userMessage)  // 阻塞
  │   → 返回 ContextBlock
  │
  ├─ L1: orchestrateSearch(userMessage)           // 并行，max 500ms wait
  │   → triageRequest(userMessage, searchResult)  // 使用 search shared_context
  │   → 返回 TriageResult
  │
  ├─ [simple] → 直接调用主模型回复（结束）
  │
  └─ [complex] → 进入 Plan 流程
      │
      ├─ generatePlan(triage, context) → SSE 推送 plan_generated
      ├─ 等待用户 POST /_agent-native/plan/confirm
      │
      ├─ [confirm] → runSubAgents(plan, executor, context)
      │   → runFullReview(files) → 返回 ReviewResult
      │
      ├─ generateChangeReport(plan, outputs, review)
      │   → SSE 推送 change_report
      │
      └─ consolidateMemoryBackground(report, outputs, options)
          → fire-and-forget OM + Learnings + CodeGraph
```

### 2.2 SSE 进度事件

```
data: {"layer":0,"status":"context_assembled","budget":7850}
data: {"layer":1,"status":"searching","zvec":"complete","mcp":"complete","web":"pending"}
data: {"layer":1,"status":"triaged","type":"complex","confidence":0.82}
data: {"layer":2,"status":"plan_generated","planId":"plan-xxx","subTasks":4}
data: {"layer":2","status":"awaiting_confirmation"}
... 用户确认 ...
data: {"layer":3,"status":"executing","subTask":"st-1","agent":"frontend-designer"}
data: {"layer":3","status":"reviewing"}
data: {"layer":4","status":"finalizing","report":{...}}
data: {"type":"done"}
```

---

## Phase 3: 审查管道实现

将 `review-checker.ts` 的骨架替换为真实调用：
- TypeScript: `npx tsc --noEmit` 或 tsc API
- Lint: `npx oxlint` (项目已有 .oxlintrc.json)
- Security: 正则检测（已实现）

---

## Phase 4: 端到端测试

创建端到端测试脚本验证完整流程。

---

## 实施顺序

| 步骤 | 内容 | 文件 | 预计耗时 |
|------|------|------|---------|
| 1.1 | Vector Store (SQLite) | `server/lib/vector-store.ts` | 新建 |
| 1.2 | TF-IDF Embedder | `server/lib/embedder.ts` | 新建 |
| 1.3 | Content Indexer | `server/lib/content-indexer.ts` | 新建 |
| 1.4 | Index Content Action | `actions/index-content.ts` | 新建 |
| 2.1 | Zvec-search 接入真实向量库 | 修改 `actions/zvec-search.ts` | 修改 |
| 2.2 | Agent Chat 请求流接入 | 修改 `server/plugins/agent-chat.ts` | 修改 |
| 2.3 | SSE 进度流 | `server/lib/progress-emitter.ts` | 新建 |
| 3.1 | Oxlint 真实调用 | 修改 `server/lib/review-checker.ts` | 修改 |
| 4.1 | 架构集成测试 | `server/lib/__tests__/integration.test.ts` | 新建 |
