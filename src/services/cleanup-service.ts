// cleanup-service: 已清理为最小兼容占位实现
// 说明：为了将仓库作为新插件模板继续开发，这个文件被替换为精简占位实现。
// 保留函数签名以避免破坏对外调用；在需要时请在此实现真实逻辑或彻底替换该服务。

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import { pluginState } from '../core/state';
import type { CleanupResult } from '../types';

const DEFAULT_RESULT = (groupId = '0'): CleanupResult => ({
    groupId,
    groupName: `group-${groupId}`,
    totalMembers: 0,
    inactiveMembers: 0,
    kickedMembers: 0,
    kickedList: [],
    failedList: [],
    dryRun: true,
    timestamp: Date.now()
});

export async function runCleanupForGroup(_ctx: NapCatPluginContext, groupId: string): Promise<CleanupResult> {
    pluginState.log('warn', `cleanup-service: runCleanupForGroup 已被清理为占位实现（groupId=${groupId}）`);
    return DEFAULT_RESULT(groupId);
}

export async function runCleanupAndNotify(ctx: NapCatPluginContext, groupId: string): Promise<CleanupResult> {
    // 保持与旧接口兼容；默认不发送任何通知。
    return runCleanupForGroup(ctx, groupId);
}

export function getLastCleanupResult(_groupId: string) {
    // 不再保存历史结果；如果需要持久化请在实现里恢复
    return undefined as unknown as CleanupResult | undefined;
}

export function getAllCleanupResults() {
    return new Map<string, CleanupResult>();
}

export function getCleanupStats() {
    return pluginState.config.cleanupStats || { totalCleanups: 0, totalKicked: 0, groupStats: {} };
}
