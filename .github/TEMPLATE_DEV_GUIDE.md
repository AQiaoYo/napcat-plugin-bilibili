# NapCat 插件开发通用架构模板指南

> 基于 `napcat-plugin-auto-clear` 的最佳实践架构，融合了单例状态管理、服务分层、WebUI 前后端分离等高级特性。

---

## 1. 为什么选择此架构？

本模板采用**分层架构**与**单例状态管理**，解决了传统插件开发中常见的痛点：

| 传统方式 ❌ | 本架构 ✅ |
|-------------|-----------|
| `ctx` 上下文到处传递，代码混乱 | 全局 `pluginState` 单例，任意位置访问 |
| 配置管理分散，类型不安全 | `PluginConfig` 接口 + `sanitizeConfig` 校验 |
| 路由冲突，WebUI 接口难维护 | `ROUTE_PREFIX` 自动隔离命名空间 |
| 业务逻辑与框架代码耦合 | Handler → Service → Core 清晰分层 |

---

## 2. 项目结构详解

```text
src/
├── core/
│   └── state.ts              # 🔑 核心状态机 (单例模式)
│                             #    - PluginState 类：持有 ctx、config、logger
│                             #    - loadConfig / saveConfig：JSON 持久化
│                             #    - sanitizeConfig：类型安全的配置校验
├── handlers/
│   └── message-handler.ts    # 📨 消息入口 (路由到 Service，不写业务)
├── services/
│   ├── api-service.ts        # 🌐 WebUI API 路由注册
│   ├── cron-service.ts       # ⏰ 定时任务管理 (node-cron)
│   ├── cleanup-service.ts    # 🧹 清理业务逻辑
│   ├── data-service.ts       # 📊 数据统计服务
│   └── group-service.ts      # 👥 群组操作封装
├── webui/
│   └── dashboard.html        # 🖥️ 前端仪表盘 (原生 HTML + Tailwind)
├── config.ts                 # ⚙️ 配置 Schema 定义 (NapCat WebUI 界面)
├── index.ts                  # 🚀 插件入口 (生命周期钩子 + 路由注册)
└── types.ts                  # 📝 类型定义 (Config, GroupConfig 等)
```

---

## 3. 快速开始：基于本模板开发

### 第一步：克隆与重命名

1. 复制整个项目目录
2. 修改 `package.json`：
   ```json
   {
     "name": "napcat-plugin-your-name",
     "description": "你的插件描述",
     "author": "你的名字"
   }
   ```
3. 全局搜索替换（Ctrl+Shift+H）：
   - `napcat-plugin-auto-clear` → `napcat-plugin-your-name`
4. 修改 `src/services/api-service.ts` 中的 `ROUTE_PREFIX`：
   ```typescript
   const ROUTE_PREFIX = '/your-plugin';  // 你的路由前缀
   ```

### 第二步：定义配置

**① 类型定义** (`src/types.ts`)：
```typescript
export interface PluginConfig {
    enabled: boolean;
    myOption: string;        // 添加你的配置项
    myNumber: number;
}

export interface GroupConfig {
    groupId: number;
    customSetting: boolean;  // 按群配置项
}
```

**② 默认值** (`src/config.ts`)：
```typescript
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    myOption: 'default',
    myNumber: 10,
};
```

**③ WebUI Schema** (`src/config.ts` 的 `initConfigUI` 函数)：
```typescript
export function initConfigUI(ctx: NapCatPluginContext): void {
    const NapCatConfig = ctx.NapCatConfig;
    
    plugin_config_ui.push(
        NapCatConfig.switch('enabled', '启用插件', true),
        NapCatConfig.input('myOption', '选项名称', 'default'),
        NapCatConfig.number('myNumber', '数值设置', 10, { min: 1, max: 100 }),
    );
}
```

### 第三步：编写业务逻辑 (Services)

在 `src/services/` 下创建服务文件：

```typescript
// filepath: src/services/my-service.ts
import { pluginState } from '../core/state';

export async function doSomething(groupId: number): Promise<void> {
    // 1. 读取配置
    const { myOption, myNumber } = pluginState.config;
    
    // 2. 记录日志
    pluginState.log('info', `执行操作: ${myOption}, 群号: ${groupId}`);
    
    // 3. 调用 OneBot API
    await pluginState.callApi('send_group_msg', {
        group_id: groupId,
        message: `配置值: ${myNumber}`
    });
}
```

