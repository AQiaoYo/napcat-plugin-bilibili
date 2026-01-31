/**
 * 类型定义文件
 * 定义插件所有的接口和类型
 */

import type { PluginConfigSchema, PluginConfigUIController } from 'napcat-types/napcat-onebot/network/plugin-manger';

/**
 * 插件主配置接口
 */
export interface PluginConfig {
    /** 全局开关：是否启用自动清理功能 */
    enabled: boolean;
    /** 全局 cron 表达式，默认每天早上8点 */
    globalCron?: string;
    /** 默认不活跃天数（多少天未发言视为不活跃） */
    inactiveDays?: number;
    /** 试运行模式，只统计不实际踢人 */
    dryRun?: boolean;
    /** 按群的单独配置 */
    groupConfigs?: Record<string, GroupCronConfig>;
    /** 清理统计数据 */
    cleanupStats?: CleanupStats;
}

/**
 * 群定时任务配置
 */
export interface GroupCronConfig {
    /** 是否启用此群的定时清理 */
    enabled?: boolean;
    /** cron 表达式，为空则使用全局配置 */
    cron?: string;
    /** 判定为不活跃的天数，为空则使用全局配置 */
    inactiveDays?: number;
    /** 受保护的成员 QQ 号列表（白名单，不会被踢） */
    protectedMembers?: string[];
    /** 试运行模式，为空则使用全局配置 */
    dryRun?: boolean;
    /** 上次清理时间戳 */
    lastCleanup?: number;
    /** 上次清理人数 */
    lastCleanupCount?: number;
}

/**
 * 清理结果
 */
export interface CleanupResult {
    groupId: string;
    groupName: string;
    totalMembers: number;
    inactiveMembers: number;
    kickedMembers: number;
    kickedList: KickedMember[];
    failedList: FailedKick[];
    dryRun: boolean;
    timestamp: number;
}

/**
 * 被踢出的成员信息
 */
export interface KickedMember {
    userId: string;
    nickname: string;
    lastSpeakTime: number;
    inactiveDays: number;
}

/**
 * 踢人失败记录
 */
export interface FailedKick {
    userId: string;
    nickname: string;
    reason: string;
}

/**
 * 清理统计汇总
 */
export interface CleanupStats {
    totalCleanups: number;
    totalKicked: number;
    lastCleanupTime?: number;
    groupStats?: Record<string, GroupCleanupStats>;
}

/**
 * 群清理统计
 */
export interface GroupCleanupStats {
    totalCleanups: number;
    totalKicked: number;
    lastCleanupTime?: number;
    lastCleanupCount?: number;
}

/** 框架配置 UI Schema 变量，NapCat WebUI 会读取此导出 */
export let plugin_config_ui: PluginConfigSchema = [];

export type { PluginConfigSchema, PluginConfigUIController };
