/**
 * 消息处理器
 * 处理群消息中的 B 站链接，解析并发送视频信息
 */

import { EventType } from 'napcat-types/napcat-onebot/event/index';
import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import {
    containsBilibiliLink,
    extractVideoId,
    parseAndFetchVideoInfo,
    parseAndFetchVideoWithDownload,
    buildVideoMessage,
    buildVideoInfoMessages,
    downloadVideo,
    cleanupTempVideo,
    extractLinkFromSegments
} from '../services/bilibili-service';
import {
    isPuppeteerAvailable,
    renderVideoCard,
    buildRenderedImageMessage
} from '../services/puppeteer-render-service';

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
 * 合并转发消息节点类型
 */
interface ForwardNode {
    type: 'node';
    data: {
        user_id: string;
        nickname: string;
        content: Array<{ type: string; data: any }>;
    };
}

/**
 * 发送群合并转发消息
 * @param ctx 插件上下文
 * @param groupId 群号
 * @param messages 合并转发消息节点数组
 */
async function sendGroupForwardMsg(ctx: NapCatPluginContext, groupId: number | string, messages: ForwardNode[]): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_group_forward_msg',
            {
                group_id: String(groupId),
                messages: messages
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', `发送群合并转发消息失败:`, error);
        return false;
    }
}

/**
 * 构建伪造的合并转发消息节点
 * @param userId 发送者 QQ 号
 * @param nickname 发送者昵称
 * @param content 消息内容数组
 */
function buildForwardNode(userId: string, nickname: string, content: Array<{ type: string; data: any }>): ForwardNode {
    return {
        type: 'node',
        data: {
            user_id: userId,
            nickname: nickname,
            content: content
        }
    };
}

/**
 * 设置消息表情回复
 * @param ctx 插件上下文
 * @param messageId 消息 ID
 * @param emojiId 表情 ID（10024: 闪光, 124: ok）
 */
