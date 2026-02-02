/**
 * 插件配置模块
 * 定义默认配置和 WebUI 配置 Schema
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { PluginConfig } from './types';

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    debug: false,
    sendMode: 'with-video',
    maxVideoSizeMB: 100,
    parseCacheTTL: 300, // 默认 5 分钟
    groupConfigs: {},
    puppeteer: {
        enabled: false,
        webUIUrl: 'http://127.0.0.1:6099',
    },
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
        // 调试模式
        ctx.NapCatConfig.boolean('debug', '调试模式', DEFAULT_CONFIG.debug, '启用后输出详细的调试日志，方便排查问题', true),
        // 发送模式
        ctx.NapCatConfig.select('sendMode', '发送模式', [
            { label: '仅发送信息卡片', value: 'info-only' },
            { label: '发送信息卡片 + 视频', value: 'with-video' }
        ], DEFAULT_CONFIG.sendMode, '选择发送视频信息还是同时发送视频文件', true),
        // 最大视频大小
        ctx.NapCatConfig.number('maxVideoSizeMB', '最大视频大小 (MB)', DEFAULT_CONFIG.maxVideoSizeMB, '超过此大小的视频将不会下载，仅发送信息卡片', true),
        // 解析缓存过期时间
        ctx.NapCatConfig.number('parseCacheTTL', '解析去重时间 (秒)', DEFAULT_CONFIG.parseCacheTTL, '同一群内相同链接在此时间内不会重复解析，设为 0 禁用去重', true),
        // Puppeteer 渲染配置
        ctx.NapCatConfig.html(`
            <div style="padding: 12px; background: #fef3c7; border-radius: 8px; margin: 20px 0 12px; border-left: 4px solid #f59e0b;">
                <h4 style="margin: 0; color: #92400e;">🎨 Puppeteer 图片渲染</h4>
                <p style="margin: 6px 0 0; color: #a16207; font-size: 13px;">启用后将使用 HTML 模板渲染精美的视频信息卡片图片。</p>
                <p style="margin: 4px 0 0; color: #b45309; font-size: 12px;">⚠️ 需要安装并启用 napcat-plugin-puppeteer 插件。</p>
            </div>
        `),
        ctx.NapCatConfig.boolean('puppeteer.enabled', '启用图片渲染', DEFAULT_CONFIG.puppeteer?.enabled ?? false, '使用 Puppeteer 渲染视频信息卡片为图片（需要 napcat-plugin-puppeteer 插件）', true),
        ctx.NapCatConfig.text('puppeteer.webUIUrl', 'WebUI 地址', DEFAULT_CONFIG.puppeteer?.webUIUrl ?? 'http://127.0.0.1:6099', 'NapCat WebUI 地址，用于调用 Puppeteer API', true)
    );

    return schema;
}

export function getDefaultConfig(): PluginConfig {
    return { ...DEFAULT_CONFIG };
}
