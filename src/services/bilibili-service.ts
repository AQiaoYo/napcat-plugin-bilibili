/**
 * B站视频解析服务
 * 提供 B 站链接解析和视频信息获取功能
 */

import fs from 'fs';
import path from 'path';
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

/** B 站视频播放 URL API（用于获取下载链接） */
const BILIBILI_PLAYURL_API = 'https://api.bilibili.com/x/player/playurl';

/** 临时视频存储目录 */
const TEMP_VIDEO_DIR = 'bilibili_videos';

/** 默认请求头 */
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json'
};

/**
 * 获取带登录凭据的请求头
 */
function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...DEFAULT_HEADERS };
    const credential = pluginState.config.credential;

    if (credential?.sessdata && credential?.bili_jct && credential?.dedeuserid) {
        headers['Cookie'] = `SESSDATA=${credential.sessdata}; bili_jct=${credential.bili_jct}; DedeUserID=${credential.dedeuserid}`;
        pluginState.logDebug('使用登录凭据发送请求');
    }

    return headers;
}

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
            headers: getAuthHeaders()
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

// ==================== 视频下载相关 ====================

/**
 * 视频播放 URL 信息
 */
export interface VideoPlayUrlInfo {
    /** 视频流 URL */
    videoUrl: string;
    /** 视频质量 */
    quality: number;
    /** 视频格式 */
    format: string;
    /** 视频时长 (秒) */
    timelength: number;
    /** 预估大小 (字节) */
    size?: number;
}

/**
 * 获取视频临时目录
 */
function getTempVideoDir(): string {
    const tempDir = path.join(pluginState.dataPath || process.cwd(), TEMP_VIDEO_DIR);
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
}

/**
 * 获取视频播放 URL
 * @param options 视频标识
 * @returns 播放 URL 信息或 null
 */
export async function fetchVideoPlayUrl(options: { bvid?: string; aid?: number; cid: number }): Promise<VideoPlayUrlInfo | null> {
    try {
        const { bvid, aid, cid } = options;

        if (!cid) {
            pluginState.log('error', '获取视频播放URL失败: 未提供 cid');
            return null;
        }

        // 构建请求 URL
        const params = new URLSearchParams();
        if (bvid) {
            params.set('bvid', bvid);
        } else if (aid) {
            params.set('avid', aid.toString());
        }
        params.set('cid', cid.toString());
        params.set('qn', '80'); // 1080P 画质 (需要登录才能获取更高清晰度)
        params.set('fnval', '1'); // MP4 格式
        params.set('fnver', '0');
        params.set('fourk', '1'); // 允许 4K

        const url = `${BILIBILI_PLAYURL_API}?${params.toString()}`;
        pluginState.logDebug(`请求视频播放URL: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            pluginState.log('error', `请求视频播放URL失败: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json() as BilibiliApiResponse<any>;

        if (data.code !== 0) {
            pluginState.log('warn', `B站 API 返回错误: code=${data.code}, message=${data.message}`);
            return null;
        }

        const playData = data.data;
        if (!playData?.durl || playData.durl.length === 0) {
            pluginState.log('warn', '未找到可用的视频下载链接');
            return null;
        }

        const firstUrl = playData.durl[0];
        pluginState.logDebug(`获取视频播放URL成功: quality=${playData.quality}`);

        return {
            videoUrl: firstUrl.url,
            quality: playData.quality,
            format: playData.format || 'mp4',
            timelength: playData.timelength / 1000, // 转换为秒
            size: firstUrl.size
        };
    } catch (error) {
        pluginState.log('error', '获取视频播放URL异常:', error);
        return null;
    }
}

/**
 * 下载视频到本地
 * @param videoUrl 视频 URL
 * @param bvid BV 号
 * @param maxSizeMB 最大大小限制 (MB)
 * @returns 本地文件路径或 null
 */
export async function downloadVideo(videoUrl: string, bvid: string, maxSizeMB: number = 100): Promise<string | null> {
    try {
        pluginState.logDebug(`开始下载视频: ${bvid}`);

        // 获取视频文件大小（通过 HEAD 请求）
        try {
            const headResponse = await fetch(videoUrl, {
                method: 'HEAD',
                headers: {
                    ...DEFAULT_HEADERS,
                    'Range': 'bytes=0-0'
                }
            });

            const contentLength = headResponse.headers.get('content-length');
            if (contentLength) {
                const sizeMB = parseInt(contentLength, 10) / 1024 / 1024;
                if (sizeMB > maxSizeMB) {
                    pluginState.log('warn', `视频大小 ${sizeMB.toFixed(2)}MB 超过限制 ${maxSizeMB}MB，跳过下载`);
                    return null;
                }
                pluginState.logDebug(`视频大小: ${sizeMB.toFixed(2)}MB`);
            }
        } catch (e) {
            pluginState.logDebug('无法获取视频大小，继续下载');
        }

        // 下载视频
        const response = await fetch(videoUrl, {
            method: 'GET',
            headers: {
                ...DEFAULT_HEADERS,
                'Accept': '*/*'
            }
        });

        if (!response.ok) {
            pluginState.log('error', `下载视频失败: HTTP ${response.status}`);
            return null;
        }

        const buffer = await response.arrayBuffer();
        const tempDir = getTempVideoDir();
        const fileName = `${bvid}_${Date.now()}.mp4`;
        const filePath = path.join(tempDir, fileName);

        fs.writeFileSync(filePath, Buffer.from(buffer));
        pluginState.log('info', `视频下载完成: ${filePath} (${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB)`);

        return filePath;
    } catch (error) {
        pluginState.log('error', '下载视频异常:', error);
        return null;
    }
}

/**
 * 清理临时视频文件
 * @param filePath 文件路径
 */
export function cleanupTempVideo(filePath: string): void {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            pluginState.logDebug(`已清理临时视频: ${filePath}`);
        }
    } catch (error) {
        pluginState.log('warn', `清理临时视频失败: ${filePath}`, error);
    }
}

/**
 * 解析并获取完整视频信息（包含下载 URL）
 * @param text 消息文本
 * @returns 视频信息和下载链接
 */
export async function parseAndFetchVideoWithDownload(text: string): Promise<{
    videoInfo: BilibiliVideoInfo;
    playUrl: VideoPlayUrlInfo | null;
} | null> {
    const videoInfo = await parseAndFetchVideoInfo(text);
    if (!videoInfo) {
        return null;
    }

    // 获取 cid（视频分P的ID，默认第一P）
    const cid = videoInfo.cid || videoInfo.pages?.[0]?.cid;
    if (!cid) {
        pluginState.log('warn', '无法获取视频 cid，无法获取下载链接');
        return { videoInfo, playUrl: null };
    }

    // 获取播放 URL
    const playUrl = await fetchVideoPlayUrl({
        bvid: videoInfo.bvid,
        cid
    });

    return { videoInfo, playUrl };
}

/**
 * 构建包含视频的完整消息
 * @param videoInfo 视频信息
 * @param videoFilePath 视频本地路径 (可选)
 * @returns 消息内容数组
 */
export function buildVideoMessageWithFile(
    videoInfo: BilibiliVideoInfo,
    videoFilePath?: string | null
): Array<{ type: string; data: any }> {
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

    // 如果有视频文件，添加视频消息
    if (videoFilePath) {
        messages.push({
            type: 'video',
            data: { file: videoFilePath }
        });
    }

    return messages;
}
