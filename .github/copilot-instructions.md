# Copilot Instructions for napcat-plugin-auto-clear

## 目标

为 AI 编程代理提供立即可用的、与本仓库紧密相关的上下文：架构要点、开发/构建流程、约定与关键集成点，便于自动完成改进、修复与小功能。

---

## 一句话概览

这是一个面向 NapCat 的插件（TypeScript，ESM），使用 Vite 打包到 `dist/index.mjs` 作为插件入口；主要职责是基于定时任务清理不活跃群成员并提供一个 WebUI 管理界面。

---

## 架构设计

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      index.ts (入口)                         │
│         生命周期钩子 + WebUI 路由注册 + 事件分发              │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Handlers    │  │   Services    │  │     WebUI     │
│  消息处理入口  │  │   业务逻辑    │  │   前端界面    │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │
        └────────┬─────────┘
                 ▼
        ┌───────────────┐
        │  core/state   │
        │  全局状态单例  │
        └───────────────┘
```

### 核心设计模式

| 模式 | 实现位置 | 说明 |
|------|----------|------|
| 单例状态 | `src/core/state.ts` | `pluginState` 全局单例，持有 ctx、config、logger |
| 服务分层 | `src/services/*.ts` | 按职责拆分：API、Cron、清理、数据、群组 |
| 配置校验 | `sanitizeConfig()` | 类型安全的运行时配置验证 |
| 路由隔离 | `ROUTE_PREFIX` | 插件专属路由前缀 `/auto-clear` |

---

## 关键文件与职责

### 入口与生命周期

| 文件 | 职责 |
|------|------|
| `src/index.ts` | 插件入口，导出 `plugin_init`, `plugin_onmessage`, `plugin_cleanup`, `plugin_get_config`, `plugin_set_config`, `plugin_on_config_change` |
| `src/config.ts` | NapCat WebUI 配置 Schema 定义 (`plugin_config_ui`) |

### 核心状态

| 文件 | 职责 |
|------|------|
| `src/core/state.ts` | 全局状态单例 `pluginState`，配置持久化 (`loadConfig`/`saveConfig`)，配置校验 (`sanitizeConfig`) |
| `src/types.ts` | TypeScript 类型定义 (`PluginConfig`, `GroupConfig`, `CleanupStats` 等) |

### 业务服务

| 文件 | 职责 |
|------|------|
| `src/services/api-service.ts` | WebUI API 路由注册，`ROUTE_PREFIX = '/auto-clear'` |
| `src/services/cron-service.ts` | 定时任务管理 (node-cron)，`isValidCronExpression` 校验 |
| `src/services/cleanup-service.ts` | 清理业务逻辑核心实现 |
| `src/services/data-service.ts` | 数据统计服务 |
| `src/services/group-service.ts` | 群组操作封装 |

### 消息处理

| 文件 | 职责 |
|------|------|
| `src/handlers/message-handler.ts` | 消息事件入口，路由到对应 Service |

### 前端 WebUI

| 文件 | 职责 |
|------|------|
| `src/webui/dashboard.html` | 管理仪表盘，Tailwind CSS 样式，通过 `authFetch` 调用后端 API |

---

## 开发流程

### 环境准备

```bash
# 安装依赖
pnpm install

# 类型检查
npx tsc --noEmit

# 构建产物
pnpm run build
# 输出: dist/index.mjs
```

### 本地调试

```typescript
// test/mock-ctx.ts - 模拟 NapCat 上下文
const mockCtx = {
    logger: console,
    configPath: './test-config',
    router: express(),
    actions: {
        call: async (api: string, params: unknown) => {
            console.log(`Mock API: ${api}`, params);
            return { status: 'ok', data: {} };
        }
    }
};

import { plugin_init } from '../dist/index.mjs';
await plugin_init(mockCtx);
```

---

## 编码约定

### ESM 模块规范

- `package.json` 中 `type: "module"`
- 导入使用 `.js` 扩展名（TypeScript 编译后）
- 避免 CJS-only API

### 状态访问模式

```typescript
// ✅ 正确：通过 pluginState 访问
import { pluginState } from '../core/state';
const config = pluginState.config;
pluginState.log('info', '消息');
await pluginState.callApi('send_group_msg', { group_id, message });

// ❌ 错误：直接传递 ctx
function doSomething(ctx: NapCatPluginContext) { ... }
```

### API 响应格式

```typescript
// 成功响应
res.json({ code: 0, data: { ... } });

// 错误响应
res.status(500).json({ code: -1, message: '错误描述' });
```

### Cron 表达式规则

```typescript
// ✅ 有效格式 (5-6 字段，node-cron 规范)
'0 8 * * *'        // 每天 8:00
'*/30 * * * *'     // 每 30 分钟
'0 0 * * 0'        // 每周日 0:00

