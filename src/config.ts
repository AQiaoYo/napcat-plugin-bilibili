/**
 * 插件配置模块
 * 定义默认配置和 WebUI 配置 Schema
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { PluginConfig } from './types';

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    sendMode: 'with-video',
    maxVideoSizeMB: 100,
    parseCacheTTL: 300, // 默认 5 分钟
    groupConfigs: {}
};

/**
 * 初始化 WebUI 配置 Schema
 * 使用 NapCat 提供的构建器生成配置界面
 */
export function initConfigUI(ctx: NapCatPluginContext) {
    const schema = ctx.NapCatConfig.combine(
        ctx.NapCatConfig.html(`
            <div style="padding: 16px; background: #e0f2fe; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0ea5e9;">
                <h3 style="margin: 0; color: #0c4a6e;">📺 B站视频链接解析</h3>
                <p style="margin: 8px 0 0; color: #075985; font-size: 14px;">启用后，插件将自动解析群消息中的 B 站视频链接，并以合并转发消息发送到群里。</p>
                <p style="margin: 6px 0 0; color: #0369a1; font-size: 12px;">💡 支持解析 BV号、AV号、短链接 (b23.tv) 等格式。</p>
            </div>
        `),
        // 全局开关
        ctx.NapCatConfig.boolean('enabled', '启用B站链接解析', DEFAULT_CONFIG.enabled, '开启后插件会自动解析群消息中的 B 站视频链接', true),
        // 发送模式
        ctx.NapCatConfig.select('sendMode', '发送模式', [
            { label: '仅发送信息卡片', value: 'info-only' },
            { label: '发送信息卡片 + 视频', value: 'with-video' }
        ], DEFAULT_CONFIG.sendMode, '选择发送视频信息还是同时发送视频文件', true),
        // 最大视频大小
        ctx.NapCatConfig.number('maxVideoSizeMB', '最大视频大小 (MB)', DEFAULT_CONFIG.maxVideoSizeMB, '超过此大小的视频将不会下载，仅发送信息卡片', true),
        // 解析缓存过期时间
        ctx.NapCatConfig.number('parseCacheTTL', '解析去重时间 (秒)', DEFAULT_CONFIG.parseCacheTTL, '同一群内相同链接在此时间内不会重复解析，设为 0 禁用去重', true)
    );

    return schema;
}

export function getDefaultConfig(): PluginConfig {
    return { ...DEFAULT_CONFIG };
}
