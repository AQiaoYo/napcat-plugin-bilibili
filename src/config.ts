/**
 * 插件配置模块
 * 定义默认配置和 WebUI 配置 Schema
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { PluginConfig } from './types';

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
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
                <p style="margin: 8px 0 0; color: #075985; font-size: 14px;">启用后，插件将自动解析群消息中的 B 站视频链接，并发送视频信息卡片到群里。</p>
                <p style="margin: 6px 0 0; color: #0369a1; font-size: 12px;">💡 支持解析 BV号、AV号、短链接 (b23.tv) 等格式。</p>
            </div>
        `),
        // 全局开关
        ctx.NapCatConfig.boolean('enabled', '启用B站链接解析', DEFAULT_CONFIG.enabled, '开启后插件会自动解析群消息中的 B 站视频链接', true)
    );

    return schema;
}

export function getDefaultConfig(): PluginConfig {
    return { ...DEFAULT_CONFIG };
}
