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
import type { PluginConfig, GroupCronConfig, CleanupStats } from '../types';

/** 日志前缀 */
const LOG_TAG = '[AutoClear]';

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

    // globalCron
    if (typeof (raw as Record<string, unknown>)['globalCron'] === 'string') {
        out.globalCron = (raw as Record<string, unknown>)['globalCron'] as string;
    }

    // inactiveDays
    if (typeof (raw as Record<string, unknown>)['inactiveDays'] === 'number') {
        out.inactiveDays = (raw as Record<string, unknown>)['inactiveDays'] as number;
    }

    // dryRun
    if (typeof (raw as Record<string, unknown>)['dryRun'] === 'boolean') {
        out.dryRun = (raw as Record<string, unknown>)['dryRun'] as boolean;
    }

    // groupConfigs
    const rawGroupConfigs = (raw as Record<string, unknown>)['groupConfigs'];
    if (isObject(rawGroupConfigs)) {
        out.groupConfigs = {};
        for (const groupId of Object.keys(rawGroupConfigs as Record<string, unknown>)) {
            const groupConfig = (rawGroupConfigs as Record<string, unknown>)[groupId];
            if (isObject(groupConfig)) {
                const cfg: GroupCronConfig = {};
                if (typeof (groupConfig as Record<string, unknown>)['enabled'] === 'boolean') {
                    cfg.enabled = (groupConfig as Record<string, unknown>)['enabled'] as boolean;
                }
                if (typeof (groupConfig as Record<string, unknown>)['cron'] === 'string') {
                    cfg.cron = (groupConfig as Record<string, unknown>)['cron'] as string;
                }
                if (typeof (groupConfig as Record<string, unknown>)['inactiveDays'] === 'number') {
                    cfg.inactiveDays = (groupConfig as Record<string, unknown>)['inactiveDays'] as number;
                }
                if (typeof (groupConfig as Record<string, unknown>)['dryRun'] === 'boolean') {
                    cfg.dryRun = (groupConfig as Record<string, unknown>)['dryRun'] as boolean;
                }
                if (Array.isArray((groupConfig as Record<string, unknown>)['protectedMembers'])) {
                    cfg.protectedMembers = ((groupConfig as Record<string, unknown>)['protectedMembers'] as unknown[])
                        .filter(v => typeof v === 'string') as string[];
                }
                if (typeof (groupConfig as Record<string, unknown>)['lastCleanup'] === 'number') {
                    cfg.lastCleanup = (groupConfig as Record<string, unknown>)['lastCleanup'] as number;
                }
                if (typeof (groupConfig as Record<string, unknown>)['lastCleanupCount'] === 'number') {
                    cfg.lastCleanupCount = (groupConfig as Record<string, unknown>)['lastCleanupCount'] as number;
                }
                out.groupConfigs![groupId] = cfg;
            }
        }
    }

    // cleanupStats
    const rawStats = (raw as Record<string, unknown>)['cleanupStats'];
    if (isObject(rawStats)) {
        out.cleanupStats = {
            totalCleanups: typeof rawStats['totalCleanups'] === 'number' ? rawStats['totalCleanups'] as number : 0,
            totalKicked: typeof rawStats['totalKicked'] === 'number' ? rawStats['totalKicked'] as number : 0,
            lastCleanupTime: typeof rawStats['lastCleanupTime'] === 'number' ? rawStats['lastCleanupTime'] as number : undefined,
            groupStats: isObject(rawStats['groupStats']) ? rawStats['groupStats'] as CleanupStats['groupStats'] : {}
        };
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
     * 从 ctx 初始化状态
     */
    initFromContext(ctx: NapCatPluginContext): void {
        this.logger = ctx.logger;
        this.actions = ctx.actions;
        this.adapterName = ctx.adapterName || '';
        this.networkConfig = ctx.pluginManager?.config || null;
        this.configPath = ctx.configPath || '';
        this.pluginName = ctx.pluginName || '';
        this.dataPath = ctx.configPath ? path.dirname(ctx.configPath) : path.join(process.cwd(), 'data', 'napcat-plugin-auto-clear');
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
     * 获取群配置（优先使用群单独配置，否则使用全局配置）
     */
    getGroupConfig(groupId: string): GroupCronConfig & { inactiveDays: number; dryRun: boolean } {
        const groupCfg = this.config.groupConfigs?.[groupId] || {};
        return {
            ...groupCfg,
            inactiveDays: groupCfg.inactiveDays ?? this.config.inactiveDays ?? 30,
            dryRun: groupCfg.dryRun ?? this.config.dryRun ?? true,
        };
    }

    /**
     * 更新群配置
     */
    updateGroupConfig(ctx: NapCatPluginContext | undefined, groupId: string, partialCfg: Partial<GroupCronConfig>): void {
        const groupConfigs = { ...(this.config.groupConfigs || {}) };
        groupConfigs[groupId] = { ...groupConfigs[groupId], ...partialCfg };
        this.setConfig(ctx, { groupConfigs });
    }
}

/** 导出单例状态对象 */
export const pluginState = new PluginState();

// ==================== 兼容旧 API ====================
// 以下导出是为了兼容现有代码，建议逐步迁移到使用 pluginState

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