async function setMsgEmojiLike(ctx: NapCatPluginContext, messageId: number | string, emojiId: string): Promise<boolean> {
    try {
        await ctx.actions.call(
            'set_msg_emoji_like',
            {
                message_id: messageId,
                emoji_id: emojiId
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        pluginState.logDebug(`设置表情回复成功: message_id=${messageId}, emoji_id=${emojiId}`);
        return true;
    } catch (error) {
        pluginState.log('error', `设置表情回复失败:`, error);
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

        // 获取消息内容段
        const segments = Array.isArray(event.message) ? event.message : [];

        // 尝试从小程序获取链接
        const miniappLink = extractLinkFromSegments(segments);

        // 获取消息文本（去掉小程序可能带来的干扰）
        let rawMessage = event.raw_message || '';

        // 如果包含小程序链接，则优先使用小程序链接作为 rawMessage 参与后续解析
        if (miniappLink) {
            pluginState.logDebug(`检测到小程序或图文链接: ${miniappLink}`);
            rawMessage = miniappLink;
        } else if (!containsBilibiliLink(rawMessage)) {
            // 普通文本中也没有链接，则退出
            return;
        }

        pluginState.logDebug(`检测到 B 站相关内容 | 群: ${groupId} | 解析目标: ${rawMessage.substring(0, 100)}`);

        // 提取视频 ID 用于去重检查
        const videoId = await extractVideoId(rawMessage);
        if (!videoId) {
            pluginState.logDebug(`无法提取视频 ID，跳过`);
            return;
        }

        // 检查是否在缓存中（防止重复解析）
        const cacheTTL = pluginState.config.parseCacheTTL ?? 300;
        if (cacheTTL > 0 && pluginState.isInParseCache(String(groupId), videoId)) {
            pluginState.logDebug(`视频 ${videoId} 在群 ${groupId} 中已解析过，跳过重复解析`);
            return;
        }

        // 注意：CD 在解析成功且消息发送后才添加，避免出错时浪费 CD

        // 获取消息 ID 用于表情回复
        const messageId = event.message_id;

        // 贴一个"闪光"表情表示开始解析
        if (messageId) {
            await setMsgEmojiLike(ctx, messageId, '10024');
        }

        // 获取发送模式配置
        const sendMode = pluginState.config.sendMode || 'info-only';
        const maxVideoSizeMB = pluginState.config.maxVideoSizeMB || 100;

        let messageContent: Array<{ type: string; data: any }>;
        let videoFilePath: string | null = null;
        let useGroupFile = false; // 是否使用群文件方式发送
        let usePuppeteerRender = false; // 是否使用 puppeteer 渲染
        let videoInfo: any = null; // 视频信息

        if (sendMode === 'with-video') {
            // 模式：发送信息卡片 + 视频
            const result = await parseAndFetchVideoWithDownload(rawMessage);
            if (!result) {
                pluginState.logDebug(`无法获取视频信息，跳过`);
                return;
            }

            videoInfo = result.videoInfo;
            const { playUrl } = result;
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
        } else {
            // 模式：仅发送信息卡片
            videoInfo = await parseAndFetchVideoInfo(rawMessage);
            if (!videoInfo) {
                pluginState.logDebug(`无法获取视频信息，跳过`);
                return;
            }

            pluginState.log('info', `解析视频成功: ${videoInfo.title} (${videoInfo.bvid})`);
        }

        // 尝试使用 Puppeteer 渲染视频卡片
        pluginState.logDebug(`Puppeteer 配置状态: enabled=${pluginState.config.puppeteer?.enabled}, webUIUrl=${pluginState.config.puppeteer?.webUIUrl}`);

        if (pluginState.config.puppeteer?.enabled) {
            pluginState.logDebug('尝试使用 Puppeteer 渲染视频卡片...');
            const puppeteerAvailable = await isPuppeteerAvailable();
            pluginState.logDebug(`Puppeteer 可用性检查结果: ${puppeteerAvailable}`);

            if (puppeteerAvailable) {
                pluginState.logDebug('开始调用 renderVideoCard...');
                const renderResult = await renderVideoCard(videoInfo);
                pluginState.logDebug(`renderVideoCard 结果: success=${renderResult.success}, error=${renderResult.error || 'none'}, hasImage=${!!renderResult.imageBase64}`);

                if (renderResult.success && renderResult.imageBase64) {
                    pluginState.log('info', '使用 Puppeteer 渲染视频卡片成功');
                    messageContent = buildRenderedImageMessage(renderResult.imageBase64, videoInfo);
                    usePuppeteerRender = true;
                } else {
                    pluginState.log('warn', `Puppeteer 渲染失败: ${renderResult.error}，回退到文本模式`);
                    messageContent = buildVideoMessage(videoInfo);
                }
            } else {
                pluginState.logDebug('Puppeteer 不可用，使用文本模式');
                messageContent = buildVideoMessage(videoInfo);
            }
        } else {
            pluginState.logDebug('Puppeteer 未启用，使用文本模式');
            // 不使用 Puppeteer，直接构建文本消息
            messageContent = buildVideoMessage(videoInfo);
        }

        // 记录统计
        pluginState.incrementParsedCount();

        // 获取 Bot 信息用于伪造消息
        // 从事件中获取 self_id（Bot 的 QQ 号）
        const botUserId = String(event.self_id || '10000');
        const botNickname = 'Bilibili 解析';

        // 构建合并转发消息节点
        const forwardNodes: ForwardNode[] = [];

        if (usePuppeteerRender) {
            // 使用 Puppeteer 渲染的图片模式
            // 节点1：渲染的视频卡片图片 + 链接
            forwardNodes.push(buildForwardNode(botUserId, botNickname, messageContent));
        } else {
            // 文本模式：获取分离的消息内容（封面、信息、视频分别作为不同节点）
            const separatedMessages = buildVideoInfoMessages(messageContent);

            // 节点1：封面图片（如果有）
            if (separatedMessages.cover) {
                forwardNodes.push(buildForwardNode(botUserId, botNickname, [separatedMessages.cover]));
            }

            // 节点2：视频信息文本
            if (separatedMessages.info) {
                forwardNodes.push(buildForwardNode(botUserId, botNickname, [separatedMessages.info]));
            }
        }

        // 获取视频发送方式配置
        const videoSendMode = pluginState.config.videoSendMode || 'forward';

        // 节点：视频文件（如果有，且不需要群文件方式发送，且选择合并转发模式）
        if (videoFilePath && !useGroupFile && videoSendMode === 'forward') {
            forwardNodes.push(buildForwardNode(botUserId, botNickname, [{
                type: 'video',
                data: { file: videoFilePath }
            }]));
        }

        // 发送合并转发消息
        const success = await sendGroupForwardMsg(ctx, groupId, forwardNodes);
        if (success) {
            pluginState.log('info', `视频信息已通过合并转发发送到群 ${groupId}`);
            // 发送成功后才添加 CD 缓存，出错不计入 CD
            if (cacheTTL > 0) {
                pluginState.addToParseCache(String(groupId), videoId);
            }
        }

        // 单独发送视频消息（如果选择了单独发送模式）
        if (videoFilePath && !useGroupFile && videoSendMode === 'separate') {
            const videoSent = await sendGroupMessage(ctx, groupId, [{
                type: 'video',
                data: { file: videoFilePath }
            }]);
            if (videoSent) {
                pluginState.log('info', `视频已单独发送到群 ${groupId}`);
            }
        }

        // 如果使用群文件方式，上传视频到群文件
        if (useGroupFile && videoFilePath) {
            const fileName = `bilibili_${Date.now()}.mp4`;
            const uploadSuccess = await uploadGroupFile(ctx, groupId, videoFilePath, fileName);
            if (uploadSuccess) {
                pluginState.log('info', `视频已上传到群文件: ${fileName}`);
            }
        }

        // 解析完成，贴一个"ok"表情表示完成
        if (messageId) {
            await setMsgEmojiLike(ctx, messageId, '124');
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
