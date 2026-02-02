/**
 * Puppeteer 渲染服务
 * 通过 HTTP API 调用 napcat-plugin-puppeteer 插件进行截图渲染
 */

import fs from 'fs';
import path from 'path';
import { pluginState } from '../core/state';
import type { BilibiliVideoInfo } from '../types';
import { formatNumber, formatDuration } from './bilibili-service';

/** Puppeteer 插件 API 基础路径 */
const PUPPETEER_API_BASE = '/plugin/napcat-plugin-puppeteer/api';

/** 渲染结果接口 */
export interface RenderResult {
    /** 是否成功 */
    success: boolean;
    /** Base64 图片数据 (成功时) */
    imageBase64?: string;
    /** 错误信息 (失败时) */
    error?: string;
}

/** Puppeteer 状态接口 */
interface PuppeteerStatus {
    enabled: boolean;
    browser: {
        connected: boolean;
    };
}

/**
 * 获取 NapCat WebUI 的基础 URL
 * 从插件上下文中获取 WebUI 配置
 */
function getWebUIBaseUrl(): string {
    // 默认使用本地地址
    const config = pluginState.config.puppeteer;
    if (config?.webUIUrl) {
        return config.webUIUrl.replace(/\/$/, '');
    }
    // 默认 NapCat WebUI 地址
    return 'http://127.0.0.1:6099';
}

/**
 * 检查 Puppeteer 插件是否可用
 * @returns 是否可用
 */
export async function isPuppeteerAvailable(): Promise<boolean> {
    // 检查配置是否启用
    const puppeteerConfig = pluginState.config.puppeteer;
    pluginState.logDebug(`isPuppeteerAvailable: 检查配置 - enabled=${puppeteerConfig?.enabled}, webUIUrl=${puppeteerConfig?.webUIUrl}`);

    if (!puppeteerConfig?.enabled) {
        pluginState.logDebug('isPuppeteerAvailable: Puppeteer 渲染未启用');
        return false;
    }

    try {
        const baseUrl = getWebUIBaseUrl();
        const url = `${baseUrl}${PUPPETEER_API_BASE}/status`;

        pluginState.logDebug(`isPuppeteerAvailable: 检查 Puppeteer 状态 URL: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(5000), // 5秒超时
        });

        pluginState.logDebug(`isPuppeteerAvailable: HTTP 响应状态 ${response.status}`);

        if (!response.ok) {
            pluginState.logDebug(`isPuppeteerAvailable: Puppeteer 状态检查失败: HTTP ${response.status}`);
            return false;
        }

        const data = await response.json() as { code: number; data?: PuppeteerStatus };
        pluginState.logDebug(`isPuppeteerAvailable: 响应数据 - code=${data.code}, data=${JSON.stringify(data.data)}`);

        if (data.code !== 0) {
            pluginState.logDebug(`isPuppeteerAvailable: Puppeteer 状态检查失败: code=${data.code}`);
            return false;
        }

        const status = data.data;
        const available = !!(status?.enabled && status?.browser?.connected);

        pluginState.logDebug(`isPuppeteerAvailable: Puppeteer 可用状态: ${available} (enabled=${status?.enabled}, connected=${status?.browser?.connected})`);
        return available;
    } catch (error) {
        pluginState.logDebug(`isPuppeteerAvailable: Puppeteer 状态检查异常: ${error}`);
        return false;
    }
}

/**
 * 获取插件根目录路径
 * 插件运行时路径类似: D:\NapCat.Shell\plugins\napcat-plugin-bilibili
 * @returns 插件根目录路径
 */
function getPluginRootPath(): string {
    // dataPath 通常是 configPath 的目录，即 plugins/napcat-plugin-bilibili/data
    // 我们需要获取插件根目录，即 plugins/napcat-plugin-bilibili
    if (pluginState.dataPath) {
        // dataPath 可能是 .../napcat-plugin-bilibili/data 或 .../napcat-plugin-bilibili
        const dataPath = pluginState.dataPath;
        if (dataPath.endsWith('data') || dataPath.endsWith('data/') || dataPath.endsWith('data\\')) {
            return path.dirname(dataPath);
        }
        // 检查是否已经是插件根目录
        if (fs.existsSync(path.join(dataPath, 'templates'))) {
            return dataPath;
        }
        // 向上查找
        return path.dirname(dataPath);
    }
    // 回退到默认路径
    return path.join(process.cwd(), 'plugins', 'napcat-plugin-bilibili');
}

/**
 * 读取 HTML 模板文件
 * @param templateName 模板名称
 * @returns 模板内容
 */
function loadTemplate(templateName: string): string | null {
    try {
        const pluginRoot = getPluginRootPath();

        // 尝试从多个可能的路径读取模板
        const templatePaths = [
            // 插件根目录下的 templates
            path.join(pluginRoot, 'templates', templateName),
            // NapCat 标准插件路径
            path.join(process.cwd(), 'plugins', 'napcat-plugin-bilibili', 'templates', templateName),
            // 开发环境路径
            path.join(process.cwd(), 'templates', templateName),
        ];

        pluginState.logDebug(`查找模板 ${templateName}，插件根目录: ${pluginRoot}`);

        for (const templatePath of templatePaths) {
            pluginState.logDebug(`尝试路径: ${templatePath}`);
            if (fs.existsSync(templatePath)) {
                pluginState.logDebug(`加载模板成功: ${templatePath}`);
                return fs.readFileSync(templatePath, 'utf-8');
            }
        }

        pluginState.log('warn', `模板文件不存在: ${templateName}，已尝试路径: ${templatePaths.join(', ')}`);
        return null;
    } catch (error) {
        pluginState.log('error', `读取模板失败: ${templateName}`, error);
        return null;
    }
}

/**
 * 构建视频卡片的模板数据
 * @param videoInfo 视频信息
 * @returns 模板数据对象
 */
function buildTemplateData(videoInfo: BilibiliVideoInfo): Record<string, string> {
    const duration = formatDuration(videoInfo.duration);
    const view = formatNumber(videoInfo.stat.view);
    const danmaku = formatNumber(videoInfo.stat.danmaku);
    const like = formatNumber(videoInfo.stat.like);
    const coin = formatNumber(videoInfo.stat.coin);
    const favorite = formatNumber(videoInfo.stat.favorite);
    const share = formatNumber(videoInfo.stat.share);
    const reply = formatNumber(videoInfo.stat.reply);

    // 格式化发布时间
    const pubDate = new Date(videoInfo.pubdate * 1000);
    const pubDateStr = `${pubDate.getFullYear()}-${String(pubDate.getMonth() + 1).padStart(2, '0')}-${String(pubDate.getDate()).padStart(2, '0')}`;

    return {
        title: videoInfo.title,
        cover: videoInfo.pic,
        bvid: videoInfo.bvid,
        aid: String(videoInfo.aid),
        duration: duration,
        view: view,
        danmaku: danmaku,
        like: like,
        coin: coin,
        favorite: favorite,
        share: share,
        reply: reply,
        ownerName: videoInfo.owner.name,
        ownerFace: videoInfo.owner.face,
        ownerMid: String(videoInfo.owner.mid),
        tname: videoInfo.tname,
        desc: videoInfo.desc || '暂无简介',
        pubdate: pubDateStr,
        url: `https://www.bilibili.com/video/${videoInfo.bvid}`,
    };
}

/**
 * 简单的模板替换
 * 将 {{key}} 替换为对应的值
 * @param template 模板字符串
 * @param data 数据对象
 * @returns 替换后的字符串
 */
function renderTemplate(template: string, data: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
    });
}

