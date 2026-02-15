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
        headers['Cookie'] = `SESSDATA=${encodeURIComponent(credential.sessdata)}; bili_jct=${credential.bili_jct}; DedeUserID=${credential.dedeuserid}`;
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
 * 从消息段数组中提取 B 站链接（支持小程序和图文）
 * @param segments 消息段数组
 * @returns 链接或 null
 */
export function extractLinkFromSegments(segments: any[]): string | null {
    if (!Array.isArray(segments)) return null;

    for (const seg of segments) {
        if (seg.type === 'json' && seg.data?.data) {
            try {
                // 处理可能被转义的 JSON 字符串
                const jsonStr = typeof seg.data.data === 'string' ? seg.data.data : JSON.stringify(seg.data.data);
                const data = JSON.parse(jsonStr);
                const app = data.app || '';
                const meta = data.meta || {};

                // 处理小程序 (com.tencent.miniapp)
                if (app.includes('com.tencent.miniapp')) {
                    let detail = null;
                    for (const key in meta) {
                        if (key.startsWith('detail_')) {
                            detail = meta[key];
                            break;
                        }
                    }
                    if (detail && detail.qqdocurl) {
                        const url = detail.qqdocurl;
                        if (url.includes('b23.tv') || url.includes('bilibili.com')) {
                            return url;
                        }
                    }
                }

                // 处理图文链接 (com.tencent.tuwen)
                if (app.includes('com.tencent.tuwen')) {
                    const news = meta.news || {};
                    const url = news.jumpUrl || '';
                    if (url && (url.includes('b23.tv') || url.includes('bilibili.com'))) {
                        return url;
                    }
                }

                // 兜底：处理旧版卡片格式（无特定 app 标识）
                // 尝试从 meta.detail_1.qqdocurl 获取
                const detail1 = meta.detail_1 || {};
                if (detail1.qqdocurl) {
                    const url = detail1.qqdocurl;
                    if (url.includes('b23.tv') || url.includes('bilibili.com')) {
                        return url;
                    }
                }
                // 尝试从 meta.news.jumpUrl 获取（兜底）
                const newsAlt = meta.news || {};
                if (newsAlt.jumpUrl) {
                    const url = newsAlt.jumpUrl;
                    if (url.includes('b23.tv') || url.includes('bilibili.com')) {
                        return url;
                    }
                }
            } catch (e) {
                // 解析失败忽略
            }
        }
    }
    return null;
}

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
 * 从消息中提取视频 ID（统一返回 BV 号）
 * 用于去重检查，支持 BV 号、AV 号、完整链接和短链接
 * @param text 消息文本
 * @returns BV 号或 AV 号字符串（用于缓存 key）
 */
