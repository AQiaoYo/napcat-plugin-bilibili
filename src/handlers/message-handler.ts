/**
 * 消息处理器
 * 处理群消息中的 B 站链接，解析并发送视频信息
 */

import { EventType } from 'napcat-types/napcat-onebot/event/index';
import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import { pluginState } from '../core/state';
import {
    containsBilibiliLink,
    parseAndFetchVideoInfo,
    parseAndFetchVideoWithDownload,
    buildVideoMessage,
    buildVideoMessageWithFile,
    downloadVideo,
    cleanupTempVideo
} from '../services/bilibili-service';

/**
 * 发送群消息
 * @param ctx 插件上下文
 * @param groupId 群号
 * @param message 消息内容
 */
async function sendGroupMessage(ctx: NapCatPluginContext, groupId: number | string, message: any[]): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_group_msg',
            {
                group_id: groupId,
                message: message
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', `发送群消息失败:`, error);
        return false;
    }
}

/**
 * 上传群文件（用于超过 100MB 的视频）
 * @param ctx 插件上下文
 * @param groupId 群号
 * @param filePath 文件路径
 * @param fileName 文件名
 */
async function uploadGroupFile(ctx: NapCatPluginContext, groupId: number | string, filePath: string, fileName: string): Promise<boolean> {
    try {
        await ctx.actions.call(
            'upload_group_file',
            {
                group_id: groupId,
                file: filePath,
                name: fileName
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        pluginState.log('info', `群文件上传成功: ${fileName}`);
        return true;
    } catch (error) {
        pluginState.log('error', `上传群文件失败:`, error);
        return false;
    }
}

/**
 * 处理收到的消息
 * 检测 B 站链接并发送视频信息
 */
export async function handleMessage(ctx: NapCatPluginContext, event: OB11Message) {
    try {
        // 检查全局开关
        if (!pluginState.config.enabled) return;

        // 仅处理群消息
        if (event.post_type !== EventType.MESSAGE || event.message_type !== 'group') {
            return;
        }

        const groupId = event.group_id;
        if (!groupId) return;

        // 检查该群是否启用了 B 站解析
        if (!pluginState.isGroupEnabled(String(groupId))) {
            pluginState.logDebug(`群 ${groupId} 未启用 B 站解析，跳过`);
            return;
        }

        // 获取消息文本
        const rawMessage = event.raw_message || '';
        if (!rawMessage) return;

        // 检测是否包含 B 站链接
        if (!containsBilibiliLink(rawMessage)) {
            return;
        }

        pluginState.logDebug(`检测到 B 站链接 | 群: ${groupId} | 消息: ${rawMessage.substring(0, 100)}`);

        // 获取发送模式配置
        const sendMode = pluginState.config.sendMode || 'info-only';
        const maxVideoSizeMB = pluginState.config.maxVideoSizeMB || 100;

        let messageContent: Array<{ type: string; data: any }>;
        let videoFilePath: string | null = null;
        let useGroupFile = false; // 是否使用群文件方式发送

        if (sendMode === 'with-video') {
            // 模式：发送信息卡片 + 视频
            const result = await parseAndFetchVideoWithDownload(rawMessage);
            if (!result) {
                pluginState.logDebug(`无法获取视频信息，跳过`);
                return;
            }

            const { videoInfo, playUrl } = result;
            pluginState.log('info', `解析视频成功: ${videoInfo.title} (${videoInfo.bvid})`);

            // 尝试下载视频
            if (playUrl?.videoUrl) {
                // 检查视频大小 (NapCat 视频消息最大 100MB)
                const videoSizeMB = playUrl.size ? playUrl.size / 1024 / 1024 : 0;

                if (videoSizeMB > 100) {
                    // 超过 100MB：使用群文件方式发送
                    pluginState.log('info', `视频大小 ${videoSizeMB.toFixed(2)}MB 超过 100MB 限制，将使用群文件方式发送`);
                    videoFilePath = await downloadVideo(playUrl.videoUrl, videoInfo.bvid, 500); // 群文件支持更大尺寸
                    useGroupFile = true;
                } else if (videoSizeMB > 0 && videoSizeMB > maxVideoSizeMB) {
                    // 超过配置限制但不超过 100MB：仅发送信息卡片
                    pluginState.log('info', `视频大小 ${videoSizeMB.toFixed(2)}MB 超过配置限制 ${maxVideoSizeMB}MB，仅发送信息卡片`);
                } else {
                    // 正常下载视频
                    videoFilePath = await downloadVideo(playUrl.videoUrl, videoInfo.bvid, maxVideoSizeMB);
                }
            }

            // 构建消息（不含视频，如果使用群文件方式）
            messageContent = buildVideoMessageWithFile(videoInfo, useGroupFile ? null : videoFilePath);
        } else {
            // 模式：仅发送信息卡片
            const videoInfo = await parseAndFetchVideoInfo(rawMessage);
            if (!videoInfo) {
                pluginState.logDebug(`无法获取视频信息，跳过`);
                return;
            }

            pluginState.log('info', `解析视频成功: ${videoInfo.title} (${videoInfo.bvid})`);
            messageContent = buildVideoMessage(videoInfo);
        }

        // 发送消息到群
        const success = await sendGroupMessage(ctx, groupId, messageContent);

        if (success) {
            pluginState.log('info', `视频信息已发送到群 ${groupId}${videoFilePath && !useGroupFile ? ' (含视频)' : ''}`);
        }

        // 如果使用群文件方式，上传视频到群文件
        if (useGroupFile && videoFilePath) {
            const fileName = `bilibili_${Date.now()}.mp4`;
            const uploadSuccess = await uploadGroupFile(ctx, groupId, videoFilePath, fileName);
            if (uploadSuccess) {
                pluginState.log('info', `视频已上传到群文件: ${fileName}`);
            }
        }

        // 清理临时视频文件（延迟清理，确保消息/文件已发送）
        if (videoFilePath) {
            setTimeout(() => {
                cleanupTempVideo(videoFilePath!);
            }, useGroupFile ? 120000 : 60000); // 群文件上传需要更长时间，2分钟后清理
        }

    } catch (err) {
        pluginState.log('error', '消息处理异常:', err);
    }
}