// ❌ 无效格式
'0 8 * * * *'      // 7 字段
'0 8 ? * *'        // 包含 ? (Quartz 风格，不支持)
```

使用 `isValidCronExpression()` 校验：
```typescript
import { isValidCronExpression } from './services/cron-service';
if (!isValidCronExpression(cronExpr)) {
    throw new Error('Invalid cron expression');
}
```

---

## WebUI 开发

### 路由前缀

```typescript
// src/services/api-service.ts
const ROUTE_PREFIX = '/auto-clear';

// 注册路由
router.get(`${ROUTE_PREFIX}/api/status`, ...);
router.post(`${ROUTE_PREFIX}/api/config`, ...);
```

### 前端鉴权

```javascript
// dashboard.html
const token = new URLSearchParams(window.location.search).get('webui_token') || '';

async function authFetch(path, options = {}) {
    const url = `${ROUTE_PREFIX}${path}?webui_token=${token}`;
    return fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    }).then(r => r.json());
}
```

### 插件名称注入

```javascript
// 由 plugin-info.js 路由提供
const PLUGIN_NAME = window.__PLUGIN_NAME__ || 'napcat-plugin-auto-clear';
```

---

## 配置管理

### 配置保存流程

```
前端 POST /config
       ↓
sanitizeConfig() 校验
       ↓
pluginState.setConfig()
       ↓
saveConfig() 写入 JSON
       ↓
触发 plugin_on_config_change
       ↓
reloadAllCronJobs() 重载定时任务
```

### 添加新配置项

1. **类型定义** (`src/types.ts`)：
   ```typescript
   export interface PluginConfig {
       // ...existing fields...
       newOption: string;
   }
   ```

2. **默认值** (`src/config.ts`)：
   ```typescript
   export const DEFAULT_CONFIG: PluginConfig = {
       // ...existing defaults...
       newOption: 'default',
   };
   ```

3. **WebUI Schema** (`src/config.ts` 的 `initConfigUI`)：
   ```typescript
   plugin_config_ui.push(
       NapCatConfig.input('newOption', '新选项', 'default'),
   );
   ```

4. **校验逻辑** (`src/core/state.ts` 的 `sanitizeConfig`)：
   ```typescript
   if (typeof r.newOption === 'string') {
       config.newOption = r.newOption;
   }
   ```

---

## 常用 OneBot API

| 功能 | API | 参数 |
|------|-----|------|
| 发送群消息 | `send_group_msg` | `{ group_id, message }` |
| 发送私聊 | `send_private_msg` | `{ user_id, message }` |
| 撤回消息 | `delete_msg` | `{ message_id }` |
| 获取群成员列表 | `get_group_member_list` | `{ group_id }` |
| 获取群成员信息 | `get_group_member_info` | `{ group_id, user_id }` |
| 踢出群成员 | `set_group_kick` | `{ group_id, user_id, reject_add_request? }` |
| 禁言成员 | `set_group_ban` | `{ group_id, user_id, duration }` |

---

## 典型任务示例

### 新增 API 路由

```typescript
// src/services/api-service.ts
router.get(`${ROUTE_PREFIX}/api/new-endpoint`, async (req, res) => {
    try {
        const data = await SomeService.getData();
        res.json({ code: 0, data });
    } catch (e) {
        pluginState.log('error', 'API Error', e);
        res.status(500).json({ code: -1, message: String(e) });
    }
});
```

### 新增消息指令

```typescript
// src/handlers/message-handler.ts
if (text === '#新指令') {
    await NewService.doSomething(event.group_id!);
    return;
}
```

### 新增定时任务

```typescript
// src/services/cron-service.ts
import cron from 'node-cron';

const task = cron.schedule('0 8 * * *', async () => {
    await MyService.dailyTask();
}, { scheduled: true });
```

---

## PR/变更指南

### 小改动 (Bug 修复/增强)

1. 修改对应 `src/services/*` 或 `src/core/state.ts`
2. 保持 HTTP API 响应结构不变 (`{ code, data/message }`)
3. 运行 `npx tsc --noEmit` 确保类型正确

### UI 变更

1. 同时修改 `src/webui/dashboard.html` 和后端路由
2. 确保前端使用 `authFetch` 并传递 `webui_token`
3. 保持向后兼容

### 配置变更

1. 更新 `types.ts` 类型定义
2. 更新 `config.ts` 默认值和 Schema
3. 更新 `state.ts` 的 `sanitizeConfig`
4. 测试配置保存/读取流程

---

## 注意事项

- **不要删除 `plugin_config_ui` 导出**：NapCat WebUI 依赖此变量
- **WebUI 静态文件路径**：`src/webui/` 目录，构建时保持相对结构
- **白名单功能已下线**：相关路由已移除，但配置可能保留历史字段
- **日志使用 `pluginState.log()`**：自动带插件前缀，统一格式

---

## 语言约定

- 代码注释：中文优先
- 提交消息：中文
- 文档：中文