export async function extractVideoId(text: string): Promise<string | null> {
    // 1. 先尝试提取 BV 号
    let bvid = extractBvid(text);
    if (bvid) {
        return bvid;
    }

    // 2. 尝试提取 AV 号
    const aid = extractAvid(text);
    if (aid) {
        return `av${aid}`;
    }

    // 3. 尝试提取并解析短链接
    const shortLink = extractShortLink(text);
    if (shortLink) {
        const realUrl = await resolveShortUrl(shortLink);
        if (realUrl) {
            // 从真实 URL 中提取 BV 号
            bvid = extractBvid(realUrl);
            if (bvid) {
                return bvid;
            }
            // 尝试提取 AV 号
            const aidFromUrl = extractAvid(realUrl);
            if (aidFromUrl) {
                return `av${aidFromUrl}`;
            }
        }
    }

    return null;
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

/**
 * 分离的消息内容（用于合并转发）
 */
export interface SeparatedVideoMessages {
    /** 封面图片消息段 */
    cover?: { type: string; data: any };
    /** 信息文本消息段 */
    info?: { type: string; data: any };
}

/**
 * 构建分离的视频信息消息（用于合并转发）
 * 将封面和文本信息分开，便于构造合并转发节点
 * @param messages 完整的消息数组
 * @returns 分离的消息对象
 */
export function buildVideoInfoMessages(messages: Array<{ type: string; data: any }>): SeparatedVideoMessages {
    const result: SeparatedVideoMessages = {};

    for (const msg of messages) {
        if (msg.type === 'image' && !result.cover) {
            result.cover = msg;
        } else if (msg.type === 'text' && !result.info) {
            result.info = msg;
        }
    }

    return result;
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
 * DASH 视频流信息
 */
export interface DashVideoStream {
    /** 质量ID */
    id: number;
    /** 视频URL（备用URL） */
    backupUrl: string | string[];
    /** 带宽 */
    bandwidth: number;
    /** 编码格式 */
    codecs: string;
    /** 宽度 */
    width: number;
    /** 高度 */
    height: number;
    /** 帧率 */
    frameRate: string;
}

/**
 * DASH 音频流信息
 */
export interface DashAudioStream {
    /** 质量ID */
    id: number;
    /** 音频URL（备用URL） */
    backupUrl: string | string[];
    /** 带宽 */
    bandwidth: number;
    /** 编码格式 */
    codecs: string;
}

/**
 * DASH 播放信息
 */
export interface DashPlayInfo {
    /** 视频流列表 */
    video: DashVideoStream[];
    /** 音频流列表 */
    audio: DashAudioStream[];
    /** 时长（秒） */
    duration: number;
    /** Dolby音频 */
    dolby?: {
        audio?: DashAudioStream[];
    };
    /** FLAC音频 */
    flac?: {
        audio?: DashAudioStream;
    };
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
 * 获取视频质量ID映射
 */
const VIDEO_QUALITY_MAP: Record<string, number> = {
    '4k': 120,
    '1080p60': 116,
    '1080p': 80,
    '720p': 64,
    '480p': 32,
    '360p': 16
};

/**
 * 根据配置获取请求的视频质量ID
 * @returns 质量ID
 */
function getRequestedQualityId(): number {
    const configQuality = pluginState.config.videoQuality || 'auto';

    if (configQuality === 'auto') {
        // 自动模式：根据登录状态选择
        const isLogged = !!(pluginState.config.credential?.sessdata);
        return isLogged ? 116 : 80; // 已登录请求1080P60，未登录请求1080P
    }

    return VIDEO_QUALITY_MAP[configQuality] || 80;
}

/**
 * 获取视频播放 URL（DASH格式，支持1080P及以上）
 * @param options 视频标识
 * @returns DASH播放信息或 null
 */
export async function fetchVideoDashInfo(options: { bvid?: string; aid?: number; cid: number }): Promise<DashPlayInfo | null> {
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

        // 根据配置获取请求的质量ID
        const requestedQuality = getRequestedQualityId();
        const isLogged = !!(pluginState.config.credential?.sessdata);

        params.set('qn', requestedQuality.toString());
        params.set('fourk', isLogged ? '1' : '0'); // 已登录允许4K

        // fnval=16 表示请求DASH格式（音视频分离）
        // fnval=4048 = 16(DASH) + 2048(HDR) + 1024(4K) + 512(杜比) + 256(8K) + 128(杜比视界)
        params.set('fnval', '4048'); // DASH 格式，支持高质量
        params.set('fnver', '0');

        const url = `${BILIBILI_PLAYURL_API}?${params.toString()}`;
        pluginState.logDebug(`请求视频DASH信息: ${url} (已登录: ${isLogged}, 请求质量: ${requestedQuality})`);

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
        if (!playData?.dash) {
            pluginState.log('warn', '未找到DASH格式视频数据');
            return null;
        }

        const dashData = playData.dash;
        pluginState.logDebug(`获取DASH信息成功: 视频流=${dashData.video?.length || 0}, 音频流=${dashData.audio?.length || 0}`);

        return {
            video: dashData.video || [],
            audio: dashData.audio || [],
            duration: dashData.duration || 0,
            dolby: dashData.dolby,
            flac: dashData.flac
        };
    } catch (error) {
        pluginState.log('error', '获取视频DASH信息异常:', error);
        return null;
    }
}

/**
 * 获取最高质量的视频流和音频流
 * @param dashInfo DASH播放信息
 * @returns 最高质量的视频和音频流
 */
export function getHighestQualityStreams(dashInfo: DashPlayInfo): {
    video: DashVideoStream | null;
    audio: DashAudioStream | null;
} {
    let highestVideo: DashVideoStream | null = null;
    let highestAudio: DashAudioStream | null = null;

    // 选择视频流
    if (dashInfo.video && dashInfo.video.length > 0) {
        const configQuality = pluginState.config.videoQuality || 'auto';

        if (configQuality === 'auto') {
            // 自动模式：选择质量ID最高的
            const sortedVideos = [...dashInfo.video].sort((a, b) => b.id - a.id);
            highestVideo = sortedVideos[0];
        } else {
            // 指定质量模式：选择最接近配置质量的流
            const targetQualityId = VIDEO_QUALITY_MAP[configQuality];

            // 先尝试找到完全匹配的
            highestVideo = dashInfo.video.find(v => v.id === targetQualityId) || null;

            // 如果没有完全匹配，选择最接近且不超过目标质量的
            if (!highestVideo) {
                const lowerOrEqual = dashInfo.video
                    .filter(v => v.id <= targetQualityId)
                    .sort((a, b) => b.id - a.id);

                if (lowerOrEqual.length > 0) {
                    highestVideo = lowerOrEqual[0];
                } else {
                    // 如果都超过目标质量，选择最低的
                    const sorted = [...dashInfo.video].sort((a, b) => a.id - b.id);
                    highestVideo = sorted[0];
                }
            }
        }

        if (highestVideo) {
            pluginState.logDebug(`选择视频流: 质量ID=${highestVideo.id}, 分辨率=${highestVideo.width}x${highestVideo.height}`);
        }
    }

    // 选择最高质量的音频流（优先级：FLAC > Dolby > 普通音频按带宽排序）
    const audioStreams: DashAudioStream[] = [];

    // 添加普通音频流
    if (dashInfo.audio && dashInfo.audio.length > 0) {
        audioStreams.push(...dashInfo.audio);
    }

    // 添加 Dolby 音频流
    if (dashInfo.dolby?.audio && dashInfo.dolby.audio.length > 0) {
        audioStreams.push(...dashInfo.dolby.audio);
    }

    // 添加 FLAC 音频流
    if (dashInfo.flac?.audio) {
        audioStreams.push(dashInfo.flac.audio);
    }

    if (audioStreams.length > 0) {
        // 按优先级排序：FLAC(30251) > Dolby(30250) > 其他按带宽
        const sortedAudios = audioStreams.sort((a, b) => {
            const aId = a.id;
            const bId = b.id;

            // FLAC 最高优先级
            if (aId === 30251) return -1;
            if (bId === 30251) return 1;

            // Dolby 次优先级
            if (aId === 30250) return -1;
            if (bId === 30250) return 1;

            // 其他按带宽排序
            return b.bandwidth - a.bandwidth;
        });

        highestAudio = sortedAudios[0];
        const audioType = highestAudio.id === 30251 ? 'FLAC' : highestAudio.id === 30250 ? 'Dolby' : '普通';
        pluginState.logDebug(`选择音频流: 类型=${audioType}, 质量ID=${highestAudio.id}, 带宽=${highestAudio.bandwidth}`);
    }

    return { video: highestVideo, audio: highestAudio };
}

/**
 * 从流信息中提取URL
 * @param backupUrl 备用URL（可能是字符串或数组）
 * @returns URL字符串
 */
function extractStreamUrl(backupUrl: string | string[]): string {
    if (Array.isArray(backupUrl) && backupUrl.length > 0) {
        return backupUrl[0];
    }
    if (typeof backupUrl === 'string') {
        return backupUrl;
    }
    return '';
}

/**
 * 获取视频播放 URL（兼容旧接口，返回最高质量）
 * @param options 视频标识
 * @returns 播放 URL 信息或 null
 */
export async function fetchVideoPlayUrl(options: { bvid?: string; aid?: number; cid: number }): Promise<VideoPlayUrlInfo | null> {
    try {
        const dashInfo = await fetchVideoDashInfo(options);
        if (!dashInfo) {
            return null;
        }

        const { video, audio } = getHighestQualityStreams(dashInfo);
        if (!video) {
            pluginState.log('warn', '未找到可用的视频流');
            return null;
        }

        const videoUrl = extractStreamUrl(video.backupUrl);
        if (!videoUrl) {
            pluginState.log('warn', '视频流URL为空');
            return null;
        }

        // 注意：DASH格式的视频和音频是分离的，这里只返回视频URL
        // 实际使用时需要同时下载视频和音频并合并
        return {
            videoUrl,
            quality: video.id,
            format: 'dash',
            timelength: dashInfo.duration,
            size: undefined // DASH格式无法预先知道大小
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
 * 下载流文件（视频流或音频流）
 * @param url 流URL
 * @param outputPath 输出路径
 * @returns 是否成功
 */
async function downloadStream(url: string, outputPath: string): Promise<boolean> {
    try {
        pluginState.logDebug(`开始下载流: ${outputPath}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...DEFAULT_HEADERS,
                'Accept': '*/*'
            }
        });

        if (!response.ok) {
            pluginState.log('error', `下载流失败: HTTP ${response.status}`);
            return false;
        }

        const buffer = await response.arrayBuffer();
        fs.writeFileSync(outputPath, Buffer.from(buffer));

        const sizeMB = buffer.byteLength / 1024 / 1024;
        pluginState.logDebug(`流下载完成: ${outputPath} (${sizeMB.toFixed(2)}MB)`);

        return true;
    } catch (error) {
        pluginState.log('error', `下载流异常: ${outputPath}`, error);
        return false;
    }
}

/**
 * 使用 FFmpeg 合并视频和音频
 * @param videoPath 视频文件路径
 * @param audioPath 音频文件路径
 * @param outputPath 输出文件路径
 * @returns 是否成功
 */
async function mergeVideoAudioWithFFmpeg(videoPath: string, audioPath: string, outputPath: string): Promise<boolean> {
    try {
        pluginState.log('info', '开始使用 FFmpeg 合并视频和音频...');

        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        // 构建 FFmpeg 命令
        const command = `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a copy -y "${outputPath}"`;
        pluginState.logDebug(`FFmpeg 命令: ${command}`);

        await execAsync(command);
        pluginState.log('info', `视频合并成功: ${outputPath}`);

        return true;
    } catch (error: any) {
        pluginState.log('error', 'FFmpeg 合并失败:', error);

        // 检查是否是 FFmpeg 未安装
        if (error.message?.includes('ffmpeg')) {
            pluginState.log('warn', '未检测到 FFmpeg，请安装 FFmpeg 以支持视频合并功能');
        }

        return false;
    }
}

/**
 * 下载并合并 DASH 视频（支持1080P及以上）
 * @param bvid BV号
 * @param cid 视频CID
 * @param maxSizeMB 最大大小限制 (MB)
 * @returns 本地文件路径或 null
 */
export async function downloadDashVideo(bvid: string, cid: number, maxSizeMB: number = 100): Promise<string | null> {
    let tempVideoPath: string | null = null;
    let tempAudioPath: string | null = null;

    try {
        pluginState.log('info', `开始下载 DASH 视频: ${bvid}`);

        // 获取 DASH 信息
        const dashInfo = await fetchVideoDashInfo({ bvid, cid });
        if (!dashInfo) {
            pluginState.log('error', '获取 DASH 信息失败');
            return null;
        }

        // 获取最高质量的视频流和音频流
        const { video, audio } = getHighestQualityStreams(dashInfo);
        if (!video || !audio) {
            pluginState.log('error', '未找到可用的视频流或音频流');
            return null;
        }

        const videoUrl = extractStreamUrl(video.backupUrl);
        const audioUrl = extractStreamUrl(audio.backupUrl);

        if (!videoUrl || !audioUrl) {
            pluginState.log('error', '视频流或音频流 URL 为空');
            return null;
        }

        pluginState.log('info', `视频质量: ID=${video.id}, 分辨率=${video.width}x${video.height}`);
        pluginState.log('info', `音频质量: ID=${audio.id}, 带宽=${audio.bandwidth}`);

        // 创建临时文件路径
        const tempDir = getTempVideoDir();
        const timestamp = Date.now();
        tempVideoPath = path.join(tempDir, `${bvid}_${timestamp}_video.m4v`);
        tempAudioPath = path.join(tempDir, `${bvid}_${timestamp}_audio.m4a`);
        const outputPath = path.join(tempDir, `${bvid}_${timestamp}.mp4`);

        // 下载视频流
        pluginState.log('info', '正在下载视频流...');
        const videoSuccess = await downloadStream(videoUrl, tempVideoPath);
        if (!videoSuccess) {
            return null;
        }

        // 检查视频大小
        const videoStats = fs.statSync(tempVideoPath);
        const videoSizeMB = videoStats.size / 1024 / 1024;
        if (videoSizeMB > maxSizeMB) {
            pluginState.log('warn', `视频大小 ${videoSizeMB.toFixed(2)}MB 超过限制 ${maxSizeMB}MB`);
            fs.unlinkSync(tempVideoPath);
            return null;
        }

        // 下载音频流
        pluginState.log('info', '正在下载音频流...');
        const audioSuccess = await downloadStream(audioUrl, tempAudioPath);
        if (!audioSuccess) {
            fs.unlinkSync(tempVideoPath);
            return null;
        }

        // 合并视频和音频
        const mergeSuccess = await mergeVideoAudioWithFFmpeg(tempVideoPath, tempAudioPath, outputPath);

        // 清理临时文件
        try {
            fs.unlinkSync(tempVideoPath);
            fs.unlinkSync(tempAudioPath);
        } catch (e) {
            pluginState.logDebug('清理临时文件失败');
        }

        if (!mergeSuccess) {
            pluginState.log('error', '视频合并失败');
            return null;
        }

        // 检查合并后的文件大小
        const outputStats = fs.statSync(outputPath);
        const outputSizeMB = outputStats.size / 1024 / 1024;
        pluginState.log('info', `视频下载并合并完成: ${outputPath} (${outputSizeMB.toFixed(2)}MB)`);

        return outputPath;
    } catch (error) {
        pluginState.log('error', '下载 DASH 视频异常:', error);

        // 清理临时文件
        if (tempVideoPath && fs.existsSync(tempVideoPath)) {
            try {
                fs.unlinkSync(tempVideoPath);
            } catch (e) {
                // 忽略
            }
        }
        if (tempAudioPath && fs.existsSync(tempAudioPath)) {
            try {
                fs.unlinkSync(tempAudioPath);
            } catch (e) {
                // 忽略
            }
        }

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
