/**
 * NapCat B站视频链接解析插件
 * 
 * 功能：
 * - 自动解析群消息中的 B 站视频链接
 * - 发送视频信息卡片（封面、标题、UP主、播放量等）
 * - 支持 BV号、AV号、短链接等多种格式
 * - WebUI 支持按群开关
 * 
 * @author AQiaoYo
 * @license MIT
 */

// @ts-ignore - NapCat 类型定义
import type { PluginModule, NapCatPluginContext, PluginConfigSchema, PluginConfigUIController } from 'napcat-types/napcat-onebot/network/plugin/types';
// @ts-ignore - NapCat 消息类型
import type { OB11Message } from 'napcat-types/napcat-onebot';
// @ts-ignore - NapCat 事件类型
import { EventType } from 'napcat-types/napcat-onebot/event/index';

import { initConfigUI } from './config';
import { pluginState } from './core/state';
import { handleMessage } from './handlers/message-handler';
import {
    generateQrCode,
    pollQrCodeStatus,
    getLoginStatus,
    clearCredential,
    getQrSessionStatus,
    startAutoRefreshService,
    stopAutoRefreshService,
} from './services/bilibili-login-service';
import { QrCodeLoginStatus } from './types';

/** 框架配置 UI Schema，NapCat WebUI 会读取此导出来展示配置面板 */
export let plugin_config_ui: PluginConfigSchema = [];

/** 获取登录状态文本 */
function getStatusText(status: QrCodeLoginStatus): string {
    switch (status) {
        case QrCodeLoginStatus.WAITING:
            return '等待扫码';
        case QrCodeLoginStatus.SCANNED:
            return '已扫码，请确认';
        case QrCodeLoginStatus.EXPIRED:
            return '二维码已过期';
        case QrCodeLoginStatus.SUCCESS:
            return '登录成功';
        default:
            return '未知状态';
    }
}

/**
 * 插件初始化函数
 * 负责加载配置、注册 WebUI 路由
 */