### 第四步：注册 WebUI 路由

在 `src/services/api-service.ts` 中添加路由：

```typescript
export function registerApiRoutes(ctx: NapCatPluginContext): void {
    const router = ctx.router;
    
    // GET /your-prefix/api/my-data
    router.get(`${ROUTE_PREFIX}/api/my-data`, async (req, res) => {
        try {
            const data = await MyService.getData();
            res.json({ code: 0, data });
        } catch (e) {
            pluginState.log('error', 'API 错误', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });
    
    // POST /your-prefix/api/action
    router.post(`${ROUTE_PREFIX}/api/action`, async (req, res) => {
        const { groupId } = req.body as { groupId: number };
        await MyService.doSomething(groupId);
        res.json({ code: 0, message: 'ok' });
    });
}
```

### 第五步：处理消息

在 `src/handlers/message-handler.ts` 中：

```typescript
import { pluginState } from '../core/state';
import * as MyService from '../services/my-service';

export async function handleMessage(
    ctx: NapCatPluginContext, 
    event: OB11Message
): Promise<void> {
    // 检查开关
    if (!pluginState.config.enabled) return;
    
    // 指令解析
    const text = event.raw_message?.trim() ?? '';
    
    if (text === '#我的功能') {
        await MyService.doSomething(event.group_id!);
    }
}
```

### 第六步：前端开发 (WebUI)

`src/webui/dashboard.html` 中的关键模式：

```html
<script>
// 插件名称注入 (由后端 plugin-info.js 提供)
const PLUGIN_NAME = window.__PLUGIN_NAME__ || 'napcat-plugin-your-name';
const ROUTE_PREFIX = '/your-plugin';

// Token 从 URL 参数获取
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('webui_token') || '';

// 封装带鉴权的 fetch
async function authFetch(path, options = {}) {
    const url = `${ROUTE_PREFIX}${path}?webui_token=${token}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    return res.json();
}

// 使用示例
async function loadData() {
    const { code, data } = await authFetch('/api/my-data');
    if (code === 0) {
        console.log(data);
    }
}
</script>
```

---

## 4. 核心模式详解

### 4.1 全局状态 `pluginState`

```typescript
import { pluginState } from '../core/state';

// ✅ 读取配置
const cfg = pluginState.config;

// ✅ 记录日志 (自动带插件前缀)
pluginState.log('info', '普通信息');
pluginState.log('warn', '警告信息');
pluginState.log('error', '错误信息', error);

// ✅ 调用 OneBot API (封装了 ctx.actions.call)
await pluginState.callApi('send_group_msg', {
    group_id: 123456,
    message: 'Hello'
});

// ✅ 获取运行时长
const uptime = pluginState.getUptime();  // 返回格式化字符串
```

### 4.2 类型安全的配置校验

`src/core/state.ts` 中的 `sanitizeConfig` 模式：

```typescript
function sanitizeConfig(raw: unknown): PluginConfig {
    const config = { ...DEFAULT_CONFIG };
    if (!raw || typeof raw !== 'object') return config;
    
    const r = raw as Record<string, unknown>;
    
    // 逐字段校验，确保类型正确
    if (typeof r.enabled === 'boolean') {
        config.enabled = r.enabled;
    }
    if (typeof r.myNumber === 'number' && r.myNumber > 0) {
        config.myNumber = r.myNumber;
    }
    // ... 其他字段
    
    return config;
}
```

### 4.3 配置热重载流程

```
用户修改 WebUI 配置
       ↓
POST /config 路由接收
       ↓
sanitizeConfig 校验
       ↓
pluginState.setConfig(newConfig)
       ↓
saveConfig() 写入 JSON
       ↓
触发 plugin_on_config_change
       ↓
reloadAllCronJobs() 重载定时任务
```

### 4.4 Cron 表达式规则

项目使用 `node-cron`，校验逻辑在 `src/services/cron-service.ts`：

```typescript
// ✅ 有效格式 (5-6 字段)
'0 8 * * *'        // 每天 8:00
'*/30 * * * *'     // 每 30 分钟
'0 0 * * 0'        // 每周日 0:00

// ❌ 无效格式
'0 8 * * * *'      // 7 字段（秒级在某些库需要特殊处理）
'0 8 ? * *'        // 包含 ? 字符
```

---
