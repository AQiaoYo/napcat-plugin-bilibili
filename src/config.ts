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
                <p style="margin: 8px 0 0; color: #075985; font-size: 14px;">本插件的详细配置已移动到独立的 WebUI 仪表盘中。</p>
                <p style="margin: 12px 0 0;">
                    <a href="/webui/bilibili" target="_blank" style="display: inline-block; padding: 6px 12px; background: #0ea5e9; color: white; border-radius: 4px; text-decoration: none; font-size: 14px;">打开控制台</a>
                </p>
            </div>
        `)
    );

    return schema;
}

export function getDefaultConfig(): PluginConfig {
    return { ...DEFAULT_CONFIG };
}
