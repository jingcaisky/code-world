# 代码世界 (Code World) — 智能体对话架构技术 Spec

> 版本: 2.0 (Hybrid Retrieval) | 日期: 2026-07-03 | 状态: 全部实现 ✅

---

## 完整对话流程

```
                              ┌──────────────────┐
                              │   用户输入消息      │
                              └────────┬─────────┘
                                       ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║ Pre-Layer 0: 混合检索 (Hybrid Retrieval)               Pre-L0 · 不影响L0延迟 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  hybridSearch(query)                                                         ║
║  ┌─ Keyword Channel ────────────┐  ┌─ Semantic Channel ────────────┐        ║
║  │ TF-IDF · cosine similarity   │  │ Zvec API · embedding search   │        ║
║  │ vector_index (SQLite)        │  │ remote vector DB              │        ║
║  │                              │  │                               │        ║
║  │ 优势: 精确符号名匹配         │  │ 优势: 语义理解/跨语言        │        ║
║  │ 权重: code=0.7 NL=0.4       │  │ 权重: code=0.3 NL=0.6        │        ║
║  │                              │  │ (未配置时自动跳过)            │        ║
║  └──────────────┬───────────────┘  └───────────────┬───────────────┘        ║
║                 │                                  │                         ║
║                 └──────────────┬───────────────────┘                         ║
║                                ▼                                             ║
║                   RRF 融合排序 (Reciprocal Rank Fusion)                      ║
║                   → 去重 + 重排序 + 标记来源 (keyword/semantic/both)           ║
║                   → 生成 RAG context (≤2000 tokens)                           ║
║                                                                              ║
║  hybrid-retriever.ts + zvec-client.ts + vector-store.ts + embedder.ts        ║
╚══════════════════════════════════════════╤═══════════════════════════════════╝
                                           ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║ 第零层：上下文装配 (Context Assembly)                  L0 · 阻塞执行         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  assembleContext({                                                           ║
║    searchContext,    ← Pre-L0 混合检索的 RAG context ⭐                      ║
║    threadMessages,   ← chat_threads (SQL) 最近消息                            ║
║    observationalMemory, ← observational_memory (SQL) Observer+Reflector摘要   ║
║    learnings,        ← resources (SQL) 用户偏好/项目知识                       ║
║    skills,           ← .agents/skills/ (本地) 可用技能清单                    ║
║    systemPrompt,     ← agent-chat.ts (代码) 框架规则+行为指南                  ║
║    AGENTS.md,        ← resources (SQL, 启动时自动同步) 项目文档               ║
║  })                                                                           ║
║                                                                              ║
║  Token Budget (8K):                                                         ║
║  System 2K + RAG Context 2K + Messages 3K + Memory 1K + Learnings .5K      ║
║                 + Skills .5K = 9K (动态截断到 8K)                            ║
║  截断优先级: Skills → Learnings → Memory → Messages（旧→新）                  ║
║                                                                              ║
║  → context_block (结构化上下文，留存全流程共用)                                ║
║                                                                              ║
║  token-budget.ts + context-assembler.ts                                      ║
╚══════════════════════════════════════════════╤═══════════════════════════════╝
                                               ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║ 第一层：并行检索 + RAG增强分流 (Search + Triage)        L1 · 前端UI可见     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ┌─────────────────────────┐     ┌──────────────────────────────┐           ║
║  │   并行检索 (带超时)       │     │  副模型 RAG增强分流决策 ⭐   │           ║
║  │                         │     │                              │           ║
║  │ 🔍 hybrid  (800ms)  ⭐  │     │  Gemini Flash:               │           ║
║  │    关键词 + 语义 融合     │     │  输入: 用户消息              │           ║
║  │                         │     │       + L0 context_block     │           ║
║  │ 📄 MCP文件 (500ms)      │────→│       + 搜索集成结果         │           ║
║  │    精确文件内容          │     │       + RAG enriched context  │           ║
║  │                         │     │                              │           ║
║  │ 🌐 Web搜索 (2s)         │     │  输出: { type, confidence,   │           ║
║  │    最新文档/API         │     │          plan_suggestion }    │           ║
║  └─────────────────────────┘     │                              │           ║
║                                  │  决策矩阵:                    │           ║
║                                  │  >0.8 → 直接执行             │           ║
║                                  │  >0.5 → complex_task         │           ║
║                                  │  ≤0.5 → 默认complex          │           ║
║                                  └──────────────┬───────────────┘           ║
║                                                 ▼                            ║
║                                  confidence≤0.5 OR type=complex → L2        ║
║                                  type=simple → 直接流式回复（结束）            ║
║                                                                              ║
║  search-orchestrator.ts + triage-service.ts (RAG-增强prompt)                  ║
╚══════════════════════════════════════════════╤═══════════════════════════════╝
                                               ▼ complex_task
╔══════════════════════════════════════════════════════════════════════════════╗
║ 第二层：主模型战略编排 (Plan Orchestration)          L2 · 前端UI可见        ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  输入:                                                                       ║
║  • context_block（零层上下文 + RAG context）                                  ║
║  • shared_context（一层完整检索结果）                                         ║
║  • plan_suggestion（副模型分析结果）                                          ║
║                                                                              ║
║  主模型职责:                                                                  ║
║  1. 分析任务类型: fix / create / refactor / investigate                       ║
║  2. 判断影响范围: frontend / backend / fullstack / config                     ║
║  3. 生成执行 Plan: steps + deps + agents + files                              ║
║  4. 拆解为子任务: 分配给 frontend-designer / backend-creator / test-writer    ║
║                                                                              ║
║  Plan 输出:                                                                   ║
║  {                                                                           ║
║    taskType, scope, confidence,                                               ║
║    subTasks: [{ id, agent, description, deps, files, expected }],             ║
║    reviewChecklist, estimatedFiles                                            ║
║  }                                                                           ║
║                                                                              ║
║  ⚠️ 约束:                                                                     ║
║  • 主模型只决策，不直接写代码                                                  ║
║  • Plan 必须展示给用户确认后才能执行                                           ║
║  • 不可行时降级为 "建议+询问用户"                                              ║
║  • 确认超时 3s → 自动继续                                                     ║
║                                                                              ║
║  → SSE 推送 Plan 卡片 → 用户确认 → 进入 L3 执行                                ║
║                                                                              ║
║  plan-engine.ts + plan-routes.ts + progress-emitter.ts                        ║
╚══════════════════════════════════════════════╤═══════════════════════════════╝
                                               ▼ 用户确认
╔══════════════════════════════════════════════════════════════════════════════╗
║ 第三层：子代理并行执行 + 分级审查 (Execution+Review)   L3 · 前端UI可见      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  sub-agent-runner.ts → 依赖图调度，并行批次执行                                ║
║                                                                              ║
║  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                ║
║  │ 🎨 前端生成       │ │ ⚙️ 后端生成       │ │ 🧪 测试生成       │                ║
║  │ frontend-designer │ │ backend-creator  │ │ test-writer      │                ║
║  │ shadcn/ui+TW      │ │ defineAction+SQL │ │ vitest+testing   │                ║
║  │ file-create       │ │ file-create      │ │ file-create      │                ║
║  │ file-update       │ │ type-check       │ │ run-test         │                ║
║  │ format-code       │ │ lint-fix         │ │                  │                ║
║  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘                ║
║           │                  │                  │                            ║
║           └──────────────────┼──────────────────┘                            ║
║                              ▼                                               ║
║  ┌─────────────────────────────────────────────────────┐                     ║
║  │ 🔍 审查子代理 (code-reviewer，独立运行)               │                     ║
║  │ • type-check.ts     TypeScript 类型检查               │                     ║
║  │ • lint-fix.ts       ESLint/Oxlint 自动修复            │                     ║
║  │ • format-code.ts    Prettier 格式化                  │                     ║
║  │ • review-checker.ts 安全审查+CodeGraph依赖验证         │                     ║
║  │ • diff-preview      Git diff 差异确认                │                     ║
║  │                                                      │                     ║
║  │ 分级输出:                                             │                     ║
║  │  🔴 critical  → 阻塞，通知用户决策                     │                     ║
║  │  🟡 warning   → 尝试自动修复 + 标记到报告              │                     ║
║  │  🟢 suggestion → 仅记录到报告                         │                     ║
║  └─────────────────────────────────────────────────────┘                     ║
║                                                                              ║
║  retry-wrapper.ts → 网络超时/registry不可用 → 自动重试                        ║
║  SubAgentProgress.tsx → 前端实时进度卡片                                      ║
║                                                                              ║
║  sub-agent-runner.ts + review-checker.ts + 审查工具链                         ║
╚══════════════════════════════════════════════╤═══════════════════════════════╝
                                               ▼ 全部通过 (无critical)
╔══════════════════════════════════════════════════════════════════════════════╗
║ 第四层：汇总整合 + 记忆固化 (Integration+Memory)    L4 · 后台服务            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  1. 收集所有子代理输出                                                        ║
║  2. 冲突检测 + 合并代码（多子代理修改同一文件时）                                 ║
║  3. 生成变更总结 + Commit Message                                            ║
║  4. 展示给用户验收                                                            ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────┐             ║
║  │ 📋 变更报告 (change-reporter.ts)                           │             ║
║  │   ✅ 新增: Login.tsx, auth.ts (3 files)                   │             ║
║  │   ✏️ 修改: api.ts (+45 -12)                                │             ║
║  │   🔍 审查: 0 critical · 2 warning (auto-fixed)            │             ║
║  │   📝 Commit: "feat: add login page with auth action"       │             ║
║  │                                                            │             ║
║  │   [确认合并] [查看diff] [手动修改]                          │             ║
║  └─────────────────────────────────────────────────────────────┘             ║
║                                                                              ║
║  ════════════ 异步后台 (fire-and-forget) ════════════                         ║
║                                                                              ║
║  memory-writer.ts:                                                            ║
║  ├─ context-compressor.ts  → 对话 > 8K token → LLM 摘要替换旧消息             ║
║  ├─ Observational Memory   → Observer (30K→4K) → Reflector (40K→2K)           ║
║  ├─ save-memory            → 记录关键决策到 Learnings (SQL Resources)          ║
║  └─ CodeGraph 增量更新     → 更新函数调用链/依赖关系图                          ║
║                                                                              ║
║  ────── → Zvec 自动同步 (knowledge-sync-zvec.ts) ──────                       ║
║  ├─ AGENTS.md 段落   → Zvec 文档 (语义搜索)                                   ║
║  ├─ Learnings 条目   → Zvec 文档 (可跨线程检索偏好) ⭐                         ║
║  └─ Code chunks      → Zvec 文档 (增量更新)                                   ║
║                                                                              ║
║  change-reporter.ts + memory-writer.ts + knowledge-sync-zvec.ts               ║
╚══════════════════════════════════════════════╤═══════════════════════════════╝
                                               ▼
                              ┌──────────────────────────────┐
                              │         最终产出               │
                              │ 代码文件 + 测试 + 审查报告     │
                              │ + Commit Message + 记忆更新    │
                              └──────────────────────────────┘


════════════════════════════════════════════════════════════════════════════════
                       横切关注点 (Cross-Cutting)
════════════════════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────────┐
│ 🧠 CoT 思考链 (ReasoningTrace.tsx)            │
│ ─────────────────────────────────────────── │
│ 模型推理过程实时展示：                         │
│ "用户想要登录页面 → 涉及前端Form+后端Auth     │
│  → 已有 auth.ts 可复用 → 只需新建 Login.tsx"  │
│ 前端折叠卡片 + 自动收起 + 思考时长徽章         │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 🎴 工具调用卡片 (ToolCallCard.tsx)            │
│ ─────────────────────────────────────────── │
│ 每层工具调用状态实时展示：                      │
│ 🔍 语义搜索      0.12s ✅                     │
│ 📄 读取文件       0.08s ✅                    │
│ ✏️ 修改文件       0.05s ✅ (Login.tsx)        │
│ 🌐 网络搜索       1.82s ✅                    │
│ 结果内联展开 + 状态颜色 + 进度脉冲              │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 🤖 子代理进度 (SubAgentProgress.tsx)          │
│ ─────────────────────────────────────────── │
│ 子代理执行状态卡片：                            │
│ ✅ 前端生成  已完成 → Login.tsx               │
│ 🔄 后端生成  执行中 65% → auth action...      │
│ ⏳ 测试生成  等待中                            │
│ SSE实时推送状态 + 进度条                       │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ ⚡ 错误自动重试 (retry-wrapper.ts)            │
│ ─────────────────────────────────────────── │
│ 执行类工具底层包装：                            │
│ ECONNRESET 网络超时  → ✅ 重试 (1.5s)         │
│ ENOENT 文件不存在    → ❌ 不重试               │
│ npm install registry → ✅ 重试 (3s)           │
│ TS类型错误           → ❌ 不重试               │
│ 最大3次重试 + 递增延迟 + 用户提示                │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 🗜️ LLM上下文压缩 (context-compressor.ts)     │
│ ─────────────────────────────────────────── │
│ 对话 > 8K token → 自动摘要替换旧消息            │
│ 双层压缩: Framework OM + Custom Compressor    │
│ 压缩后 Observations → Reflections 层次结构     │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 💾 知识三向同步 (knowledge-sync)               │
│ ─────────────────────────────────────────── │
│ 服务器启动时自动执行:                           │
│ ┌─ 文件 ───────────────────────────────────┐  │
│ │ AGENTS.md → SQL Resources (Agent 可读写)  │  │
│ ├─ 代码 ───────────────────────────────────┤  │
│ │ *.ts/tsx   → vector_index (TF-IDF)       │  │
│ │ *.ts/tsx   → Zvec (semantic)             │  │
│ ├─ 知识 ───────────────────────────────────┤  │
│ │ AGENTS.md  → Zvec (文档语义检索)           │  │
│ │ Learnings  → Zvec (跨线程偏好检索) ⭐       │  │
│ └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘


════════════════════════════════════════════════════════════════════════════════
                             工具集 (30 Tools)
════════════════════════════════════════════════════════════════════════════════

                                                  🆕 = 本轮新增/升级

✏️ 编辑 (6)   file-create  file-update  file-delete  file-batch-update
              file-restore  mcp-file-read

🔍 搜索 (5)   zvec-search 🆕(hybrid)  web-search  grep-search
              image-analyze  grep-search

⚡ 执行 (4)   run-command  run-test  terminal  process-manage

✅ 质量 (4)   type-check  lint-fix  format-code  code-review

🌿 Git (2)   git-ops  diff-preview

📊 洞察 (1)   code-insights

📦 项目 (4)   index-content 🆕(dual-write)  env-ops  dependency-manage
              sync-knowledge

🧭 导航 (4)   view-screen  navigate  launch-app  hello


════════════════════════════════════════════════════════════════════════════════
                          存储层 (4 Store)
════════════════════════════════════════════════════════════════════════════════

SQLite / Postgres:
  ├── chat_threads          对话历史 + Pin/Archive/Fork/Share
  ├── observational_memory  Observer + Reflector 三层蒸馏
  ├── vector_index          TF-IDF 关键词向量索引
  └── resources             AGENTS.md + Learnings 知识记忆

Zvec (远程, 可选):
  ├── 语义文档索引          AGENTS.md 段落 → embedding
  ├── 学习记忆索引          Learnings 条目 → embedding 🆕
  └── 代码语义索引          代码块 → embedding 🆕


════════════════════════════════════════════════════════════════════════════════
                     6 大高级 AI 能力
════════════════════════════════════════════════════════════════════════════════

1. 🧠 主动学习        Learnings · save-memory · memory-writer
2. 🔄 自我反思        Observational Memory(Observer+Reflector) · code-review · context-compressor
3. 🖼️ 多模态理解      image-analyze (Gemini Vision)
4. 🧪 自动测试生成    test-writer · run-test · L3 pipeline
5. 📈 预测性分析      code-insights (complexity/hotspots/churn/staleness/evolution)
6. 📜 代码演化追踪    code-insights · git-ops · diff-preview


════════════════════════════════════════════════════════════════════════════════
                         v2.0 新增能力 (vs v1.0)
════════════════════════════════════════════════════════════════════════════════

Pre-L0  混合检索      keyword(TF-IDF) + semantic(Zvec) → RRF 融合
L0     RAG 上下文注入  混合检索结果注入 context_block
L1     RAG 增强分流    Gemini Flash 带 enriched context 决策
Sys    Zvec 向量数据库  嵌入生成·CRUD·语义搜索·健康检查
Sys    知识三向同步     AGENTS.md/Learnings/Code → Zvec 自动同步
Sys    双写索引         index-content 同时更新 local + Zvec
Sys    语义嵌入生成     embedder.ts → Zvec API embedding (备选TF-IDF)
```

