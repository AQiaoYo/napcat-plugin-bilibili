/**
 * NapCat 自动清理不活跃群成员插件
 * 
 * 功能：
 * - 定时扫描群成员活跃度
 * - 自动清理长期不活跃的"鱼干"成员
 * - 提供 WebUI 仪表盘查看状态和配置
 * 
 * @author AQiaoYo
 * @license MIT
 */

// @ts-ignore - NapCat 类型定义
import type { PluginModule, NapCatPluginContext, PluginConfigSchema, PluginConfigUIController } from 'napcat-types/napcat-onebot/network/plugin-manger';
// @ts-ignore - NapCat 消息类型
import type { OB11Message } from 'napcat-types/napcat-onebot';
// @ts-ignore - NapCat 事件类型
import { EventType } from 'napcat-types/napcat-onebot/event/index';

import { initConfigUI } from './config';
import { pluginState } from './core/state';
import { handleMessage } from './handlers/message-handler';
import { getGroupsWithPermissions } from './services/group-service';
import { runCleanupAndNotify, runCleanupForGroup, getLastCleanupResult, getCleanupStats } from './services/cleanup-service';

/** 框架配置 UI Schema，NapCat WebUI 会读取此导出来展示配置面板 */
export let plugin_config_ui: PluginConfigSchema = [];

/** 路由前缀（请在新插件中修改为合适前缀） */
const ROUTE_PREFIX = '/plugin-template';

/**
 * 插件初始化函数
 * 负责加载配置、注册 WebUI 路由、启动定时任务
 */
const plugin_init = async (ctx: NapCatPluginContext) => {
    try {
        pluginState.initFromContext(ctx);
        pluginState.loadConfig(ctx);
        pluginState.log('info', `初始化完成 | name=${ctx.pluginName}`);

        // 生成配置 schema 并导出（config.ts 中实现）
        try {
            const schema = initConfigUI(ctx);
            plugin_config_ui = schema || [];
        } catch (e) {
            pluginState.logDebug('initConfigUI 未实现或抛出错误，已跳过');
        }

        // 注册最小化的 WebUI 路由（保留静态和基础接口，便于后续扩展）
        try {
            const base = (ctx as any).router;
            const wrapPath = (p: string) => {
                if (!p) return ROUTE_PREFIX;
                return p.startsWith('/') ? `${ROUTE_PREFIX}${p}` : `${ROUTE_PREFIX}/${p}`;
            };

            // 静态资源目录（映射到 src/webui）
            if (base && base.static) base.static(wrapPath('/static'), 'webui');

            // 插件信息脚本
            if (base && base.get) {
                base.get(wrapPath('/static/plugin-info.js'), (_req: any, res: any) => {
                    try {
                        res.type('application/javascript');
                        res.send(`window.__PLUGIN_NAME__ = ${JSON.stringify(ctx.pluginName)};`);
                    } catch (e) {
                        res.status(500).send('// failed to generate plugin-info');
                    }
                });

                // 基础信息接口
                base.get(wrapPath('/info'), (_req: any, res: any) => {
                    res.json({ code: 0, data: { pluginName: ctx.pluginName } });
                });

                // 状态接口
                base.get(wrapPath('/status'), (_req: any, res: any) => {
                    const uptime = pluginState.getUptime();
                    res.json({ code: 0, data: { pluginName: pluginState.pluginName, uptime, config: pluginState.getConfig() } });
                });

                // 配置接口
                base.get(wrapPath('/config'), (_req: any, res: any) => {
                    res.json({ code: 0, data: pluginState.getConfig() });
                });

                base.post && base.post(wrapPath('/config'), async (req: any, res: any) => {
                    try {
                        const newCfg = req.body || {};
                        pluginState.setConfig(ctx, newCfg as any);
                        pluginState.log('info', '配置已保存（通过最小化 API）');
                        res.json({ code: 0, message: 'ok' });
                    } catch (err) {
                        pluginState.log('error', '保存配置失败:', err);
                        res.status(500).json({ code: -1, message: String(err) });
                    }
                });
            }
        } catch (e) {
            pluginState.log('warn', '注册基础 WebUI 路由失败（环境可能不完全支持 Router API）', e);
        }

        pluginState.log('info', '插件初始化完成（模板）');
    } catch (error) {
        pluginState.log('error', '插件初始化失败:', error);
    }
};

/**
 * 消息处理函数
 * 当收到群消息时触发，用于未来扩展（如管理员命令）
 */
const plugin_onmessage = async (ctx: NapCatPluginContext, event: OB11Message) => {
    if (!pluginState.config.enabled) return;
    if (event.post_type !== EventType.MESSAGE || !event.raw_message) return;
    await handleMessage(ctx, event as OB11Message);
};

/**
 * 插件卸载函数
 * 负责清理资源、停止定时任务
 */
const plugin_cleanup = async (ctx: NapCatPluginContext) => {
    try {
        // Cron / 定时任务功能已移除或为后端可选实现，若需要在卸载时执行清理逻辑，请在此处添加。
        pluginState.log('info', '插件已卸载');
    } catch (e) {
        pluginState.log('warn', '停止定时任务时出错:', e);
    }
};

/** 获取当前配置 */
export const plugin_get_config = async (ctx: NapCatPluginContext) => {
    return pluginState.getConfig();
};

/** 设置配置（完整替换） */
export const plugin_set_config = async (ctx: NapCatPluginContext, config: any) => {
    pluginState.saveConfig(ctx, config);
    pluginState.log('info', '配置已通过 API 更新');
};

/**
 * 配置变更回调
 * 当 WebUI 中修改配置时触发，自动保存并重载定时任务
 */
export const plugin_on_config_change = async (
    ctx: NapCatPluginContext,
    ui: PluginConfigUIController,
    key: string,
    value: any,
    currentConfig?: Record<string, any>
) => {
    try {
        pluginState.setConfig(ctx, { [key]: value } as any);
        pluginState.logDebug(`配置项 ${key} 已更新`);
    } catch (err) {
        pluginState.log('error', `更新配置项 ${key} 失败:`, err);
    }

    // Cron 功能在模板中已移除；如果需要在配置变更时触发其他操作，可在这里实现。
};

export {
    plugin_init,
    plugin_onmessage,
    plugin_cleanup
};
