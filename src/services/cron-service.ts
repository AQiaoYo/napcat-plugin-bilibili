/**
 * 定时任务服务
 * 负责管理 cron 定时清理任务的启动、停止和调度
 */

/**
 * Cron 服务占位实现
 *
 * 说明：保留接口以便新插件能够重用定时任务管理逻辑。
 * 当前实现为最小化占位：不创建真实任务，仅提供校验和空操作。
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import { pluginState } from '../core/state';

// Cron 功能已从模板中移除。
// 如果将来需要计划任务，请在 `src/services/cron-service.ts` 中实现并恢复相应导出。