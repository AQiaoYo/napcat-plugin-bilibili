/**
 * 状态管理模块
 * 插件全局状态类，封装配置、日志、上下文等
 */

import fs from 'fs';
import path from 'path';
import type { NapCatPluginContext, PluginLogger } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { ActionMap } from 'napcat-types/napcat-onebot/action/index';
import type { NetworkAdapterConfig } from 'napcat-types/napcat-onebot/config/config';
import { DEFAULT_CONFIG, getDefaultConfig } from '../config';
import type { PluginConfig, GroupBilibiliConfig, SendMode, BilibiliCredential } from '../types';

/** 日志前缀 */
const LOG_TAG = '[Bilibili]';

/** 类型守卫：判断是否为对象 */
function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object';
}

/**
 * 配置清洗函数
 * 确保从文件读取的配置符合预期类型
 */
function sanitizeConfig(raw: unknown): PluginConfig {
    if (!isObject(raw)) return getDefaultConfig();
    const base = getDefaultConfig();
    const out: PluginConfig = { ...base };

    // enabled
    if (typeof (raw as Record<string, unknown>)['enabled'] === 'boolean') {
        out.enabled = (raw as Record<string, unknown>)['enabled'] as boolean;
    }

    // sendMode
    const rawSendMode = (raw as Record<string, unknown>)['sendMode'];
    if (rawSendMode === 'info-only' || rawSendMode === 'with-video') {
        out.sendMode = rawSendMode as SendMode;
    }

    // maxVideoSizeMB
    const rawMaxSize = (raw as Record<string, unknown>)['maxVideoSizeMB'];
    if (typeof rawMaxSize === 'number' && rawMaxSize > 0) {
        out.maxVideoSizeMB = rawMaxSize;
    }

    // credential (B站登录凭据)
    const rawCredential = (raw as Record<string, unknown>)['credential'];
    if (isObject(rawCredential)) {
        const cred: BilibiliCredential = {
            sessdata: '',
            bili_jct: '',
            dedeuserid: '',
        };
        const c = rawCredential as Record<string, unknown>;
        if (typeof c['sessdata'] === 'string') cred.sessdata = c['sessdata'];
        if (typeof c['bili_jct'] === 'string') cred.bili_jct = c['bili_jct'];
        if (typeof c['dedeuserid'] === 'string') cred.dedeuserid = c['dedeuserid'];
        if (typeof c['refresh_token'] === 'string') cred.refresh_token = c['refresh_token'];
        if (typeof c['login_time'] === 'number') cred.login_time = c['login_time'];

        // 只有当必要字段都存在时才保存
        if (cred.sessdata && cred.bili_jct && cred.dedeuserid) {
            out.credential = cred;
        }
    }

    // groupConfigs
    const rawGroupConfigs = (raw as Record<string, unknown>)['groupConfigs'];
    if (isObject(rawGroupConfigs)) {
        out.groupConfigs = {};
        for (const groupId of Object.keys(rawGroupConfigs as Record<string, unknown>)) {
            const groupConfig = (rawGroupConfigs as Record<string, unknown>)[groupId];
            if (isObject(groupConfig)) {
                const cfg: GroupBilibiliConfig = {};
                if (typeof (groupConfig as Record<string, unknown>)['enabled'] === 'boolean') {
                    cfg.enabled = (groupConfig as Record<string, unknown>)['enabled'] as boolean;
                }
                out.groupConfigs![groupId] = cfg;
            }
        }
    }

    return out;
}

/**
 * 插件全局状态类
 * 封装配置、日志、上下文等，提供统一的状态管理接口
 */
class PluginState {
    /** 日志器 */
    logger: PluginLogger | null = null;
    /** NapCat actions 对象，用于调用 API */
    actions: ActionMap | undefined;
    /** 适配器名称 */
    adapterName: string = '';
    /** 网络配置 */
    networkConfig: NetworkAdapterConfig | null = null;
    /** 插件配置 */
    config: PluginConfig = { ...DEFAULT_CONFIG };
    /** 配置文件路径 */
    configPath: string = '';
    /** 数据目录路径 */
    dataPath: string = '';
    /** 插件名称 */
    pluginName: string = '';
    /** 插件启动时间戳 */
    startTime: number = 0;
    /** 是否已初始化 */
    initialized: boolean = false;
    /** 调试模式 */
    debug: boolean = false;

    /**
     * 通用日志方法
     */
    log(level: 'info' | 'warn' | 'error', msg: string, ...args: unknown[]): void {
        if (!this.logger) return;
        this.logger[level](`${LOG_TAG} ${msg}`, ...args);
    }

    /**
     * 调试日志
     */
    logDebug(msg: string, ...args: unknown[]): void {
        if (this.logger?.debug) {
            this.logger.debug(`${LOG_TAG} ${msg}`, ...args);
        }
    }

    /**
     * 调用 OneBot API
     * @param api API 名称
     * @param params 参数
     * @returns API 返回结果
     */
    async callApi(api: string, params: Record<string, unknown>): Promise<any> {
        if (!this.actions) {
            this.log('error', `调用 API ${api} 失败: actions 未初始化`);
            return null;
        }
        try {
            // 必须传递 adapterName 和 networkConfig
            const result = await (this.actions as any).call(api, params, this.adapterName, this.networkConfig);
            return result;
        } catch (error) {
            this.log('error', `调用 API ${api} 失败:`, error);
            throw error;
        }
    }