/**
 * 使用 Puppeteer 渲染视频信息卡片
 * @param videoInfo 视频信息
 * @returns 渲染结果
 */
export async function renderVideoCard(videoInfo: BilibiliVideoInfo): Promise<RenderResult> {
    try {
        // 加载模板
        const template = loadTemplate('video-card.html');
        if (!template) {
            return { success: false, error: '模板文件不存在' };
        }

        // 构建模板数据并渲染
        const templateData = buildTemplateData(videoInfo);
        const htmlContent = renderTemplate(template, templateData);

        pluginState.logDebug(`渲染视频卡片: ${videoInfo.title}`);

        // 调用 Puppeteer API 进行截图
        const baseUrl = getWebUIBaseUrl();
        const url = `${baseUrl}${PUPPETEER_API_BASE}/render`;

        const requestBody = {
            html: htmlContent,
            selector: '.video-card',
            type: 'png',
            encoding: 'base64',
            omitBackground: false,
            setViewport: {
                width: 800,
                height: 600,
                deviceScaleFactor: 2,
            },
            waitForTimeout: 100,
        };

        pluginState.logDebug(`请求 Puppeteer 渲染: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(30000), // 30秒超时
        });

        if (!response.ok) {
            const errorText = await response.text();
            pluginState.log('error', `Puppeteer 渲染请求失败: HTTP ${response.status}`, errorText);
            return { success: false, error: `HTTP ${response.status}: ${errorText}` };
        }

        const data = await response.json() as { code: number; data?: string; message?: string };

        if (data.code !== 0) {
            pluginState.log('error', `Puppeteer 渲染失败: ${data.message}`);
            return { success: false, error: data.message || '渲染失败' };
        }

        if (!data.data) {
            return { success: false, error: '渲染结果为空' };
        }

        pluginState.logDebug(`视频卡片渲染成功: ${videoInfo.bvid}`);
        return { success: true, imageBase64: data.data };
    } catch (error) {
        pluginState.log('error', 'Puppeteer 渲染异常:', error);
        return { success: false, error: String(error) };
    }
}

/**
 * 构建使用渲染图片的消息
 * @param imageBase64 Base64 图片数据
 * @param videoInfo 视频信息（用于添加链接）
 * @returns 消息内容数组
 */
export function buildRenderedImageMessage(
    imageBase64: string,
    videoInfo: BilibiliVideoInfo
): Array<{ type: string; data: any }> {
    const messages: Array<{ type: string; data: any }> = [];

    // 渲染的图片
    messages.push({
        type: 'image',
        data: { file: `base64://${imageBase64}` }
    });

    // 视频链接（方便点击跳转）
    messages.push({
        type: 'text',
        data: { text: `🔗 https://www.bilibili.com/video/${videoInfo.bvid}` }
    });

    return messages;
}
