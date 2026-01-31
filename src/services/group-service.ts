/**
 * 群服务
 * 获取群列表和机器人权限信息
 */

// 群服务占位实现
// 说明：保留接口，避免其他模块直接依赖时出错。请根据新插件需求实现实际逻辑。

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import { pluginState } from '../core/state';

export async function getGroupsWithPermissions(_ctx: NapCatPluginContext) {
    pluginState.logDebug('getGroupsWithPermissions: 占位实现，返回空列表');
    return [] as any[];
}