export const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
    try {
        pluginState.initFromContext(ctx);
        pluginState.loadConfig(ctx);
        pluginState.log('info', `初始化完成 | name=${ctx.pluginName}`);

        // 启动 Cookie 自动刷新服务
        startAutoRefreshService();

        // 生成配置 schema 并导出
        try {
            const schema = initConfigUI(ctx);
            plugin_config_ui = schema || [];
        } catch (e) {
            pluginState.logDebug('initConfigUI 未实现或抛出错误，已跳过');
        }

        // 注册 WebUI 路由
        try {
            const base = (ctx as any).router;

            // 插件信息脚本（必须在静态目录之前注册，否则会被静态目录拦截）
            if (base && base.get) {
                base.get('/static/plugin-info.js', (_req: any, res: any) => {
                    try {
                        res.type('application/javascript');
                        res.send(`window.__PLUGIN_NAME__ = ${JSON.stringify(ctx.pluginName)};`);
                    } catch (e) {
                        res.status(500).send('// failed to generate plugin-info');
                    }
                });
            }

            // 静态资源目录（放在动态路由之后）
            if (base && base.static) base.static('/static', 'webui');

            // 其他 API 路由
            if (base && base.get) {
                // 基础信息接口
                base.get('/info', (_req: any, res: any) => {
                    res.json({ code: 0, data: { pluginName: ctx.pluginName } });
                });

                // 状态接口
                base.get('/status', (_req: any, res: any) => {
                    const uptime = pluginState.getUptime();
                    res.json({
                        code: 0,
                        data: {
                            pluginName: pluginState.pluginName,
                            uptime,
                            uptimeFormatted: pluginState.getUptimeFormatted(),
                            config: pluginState.getConfig(),
                            stats: pluginState.stats
                        }
                    });
                });

                // 配置读取接口
                base.get('/config', (_req: any, res: any) => {
                    res.json({ code: 0, data: pluginState.getConfig() });
                });

                // 配置保存接口
                base.post && base.post('/config', async (req: any, res: any) => {
                    try {
                        let body = req.body;
                        if (!body || Object.keys(body).length === 0) {
                            try {
                                const raw = await new Promise<string>((resolve) => {
                                    let data = '';
                                    req.on('data', (chunk: any) => data += chunk);
                                    req.on('end', () => resolve(data));
                                });
                                if (raw) body = JSON.parse(raw);
                            } catch (e) {
                                pluginState.log('error', '解析全局配置 Body 失败:', e);
                            }
                        }

                        pluginState.setConfig(ctx, (body || {}) as any);
                        pluginState.log('info', '配置已保存');
                        res.json({ code: 0, message: 'ok' });
                    } catch (err) {
                        pluginState.log('error', '保存配置失败:', err);
                        res.status(500).json({ code: -1, message: String(err) });
                    }
                });

                // 群列表接口
                base.get('/groups', async (_req: any, res: any) => {
                    try {
                        // 直接使用 ctx.actions.call 获取群列表
                        const groups: any[] = await ctx.actions.call(
                            'get_group_list',
                            {},
                            ctx.adapterName,
                            ctx.pluginManager.config
                        );
                        const config = pluginState.getConfig();

                        // 为每个群添加配置信息
                        const groupsWithConfig = (groups || []).map((group: any) => {
                            const groupId = String(group.group_id);
                            const groupConfig = config.groupConfigs?.[groupId] || {};
                            return {
                                ...group,
                                biliEnabled: groupConfig.enabled !== false // 默认启用
                            };
                        });

                        res.json({ code: 0, data: groupsWithConfig });
                    } catch (e) {
                        pluginState.log('error', '获取群列表失败:', e);
                        res.status(500).json({ code: -1, message: String(e) });
                    }
                });

                // 批量更新群配置接口
                base.post && base.post('/groups/bulk-config', async (req: any, res: any) => {
                    try {
                        let body = req.body;
                        if (!body || Object.keys(body).length === 0) {
                            try {
                                const raw = await new Promise<string>((resolve) => {
                                    let data = '';
                                    req.on('data', (chunk: any) => data += chunk);
                                    req.on('end', () => resolve(data));
                                });
                                if (raw) body = JSON.parse(raw);
                            } catch (e) {
                                pluginState.log('error', '解析批量配置 Body 失败:', e);
                            }
                        }

                        const { enabled, groupIds } = body || {};
                        if (typeof enabled !== 'boolean' || !Array.isArray(groupIds)) {
                            return res.status(400).json({ code: -1, message: '参数错误', received: body });
                        }

                        const currentGroupConfigs = { ...(pluginState.config.groupConfigs || {}) };
                        for (const groupId of groupIds) {
                            const gid = String(groupId);
                            currentGroupConfigs[gid] = { ...currentGroupConfigs[gid], enabled };
                        }

                        pluginState.setConfig(ctx, { groupConfigs: currentGroupConfigs });

                        pluginState.log('info', `批量更新群配置完成 | 数量: ${groupIds.length}, enabled=${enabled}`);
                        res.json({ code: 0, message: 'ok' });
                    } catch (err) {
                        pluginState.log('error', '批量更新群配置失败:', err);
                        res.status(500).json({ code: -1, message: String(err) });
                    }
                });

                // 更新群配置接口
                base.post && base.post('/groups/:id/config', async (req: any, res: any) => {
                    try {
                        const groupId = String(req.params?.id || '');
                        if (!groupId) {
                            return res.status(400).json({ code: -1, message: '缺少群 ID' });
                        }

                        let body = req.body;
                        if (!body || Object.keys(body).length === 0) {
                            try {
                                const raw = await new Promise<string>((resolve) => {
                                    let data = '';
                                    req.on('data', (chunk: any) => data += chunk);
                                    req.on('end', () => resolve(data));
                                });
                                if (raw) body = JSON.parse(raw);
                            } catch (e) {
                                pluginState.log('error', `解析群 ${groupId} 配置 Body 失败:`, e);
                            }
                        }

                        const { enabled } = body || {};
                        pluginState.updateGroupConfig(ctx, groupId, { enabled: Boolean(enabled) });
                        pluginState.log('info', `群 ${groupId} 配置已更新: enabled=${enabled}`);
                        res.json({ code: 0, message: 'ok' });
                    } catch (err) {
                        pluginState.log('error', '更新群配置失败:', err);
                        res.status(500).json({ code: -1, message: String(err) });
                    }
                });

                // ==================== B 站登录相关接口 ====================

                // 获取登录状态
                base.get('/login/status', async (_req: any, res: any) => {
                    try {
                        const status = await getLoginStatus();
                        res.json({ code: 0, data: status });
                    } catch (e) {
                        pluginState.log('error', '获取登录状态失败:', e);
                        res.status(500).json({ code: -1, message: String(e) });
                    }
                });

                // 生成登录二维码
                base.post && base.post('/login/qrcode/generate', async (_req: any, res: any) => {
                    try {
                        const result = await generateQrCode();
                        if (result) {
                            res.json({
                                code: 0,
                                data: {
                                    url: result.url,
                                    qrcode_key: result.qrcode_key,
                                }
                            });
                        } else {
                            res.status(500).json({ code: -1, message: '生成二维码失败' });
                        }
                    } catch (e) {
                        pluginState.log('error', '生成二维码失败:', e);
                        res.status(500).json({ code: -1, message: String(e) });
                    }
                });

                // 轮询二维码状态
                base.get('/login/qrcode/poll', async (req: any, res: any) => {
                    try {
                        const qrcode_key = req.query?.qrcode_key as string | undefined;
                        const result = await pollQrCodeStatus(qrcode_key);

                        res.json({
                            code: 0,
                            data: {
                                status: result.status,
                                statusText: getStatusText(result.status),
                                message: result.message,
                                isSuccess: result.status === QrCodeLoginStatus.SUCCESS,
                                isExpired: result.status === QrCodeLoginStatus.EXPIRED,
                                isScanned: result.status === QrCodeLoginStatus.SCANNED,
                            }
                        });
                    } catch (e) {
                        pluginState.log('error', '轮询二维码状态失败:', e);
                        res.status(500).json({ code: -1, message: String(e) });
                    }
                });

                // 获取二维码会话状态
                base.get('/login/qrcode/session', async (_req: any, res: any) => {
                    try {
                        const session = getQrSessionStatus();
                        res.json({ code: 0, data: session });
                    } catch (e) {
                        res.status(500).json({ code: -1, message: String(e) });
                    }
                });

                // 退出登录
                base.post && base.post('/login/logout', async (_req: any, res: any) => {
                    try {
                        await clearCredential();
                        res.json({ code: 0, message: '已退出登录' });
                    } catch (e) {
                        pluginState.log('error', '退出登录失败:', e);
                        res.status(500).json({ code: -1, message: String(e) });
                    }
                });

                // 注册仪表盘页面
                if (base.page) {
                    base.page({
                        path: 'bilibili-dashboard',
                        title: 'B站解析仪表盘',
                        icon: '📺',
                        htmlFile: 'webui/dashboard.html',
                        description: '管理 B 站视频链接解析功能'
                    });
                }
            }
        } catch (e) {
            pluginState.log('warn', '注册 WebUI 路由失败', e);
        }

        pluginState.log('info', '插件初始化完成');
    } catch (error) {
        pluginState.log('error', '插件初始化失败:', error);
    }
};

