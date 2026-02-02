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
            <div style="padding: 20px; background: #FFF5F7; border-radius: 12px; margin-bottom: 20px; border: 1px solid #FFE4E9; display: flex; align-items: center; gap: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <div style="width: 48px; height: 48px; border-radius: 10px; background: #FB7299; display: flex; align-items: center; justify-content: center; flex-shrink: 0; shadow: 0 4px 12px rgba(251, 114, 153, 0.2);">
                    <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="6" y="14" width="36" height="26" rx="2" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M16 14C16 14 19.3333 10 24 10C28.6667 10 32 14 32 14" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                        <circle cx="18" cy="24" r="2" fill="white"/>
                        <circle cx="30" cy="24" r="2" fill="white"/>
                    </svg>
                </div>
                <div style="flex: 1;">
                    <h3 style="margin: 0; color: #18191C; font-size: 16px; font-weight: bold;">B站视频解析</h3>
                    <p style="margin: 4px 0 0; color: #61666D; font-size: 13px; line-height: 1.5;">
                        配置已由独立的控制台管理。请点击侧边栏中的 
                        <span style="color: #FB7299; font-weight: bold; background: #FFE4E9; padding: 2px 6px; border-radius: 4px; margin: 0 2px;">扩展页面</span> 
                        菜单进入仪表盘。
                    </p>
                </div>
            </div>
        `)
    );

    return schema;
}

export function getDefaultConfig(): PluginConfig {
    return { ...DEFAULT_CONFIG };
}
