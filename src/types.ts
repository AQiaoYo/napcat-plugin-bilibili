/**
 * 类型定义文件
 * 定义 B 站视频解析插件所有的接口和类型
 */

import type { PluginConfigSchema, PluginConfigUIController } from 'napcat-types/napcat-onebot/network/plugin-manger';

/**
 * 发送模式枚举
 * - info-only: 仅发送视频信息卡片
 * - with-video: 发送视频信息卡片 + 视频文件
 */
export type SendMode = 'info-only' | 'with-video';

/**
 * 插件主配置接口
 */
export interface PluginConfig {
    /** 全局开关：是否启用 B 站链接解析功能 */
    enabled: boolean;
    /** 发送模式：info-only 仅发送信息卡片，with-video 发送信息卡片+视频 */
    sendMode: SendMode;
    /** 最大视频大小限制 (MB)，超过此大小不下载视频 */
    maxVideoSizeMB: number;
    /** 按群的单独配置 */
    groupConfigs?: Record<string, GroupBilibiliConfig>;
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

/** 框架配置 UI Schema 变量，NapCat WebUI 会读取此导出 */
export let plugin_config_ui: PluginConfigSchema = [];

export type { PluginConfigSchema, PluginConfigUIController };
