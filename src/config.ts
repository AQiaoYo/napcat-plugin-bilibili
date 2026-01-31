/**
 * 插件配置模块
 * 定义默认配置和 WebUI 配置 Schema
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { PluginConfig } from './types';

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    // 定时任务默认配置
    globalCron: '0 8 * * *', // 每天早上8点
    inactiveDays: 30, // 默认30天未发言视为不活跃
    dryRun: true, // 默认试运行模式，不实际踢人
    groupConfigs: {},
    cleanupStats: {
        totalCleanups: 0,
        totalKicked: 0,
        groupStats: {}
    }
};

/**
 * 初始化 WebUI 配置 Schema
 * 使用 NapCat 提供的构建器生成配置界面
 */
export function initConfigUI(ctx: NapCatPluginContext) {
    const schema = ctx.NapCatConfig.combine(
        ctx.NapCatConfig.html(`
            <div style="padding: 16px; background: #fdf2f8; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ec4899;">
                <h3 style="margin: 0; color: #831843;">🧹 自动清理不活跃群成员</h3>
                <p style="margin: 8px 0 0; color: #9d174d; font-size: 14px;">启用后，插件将定期扫描群成员并移除长期不活跃的"鱼干"成员。</p>
                <p style="margin: 6px 0 0; color: #be185d; font-size: 12px;">⚠️ 请确保机器人有管理员权限；建议先开启"试运行模式"进行测试。</p>
            </div>
        `),
        // 全局开关
        ctx.NapCatConfig.boolean('enabled', '启用自动清理', DEFAULT_CONFIG.enabled, '开启后插件会按计划扫描并清理长期不活跃的群成员', true),

        // 全局定时任务配置
        ctx.NapCatConfig.html(`
            <div style="padding: 12px; background: #fce7f3; border-radius: 6px; margin: 16px 0; border-left: 4px solid #f472b6;">
                <h4 style="margin: 0 0 8px; color: #9d174d;">⏰ 清理计划配置</h4>
                <p style="margin: 0; color: #be185d; font-size: 13px;">配置自动清理不活跃成员的计划任务</p>
            </div>
        `),
        ctx.NapCatConfig.text('globalCron', '全局Cron表达式', DEFAULT_CONFIG.globalCron, 'cron表达式，格式：秒 分 时 日 月 周（例如：0 8 * * * 表示每天早上8点）', true),
        ctx.NapCatConfig.number('inactiveDays', '默认不活跃天数', DEFAULT_CONFIG.inactiveDays, '成员多少天未发言视为不活跃"鱼干"（可被群单独配置覆盖）', true),
        ctx.NapCatConfig.boolean('dryRun', '试运行模式', DEFAULT_CONFIG.dryRun, '开启后只统计不活跃成员，不实际踢人（建议首次使用时开启）', true)
    );

    return schema;
}

export function getDefaultConfig(): PluginConfig {
    return { ...DEFAULT_CONFIG };
}
