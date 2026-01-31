/**
 * 消息处理器
 * 保留消息处理入口，用于未来扩展（如管理员命令或状态查询）
 */

import { EventType } from 'napcat-types/napcat-onebot/event/index';
import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import { pluginState } from '../core/state';

/** 处理收到的消息（占位实现） */
export async function handleMessage(_ctx: NapCatPluginContext, event: OB11Message) {
    try {
        if (!pluginState.config.enabled) return;

        // 占位：当前仅记录消息已接收的调试日志，具体命令处理请在新插件实现
        if (event && event.post_type === EventType.MESSAGE) {
            pluginState.logDebug(`收到消息（占位，未处理）| id=${event.message_id}`);
        }
    } catch (err) {
        pluginState.log('error', '消息处理异常:', err);
    }
}