---

## 文件清单 (50+ files · ~320KB)

```
templates/chat/
├── docs/
│   ├── architecture-spec.md     v2.0 架构 Spec (本文档)
│   └── integration-plan.md      集成实施计划
├── server/lib/ (16 files)
│   ├── token-budget.ts          L0 Token 预算
│   ├── context-assembler.ts     L0 上下文装配 + Pre-L0
│   ├── embedder.ts              TF-IDF + Zvec 语义嵌入
│   ├── vector-store.ts          SQLite 关键词向量库
│   ├── zvec-client.ts           Zvec 远程向量库客户端 🆕
│   ├── hybrid-retriever.ts      Pre-L0 混合检索 + RRF 🆕
│   ├── content-indexer.ts       双写索引 (local+Zvec)
│   ├── search-orchestrator.ts   L1 并行编排 (hybrid/mcp/web)
│   ├── triage-service.ts        L1 RAG-增强分流
│   ├── progress-emitter.ts      SSE流式进度
│   ├── plan-engine.ts           L2 Plan生成引擎
│   ├── sub-agent-runner.ts      L3 子代理依赖调度
│   ├── review-checker.ts        L3 审查管道
│   ├── change-reporter.ts       L4 变更报告
│   ├── memory-writer.ts         L4 记忆固化
│   ├── retry-wrapper.ts         自动重试包装器
│   ├── context-compressor.ts    上下文压缩
│   ├── terminal-manager.ts      终端会话管理
│   ├── knowledge-sync.ts        知识同步引擎
│   └── knowledge-sync-zvec.ts   SQL→Zvec 自动同步 🆕
├── server/plugins/ (3 files)
│   ├── agent-chat.ts            Agent工具注册 + System Prompt
│   ├── plan-routes.ts           Plan确认/流式API
│   └── knowledge-sync.ts       启动时知识同步Hook
├── actions/ (30 files)          29 Action + 1 sync
├── app/components/ (3 files)    ReasoningTrace · ToolCallCard · SubAgentProgress
├── app/routes/_index.tsx        Chat页面集成
├── config/const.ts              全局配置常量
├── AGENTS.md                    项目知识文档
└── .env.example                 环境变量模板
```
