/**
 * 类型定义文件
 * 定义 B 站视频解析插件所有的接口和类型
 */

import type { PluginConfigSchema, PluginConfigUIController } from 'napcat-types/napcat-onebot/network/plugin/types';

/**
 * 发送模式枚举
 * - info-only: 仅发送视频信息卡片
 * - with-video: 发送视频信息卡片 + 视频文件
 */
export type SendMode = 'info-only' | 'with-video';

/**
 * 视频发送方式枚举
 * - forward: 视频包含在合并转发消息中（默认）
 * - separate: 视频作为单独的群消息发送
 */
export type VideoSendMode = 'forward' | 'separate';

/**
 * Puppeteer 渲染配置
 */
export interface PuppeteerRenderConfig {
    /** 是否启用 Puppeteer 渲染（需要安装 napcat-plugin-puppeteer 插件） */
    enabled: boolean;
    /** NapCat WebUI 地址（用于调用 Puppeteer API），默认 http://127.0.0.1:6099 */
    webUIUrl?: string;
}

/**
 * 视频质量选项
 * - auto: 自动选择最高质量（默认）
 * - 4k: 4K超高清
 * - 1080p60: 1080P 60帧
 * - 1080p: 1080P
 * - 720p: 720P
 * - 480p: 480P
 */
export type VideoQuality = 'auto' | '4k' | '1080p60' | '1080p' | '720p' | '480p';

/**
 * 插件主配置接口
 */
export interface PluginConfig {
    /** 全局开关：是否启用 B 站链接解析功能 */
    enabled: boolean;
    /** 调试模式：启用后输出详细日志 */
    debug: boolean;
    /** 发送模式：info-only 仅发送信息卡片，with-video 发送信息卡片+视频 */
    sendMode: SendMode;
    /** 最大视频大小限制 (MB)，超过此大小不下载视频 */
    maxVideoSizeMB: number;
    /** 视频发送方式：forward 包含在合并转发中，separate 单独发送 */
    videoSendMode: VideoSendMode;
    /** 解析缓存过期时间（秒），同一群内相同链接在此时间内不会重复解析，默认 300 秒（5分钟） */
    parseCacheTTL: number;
    /** 期望的视频质量，默认 auto 自动选择最高质量 */
    videoQuality?: VideoQuality;
    /** B 站登录凭据 */
    credential?: BilibiliCredential;
    /** 按群的单独配置 */
    groupConfigs?: Record<string, GroupBilibiliConfig>;
    /** Puppeteer 渲染配置 */
    puppeteer?: PuppeteerRenderConfig;
}

/**
 * 群 B 站解析配置
 */
export interface GroupBilibiliConfig {
    /** 是否启用此群的 B 站链接解析 */
    enabled?: boolean;
}

/**
 * B 站视频信息
 */
export interface BilibiliVideoInfo {
    /** BV 号 */
    bvid: string;
    /** AV 号 */
    aid: number;
    /** 视频 CID（默认分P） */
    cid: number;
    /** 视频标题 */
    title: string;
    /** 视频封面 URL */
    pic: string;
    /** 视频简介 */
    desc: string;
    /** 视频时长（秒） */
    duration: number;
    /** 分P列表 */
    pages?: Array<{
        cid: number;
        page: number;
        part: string;
        duration: number;
    }>;
    /** UP 主信息 */
    owner: {
        mid: number;
        name: string;
        face: string;
    };
    /** 视频统计数据 */
    stat: {
        /** 播放量 */
        view: number;
        /** 弹幕数 */
        danmaku: number;
        /** 评论数 */
        reply: number;
        /** 收藏数 */
        favorite: number;
        /** 投币数 */
        coin: number;
        /** 分享数 */
        share: number;
        /** 点赞数 */
        like: number;
    };
    /** 发布时间戳 */
    pubdate: number;
    /** 分区名称 */
    tname: string;
}

/**
 * B 站 API 响应结构
 */
export interface BilibiliApiResponse<T = any> {
    code: number;
    message: string;
    ttl?: number;
    data: T;
}

// ==================== B 站登录相关类型 ====================

/**
 * B 站登录凭据
 */
export interface BilibiliCredential {
    /** SESSDATA Cookie */
    sessdata: string;
    /** bili_jct Cookie (CSRF Token) */
    bili_jct: string;
    /** DedeUserID Cookie */
    dedeuserid: string;
    /** refresh_token */
    refresh_token?: string;
    /** 登录时间戳 */
    login_time?: number;
}

/**
 * 二维码登录状态
 */
export enum QrCodeLoginStatus {
    /** 未扫描 */
    WAITING = 86101,
    /** 已扫描未确认 */
    SCANNED = 86090,
    /** 二维码过期 */
    EXPIRED = 86038,
    /** 登录成功 */
    SUCCESS = 0,
}

/**
 * 二维码登录轮询结果
 */
export interface QrCodePollResult {
    status: QrCodeLoginStatus;
    message: string;
    credential?: BilibiliCredential;
}

/**
 * 二维码生成结果
 */
export interface QrCodeGenerateResult {
    /** 二维码内容 URL */
    url: string;
    /** 二维码密钥 */
    qrcode_key: string;
}

/**
 * B 站用户信息
 */
export interface BilibiliUserInfo {
    /** 用户 ID */
    mid: number;
    /** 用户名 */
    uname: string;
    /** 头像 URL */
    face: string;
    /** 是否登录 */
    isLogin: boolean;
    /** 等级信息 */
    level_info?: {
        current_level: number;
        current_min: number;
        current_exp: number;
        next_exp: string | number;
    };
    /** 硬币数 */
    money?: number;
    /** 会员信息 */
    vip?: {
        type: number;
        status: number;
        label: {
            text: string;
        };
    };
    /** 钱包信息 */
    wallet?: {
        bcoin_balance: number;
    };
    /** 社交统计 */
    relation_stat?: {
        following: number;
        follower: number;
        dynamic_count: number;
    };
    /** 节操值 */
    moral?: number;
}

/** 框架配置 UI Schema 变量，NapCat WebUI 会读取此导出 */
export let plugin_config_ui: PluginConfigSchema = [];

export type { PluginConfigSchema, PluginConfigUIController };
