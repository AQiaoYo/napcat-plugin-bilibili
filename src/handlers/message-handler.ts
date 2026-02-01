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
    buildVideoMessage
} from '../services/bilibili-service';

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

        // 解析链接获取视频信息
        const videoInfo = await parseAndFetchVideoInfo(rawMessage);
        if (!videoInfo) {
            pluginState.logDebug(`无法获取视频信息，跳过`);
            return;
        }

        pluginState.log('info', `解析视频成功: ${videoInfo.title} (${videoInfo.bvid})`);

        // 构建并发送消息
        const messageContent = buildVideoMessage(videoInfo);

        try {
            await pluginState.callApi('send_group_msg', {
                group_id: groupId,
                message: messageContent
            });
            pluginState.logDebug(`视频信息已发送到群 ${groupId}`);
        } catch (sendError) {
            pluginState.log('error', `发送消息失败:`, sendError);
        }

    } catch (err) {
        pluginState.log('error', '消息处理异常:', err);
    }
}