/**
 * 消息处理函数
 * 当收到群消息时触发，检测并解析 B 站链接
 */
export const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx, event) => {
    if (!pluginState.config.enabled) return;
    if (event.post_type !== EventType.MESSAGE || !event.raw_message) return;
    await handleMessage(ctx, event as OB11Message);
};

/**
 * 插件卸载函数
 * 热重载时会调用此函数清理资源，必须释放所有定时器、连接等
 */
export const plugin_cleanup: PluginModule['plugin_cleanup'] = async (ctx) => {
    try {
        // 停止 Cookie 自动刷新定时器
        stopAutoRefreshService();
        // 清理解析缓存等状态
        pluginState.cleanup();
        ctx.logger.info('[Bilibili] 插件已卸载，资源已清理');
    } catch (e) {
        ctx.logger.warn('[Bilibili] 插件卸载时出错:', e);
    }
};

/** 获取当前配置 */
export const plugin_get_config: PluginModule['plugin_get_config'] = async (ctx) => {
    return pluginState.getConfig();
};

/** 设置配置（完整替换） */
export const plugin_set_config: PluginModule['plugin_set_config'] = async (ctx, config) => {
    pluginState.logDebug(`plugin_set_config 调用: ${JSON.stringify(config)}`);
    pluginState.replaceConfig(ctx, config as any);
    pluginState.log('info', '配置已通过 API 更新');
};

/**
 * 配置变更回调
 * 当 WebUI 中修改配置时触发
 */
export const plugin_on_config_change: PluginModule['plugin_on_config_change'] = async (
    ctx, ui, key, value, currentConfig
) => {
    try {
        pluginState.logDebug(`plugin_on_config_change: key=${key}, value=${JSON.stringify(value)}`);
        pluginState.setConfig(ctx, { [key]: value });
        pluginState.logDebug(`配置项 ${key} 已更新`);
    } catch (err) {
        pluginState.log('error', `更新配置项 ${key} 失败:`, err);
    }
};

