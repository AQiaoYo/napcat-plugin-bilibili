/**
 * API 服务
 * 封装 NapCat Actions 调用
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';

/** 调用 NapCat Action */
export async function callAction(
    ctx: NapCatPluginContext,
    action: Parameters<NapCatPluginContext['actions']['call']>[0],
    payload: Parameters<NapCatPluginContext['actions']['call']>[1]
) {
    return ctx.actions.call(action, payload, ctx.adapterName, ctx.pluginManager.config);
}
