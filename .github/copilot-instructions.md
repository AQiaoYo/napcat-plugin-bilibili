# Copilot Instructions for napcat-plugin-bilibili

## 目标

为 AI 编程代理提供立即可用的、与本仓库紧密相关的上下文：架构要点、开发/构建流程、约定与关键集成点，便于自动完成改进、修复与小功能。

---

## 一句话概览

这是一个面向 NapCat 的插件（TypeScript，ESM），使用 Vite 打包到 `dist/index.mjs` 作为插件入口；主要职责是自动解析消息中的 B 站视频链接并提供 WebUI 配置。

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
| 服务分层 | `src/services/*.ts` | 按职责拆分：API、B站解析、登录管理、Cookie刷新 |
| 配置校验 | `sanitizeConfig()` | 类型安全的运行时配置验证 |
| 路由隔离 | `ROUTE_PREFIX` | 插件专属路由前缀 `/bilibili` |

---

## 关键文件与职责

### 入口与生命周期

| 文件 | 职责 |
|------|------|
| `src/index.ts` | 插件入口，导出 `plugin_init`, `plugin_onmessage` 等生命周期钩子 |
| `src/config.ts` | NapCat WebUI 配置 Schema 定义 (`plugin_config_ui`) |

### 核心状态

| 文件 | 职责 |
|------|------|
| `src/core/state.ts` | 全局状态单例 `pluginState`，管理配置持久化及 API 调用封装 |
| `src/types.ts` | TypeScript 类型定义 |

### 业务服务

| 文件 | 职责 |
|------|------|
| `src/services/api-service.ts` | WebUI API 路由注册，`ROUTE_PREFIX = '/bilibili'` |
| `src/services/bilibili-service.ts` | B 站链接解析、视频详情获取核心逻辑 |
| `src/services/bilibili-login-service.ts` | B 站登录相关逻辑（扫码登录等） |
| `src/services/cookie-refresh-service.ts` | Cookie 自动刷新服务 |

### 消息处理

| 文件 | 职责 |
|------|------|
| `src/handlers/message-handler.ts` | 消息事件入口，正则匹配 B 站链接并触发解析 |

### 前端 WebUI

| 文件 | 职责 |
|------|------|
| `src/webui/dashboard.html` | 管理界面，用于展示解析状态、配置 Cookie |

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

---

## 编码约定

### ESM 模块规范

- `package.json` 中 `type: "module"`
- 导入使用 `.js` 扩展名（TypeScript 编译后）

### 状态访问模式

```typescript
import { pluginState } from '../core/state';
const config = pluginState.config;
pluginState.log('info', '解析视频: ' + bvid);
```

### API 响应格式

```typescript
// 成功响应
res.json({ code: 0, data: { ... } });

// 错误响应
res.status(500).json({ code: -1, message: '错误描述' });
```

---

## WebUI 开发

### 路由前缀

```typescript
// src/services/api-service.ts
const ROUTE_PREFIX = '/bilibili';
```

---

## 注意事项

- **路由前缀**：所有 API 必须以 `/bilibili` 开头。
- **日志**：统一使用 `pluginState.log()`。
- **文件引用**：WebUI 静态资源需确保构建后路径正确。
- **Cookie 安全**：避免在日志中打印完整的 Cookie 敏感信息。
