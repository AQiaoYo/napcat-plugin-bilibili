/**
 * B站视频解析服务
 * 提供 B 站链接解析和视频信息获取功能
 */

import { pluginState } from '../core/state';
import type { BilibiliVideoInfo, BilibiliApiResponse } from '../types';

// ==================== 正则表达式 ====================

/** BV 号正则 */
const BILI_BV_PATTERN = /\bBV[0-9A-Za-z]{10}\b/i;

/** AV 号正则 */
const BILI_AV_PATTERN = /\bav(\d+)\b/i;

/** B 站视频完整链接正则 */
const BILI_VIDEO_URL_PATTERN = /https?:\/\/(?:(?:www|m)\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i;

/** B 站短链接正则 */
const BILI_SHORT_LINK_PATTERN = /https?:\/\/(?:b23\.tv|bili2233\.cn)\/[A-Za-z\d._?%&+\-=\/#]+/i;

/** 综合匹配正则（用于检测消息中是否包含 B 站链接） */
const BILI_MESSAGE_PATTERN = new RegExp(
    `(?:${BILI_VIDEO_URL_PATTERN.source}|${BILI_SHORT_LINK_PATTERN.source}|${BILI_BV_PATTERN.source}|${BILI_AV_PATTERN.source})`,
    'i'
);

// ==================== API 接口 ====================

/** B 站视频信息 API */
const BILIBILI_VIDEO_INFO_API = 'https://api.bilibili.com/x/web-interface/view';

// ==================== 工具函数 ====================

/**
 * 格式化播放量数字
 * @param num 数字
 * @returns 格式化后的字符串
 */
export function formatNumber(num: number): string {
    if (num >= 100000000) {
        return (num / 100000000).toFixed(1) + '亿';
    }
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
}

/**
 * 格式化时长
 * @param seconds 秒数
 * @returns 格式化后的时长字符串
 */
export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ==================== 链接解析 ====================

/**
 * 检测消息中是否包含 B 站链接
 * @param text 消息文本
 * @returns 是否包含 B 站链接
 */
export function containsBilibiliLink(text: string): boolean {
    return BILI_MESSAGE_PATTERN.test(text);
}

/**
 * 从消息中提取 BV 号
 * @param text 消息文本
 * @returns BV 号或 null
 */
export function extractBvid(text: string): string | null {
    // 先尝试从完整 URL 提取
    const urlMatch = text.match(BILI_VIDEO_URL_PATTERN);
    if (urlMatch) {
        const id = urlMatch[1];
        if (id.toLowerCase().startsWith('bv')) {
            return 'BV' + id.slice(2); // 规范化为 BV 开头
        }
    }

    // 尝试匹配独立的 BV 号
    const bvMatch = text.match(BILI_BV_PATTERN);
    if (bvMatch) {
        return 'BV' + bvMatch[0].slice(2);
    }

    return null;
}

/**
 * 从消息中提取 AV 号
 * @param text 消息文本
 * @returns AV 号或 null
 */
export function extractAvid(text: string): number | null {
    // 先尝试从完整 URL 提取
    const urlMatch = text.match(BILI_VIDEO_URL_PATTERN);
    if (urlMatch) {
        const id = urlMatch[1];
        if (id.toLowerCase().startsWith('av')) {
            return parseInt(id.slice(2), 10);
        }
    }

    // 尝试匹配独立的 AV 号
    const avMatch = text.match(BILI_AV_PATTERN);
    if (avMatch) {
        return parseInt(avMatch[1], 10);
    }

    return null;
}

/**
 * 从消息中提取短链接
 * @param text 消息文本
 * @returns 短链接或 null
 */
export function extractShortLink(text: string): string | null {
    const match = text.match(BILI_SHORT_LINK_PATTERN);
    return match ? match[0] : null;
}

/**
 * 解析短链接获取真实 URL
 * @param shortUrl 短链接
 * @returns 真实 URL 或 null
 */
export async function resolveShortUrl(shortUrl: string): Promise<string | null> {
    try {
        pluginState.logDebug(`解析短链接: ${shortUrl}`);

        // 使用 HEAD 请求获取重定向后的 URL
        const response = await fetch(shortUrl, {
            method: 'HEAD',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const finalUrl = response.url;
        pluginState.logDebug(`短链接重定向: ${shortUrl} -> ${finalUrl}`);
        return finalUrl;
    } catch (error) {
        pluginState.log('error', `解析短链接失败: ${shortUrl}`, error);

        // 如果 HEAD 请求失败，尝试 GET 请求
        try {
            const response = await fetch(shortUrl, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            return response.url;
        } catch (e) {
            pluginState.log('error', `GET 请求解析短链接也失败: ${shortUrl}`, e);
            return null;
        }
    }
}

// ==================== 视频信息获取 ====================

/**
 * 获取视频信息
 * @param options 视频标识 (bvid 或 aid)
 * @returns 视频信息或 null
 */
export async function fetchVideoInfo(options: { bvid?: string; aid?: number }): Promise<BilibiliVideoInfo | null> {
    try {
        const { bvid, aid } = options;

        if (!bvid && !aid) {
            pluginState.log('error', '获取视频信息失败: 未提供 bvid 或 aid');
            return null;
        }

        // 构建请求 URL
        const params = new URLSearchParams();
        if (bvid) {
            params.set('bvid', bvid);
        } else if (aid) {
            params.set('aid', aid.toString());
        }

        const url = `${BILIBILI_VIDEO_INFO_API}?${params.toString()}`;
        pluginState.logDebug(`请求视频信息: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com/',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            pluginState.log('error', `请求视频信息失败: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json() as BilibiliApiResponse<BilibiliVideoInfo>;

        if (data.code !== 0) {
            pluginState.log('warn', `B站 API 返回错误: code=${data.code}, message=${data.message}`);
            return null;
        }

        pluginState.logDebug(`获取视频信息成功: ${data.data.title}`);
        return data.data;
    } catch (error) {
        pluginState.log('error', '获取视频信息异常:', error);
        return null;
    }
}

/**
 * 从消息中解析 B 站链接并获取视频信息
 * @param text 消息文本
 * @returns 视频信息或 null
 */
export async function parseAndFetchVideoInfo(text: string): Promise<BilibiliVideoInfo | null> {
    try {
        // 1. 先尝试提取 BV 号
        let bvid = extractBvid(text);
        if (bvid) {
            pluginState.logDebug(`从消息中提取到 BV 号: ${bvid}`);
            return await fetchVideoInfo({ bvid });
        }

        // 2. 尝试提取 AV 号
        const aid = extractAvid(text);
        if (aid) {
            pluginState.logDebug(`从消息中提取到 AV 号: ${aid}`);
            return await fetchVideoInfo({ aid });
        }

        // 3. 尝试提取短链接
        const shortLink = extractShortLink(text);
        if (shortLink) {
            pluginState.logDebug(`从消息中提取到短链接: ${shortLink}`);
            const realUrl = await resolveShortUrl(shortLink);
            if (realUrl) {
                // 从真实 URL 中提取 BV 号
                bvid = extractBvid(realUrl);
                if (bvid) {
                    return await fetchVideoInfo({ bvid });
                }
                // 尝试提取 AV 号
                const aidFromUrl = extractAvid(realUrl);
                if (aidFromUrl) {
                    return await fetchVideoInfo({ aid: aidFromUrl });
                }
            }
        }

        return null;
    } catch (error) {
        pluginState.log('error', '解析视频信息异常:', error);
        return null;
    }
}

/**
 * 构建视频信息消息
 * @param videoInfo 视频信息
 * @returns 消息内容数组
 */
export function buildVideoMessage(videoInfo: BilibiliVideoInfo): Array<{ type: string; data: any }> {
    const messages: Array<{ type: string; data: any }> = [];

    // 封面图片
    if (videoInfo.pic) {
        messages.push({
            type: 'image',
            data: { url: videoInfo.pic }
        });
    }

    // 视频信息文本
    const duration = formatDuration(videoInfo.duration);
    const view = formatNumber(videoInfo.stat.view);
    const danmaku = formatNumber(videoInfo.stat.danmaku);
    const like = formatNumber(videoInfo.stat.like);
    const coin = formatNumber(videoInfo.stat.coin);
    const favorite = formatNumber(videoInfo.stat.favorite);

    const textContent = [
        `🎬 ${videoInfo.title}`,
        ``,
        `👤 UP主: ${videoInfo.owner.name}`,
        `📁 分区: ${videoInfo.tname}`,
        `⏱️ 时长: ${duration}`,
        ``,
        `▶️ ${view} 播放  💬 ${danmaku} 弹幕`,
        `👍 ${like}  🪙 ${coin}  ⭐ ${favorite}`,
        ``,
        `🔗 https://www.bilibili.com/video/${videoInfo.bvid}`
    ].join('\n');

    messages.push({
        type: 'text',
        data: { text: textContent }
    });

    return messages;
}