    /**
     * 从 ctx 初始化状态
     */
    initFromContext(ctx: NapCatPluginContext): void {
        this.logger = ctx.logger;
        this.actions = ctx.actions;
        this.adapterName = ctx.adapterName || '';
        this.networkConfig = ctx.pluginManager?.config || null;
        this.configPath = ctx.configPath || '';
        this.pluginName = ctx.pluginName || '';
        this.dataPath = ctx.configPath ? path.dirname(ctx.configPath) : path.join(process.cwd(), 'data', 'napcat-plugin-bilibili');
        this.startTime = Date.now();
    }

    /**
     * 获取运行时长（毫秒）
     */
    getUptime(): number {
        return Date.now() - this.startTime;
    }

    /**
     * 获取格式化的运行时长
     */
    getUptimeFormatted(): string {
        const uptime = this.getUptime();
        const seconds = Math.floor(uptime / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}天${hours % 24}小时`;
        if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
        if (minutes > 0) return `${minutes}分钟${seconds % 60}秒`;
        return `${seconds}秒`;
    }

    /**
     * 加载配置
     */
    loadConfig(ctx?: NapCatPluginContext): void {
        const configPath = ctx?.configPath || this.configPath;
        try {
            if (typeof configPath === 'string' && fs.existsSync(configPath)) {
                const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                this.config = { ...getDefaultConfig(), ...sanitizeConfig(raw) };
                this.logDebug('📄 已加载本地配置', { path: configPath });
            } else {
                this.config = getDefaultConfig();
                this.saveConfig(ctx);
                this.logDebug('📄 配置文件不存在，已创建默认配置', { path: configPath });
            }
        } catch (error) {
            this.log('error', '❌ 加载配置失败，使用默认配置:', error);
            this.config = getDefaultConfig();
        }
        this.initialized = true;
    }

    /**
     * 保存配置
     */
    saveConfig(ctx?: NapCatPluginContext, config?: PluginConfig): void {
        const configPath = ctx?.configPath || this.configPath;
        const configToSave = config || this.config;
        try {
            const configDir = path.dirname(String(configPath || './'));
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(
                String(configPath || path.join(configDir, 'config.json')),
                JSON.stringify(configToSave, null, 2),
                'utf-8'
            );
            this.config = { ...configToSave };
            this.logDebug('💾 配置已保存', { path: configPath });
        } catch (error) {
            this.log('error', '❌ 保存配置失败:', error);
        }
    }

    /**
     * 获取当前配置的副本
     */
    getConfig(): PluginConfig {
        return { ...this.config };
    }

    /**
     * 合并并设置配置
     */
    setConfig(ctx: NapCatPluginContext | undefined, partialConfig: Partial<PluginConfig>): void {
        this.config = { ...this.config, ...partialConfig } as PluginConfig;
        if (ctx) this.saveConfig(ctx);
    }

    /**
     * 获取群配置
     */
    getGroupConfig(groupId: string): GroupBilibiliConfig {
        return this.config.groupConfigs?.[groupId] || { enabled: true };
    }

    /**
     * 检查某个群是否启用了 B 站解析
     */
    isGroupEnabled(groupId: string): boolean {
        // 首先检查全局开关
        if (!this.config.enabled) return false;
        // 然后检查群配置，默认为启用
        const groupCfg = this.config.groupConfigs?.[groupId];
        return groupCfg?.enabled !== false;
    }

    /**
     * 更新群配置
     */
    updateGroupConfig(ctx: NapCatPluginContext | undefined, groupId: string, partialCfg: Partial<GroupBilibiliConfig>): void {
        const groupConfigs = { ...(this.config.groupConfigs || {}) };
        groupConfigs[groupId] = { ...groupConfigs[groupId], ...partialCfg };
        this.setConfig(ctx, { groupConfigs });
    }
}

/** 导出单例状态对象 */
export const pluginState = new PluginState();

// ==================== 兼容旧 API ====================

/** @deprecated 请使用 pluginState.config */
export let currentConfig: PluginConfig = pluginState.config;

/** @deprecated 请使用 pluginState.loadConfig() */
export function loadConfig(ctx: NapCatPluginContext) {
    pluginState.initFromContext(ctx);
    pluginState.loadConfig(ctx);
    currentConfig = pluginState.config;
}

/** @deprecated 请使用 pluginState.saveConfig() */
export function saveConfig(ctx: NapCatPluginContext, config: PluginConfig) {
    pluginState.saveConfig(ctx, config);
    currentConfig = pluginState.config;
}

/** @deprecated 请使用 pluginState.getConfig() */
export function getConfig(): PluginConfig {
    return pluginState.getConfig();
}

/** @deprecated 请使用 pluginState.setConfig() */
export function setConfig(ctx: NapCatPluginContext | undefined, config: Partial<PluginConfig>) {
    pluginState.setConfig(ctx, config);
    currentConfig = pluginState.config;
}
