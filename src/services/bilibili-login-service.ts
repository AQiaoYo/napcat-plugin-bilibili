/**
 * B 站扫码登录服务
 * 提供二维码生成、状态轮询、Cookie 管理功能
 */

/**
 * B 站扫码登录服务
 * 提供二维码生成、状态轮询、Cookie 管理功能
 */

import { pluginState } from '../core/state';
import { performCookieRefresh } from './cookie-refresh-service';
import type {
    BilibiliCredential,
    BilibiliUserInfo,
    BilibiliApiResponse,
    QrCodeGenerateResult,
    QrCodePollResult,
} from '../types';
import { QrCodeLoginStatus } from '../types';

/** 自动刷新定时器 */
let refreshTimer: NodeJS.Timeout | null = null;

// ==================== API 接口 ====================

/** 获取二维码 API */
const QRCODE_GENERATE_API = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate';

/** 轮询二维码状态 API */
const QRCODE_POLL_API = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll';

/** 获取用户信息 API */
const USER_INFO_API = 'https://api.bilibili.com/x/web-interface/nav';

/** 默认请求头 */
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
};

// ==================== 二维码会话管理 ====================

/** 当前活跃的二维码会话 */
let currentQrSession: {
    qrcode_key: string;
    url: string;
    createTime: number;
} | null = null;

/** 二维码有效期 (毫秒) */
const QRCODE_TIMEOUT = 180 * 1000; // 180 秒

// ==================== 登录服务函数 ====================

/**
 * 生成登录二维码
 * @returns 二维码信息
 */
export async function generateQrCode(): Promise<QrCodeGenerateResult | null> {
    try {
        pluginState.logDebug('正在生成 B 站登录二维码...');

        const response = await fetch(QRCODE_GENERATE_API, {
            method: 'GET',
            headers: DEFAULT_HEADERS,
        });

        if (!response.ok) {
            pluginState.log('error', `生成二维码失败: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json() as BilibiliApiResponse<QrCodeGenerateResult>;

        if (data.code !== 0) {
            pluginState.log('error', `生成二维码失败: ${data.message}`);
            return null;
        }

        // 保存当前会话
        currentQrSession = {
            qrcode_key: data.data.qrcode_key,
            url: data.data.url,
            createTime: Date.now(),
        };

        pluginState.log('info', '二维码生成成功，等待扫码...');

        return {
            url: data.data.url,
            qrcode_key: data.data.qrcode_key,
        };
    } catch (error) {
        pluginState.log('error', '生成二维码异常:', error);
        return null;
    }
}

/**
 * 轮询二维码登录状态
 * @param qrcode_key 二维码密钥 (可选，默认使用当前会话)
 * @returns 登录状态
 */
export async function pollQrCodeStatus(qrcode_key?: string): Promise<QrCodePollResult> {
    const key = qrcode_key || currentQrSession?.qrcode_key;

    if (!key) {
        return {
            status: QrCodeLoginStatus.EXPIRED,
            message: '无有效的二维码会话，请重新生成',
        };
    }

    // 检查是否超时
    if (currentQrSession && Date.now() - currentQrSession.createTime > QRCODE_TIMEOUT) {
        currentQrSession = null;
        return {
            status: QrCodeLoginStatus.EXPIRED,
            message: '二维码已过期，请重新生成',
        };
    }

    try {
        const url = `${QRCODE_POLL_API}?qrcode_key=${encodeURIComponent(key)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: DEFAULT_HEADERS,
        });

        if (!response.ok) {
            pluginState.log('error', `轮询二维码状态失败: HTTP ${response.status}`);
            return {
                status: QrCodeLoginStatus.EXPIRED,
                message: '网络请求失败',
            };
        }

        const data = await response.json() as BilibiliApiResponse<{
            url: string;
            refresh_token: string;
            timestamp: number;
            code: number;
            message: string;
        }>;

        if (data.code !== 0) {
            pluginState.log('error', `轮询二维码状态失败: ${data.message}`);
            return {
                status: QrCodeLoginStatus.EXPIRED,
                message: data.message,
            };
        }

        const pollData = data.data;
        const status = pollData.code as QrCodeLoginStatus;

        switch (status) {
            case QrCodeLoginStatus.WAITING:
                return {
                    status: QrCodeLoginStatus.WAITING,
                    message: '等待扫码',
                };

            case QrCodeLoginStatus.SCANNED:
                return {
                    status: QrCodeLoginStatus.SCANNED,
                    message: '已扫码，请在手机上确认',
                };

            case QrCodeLoginStatus.EXPIRED:
                currentQrSession = null;
                return {
                    status: QrCodeLoginStatus.EXPIRED,
                    message: '二维码已过期',
                };

            case QrCodeLoginStatus.SUCCESS:
                // 解析 Cookie
                const credential = parseCredentialFromUrl(pollData.url, pollData.refresh_token);
                if (credential) {
                    // 保存凭据
                    await saveCredential(credential);
                    currentQrSession = null;
                    pluginState.log('info', '扫码登录成功！');
                    return {
                        status: QrCodeLoginStatus.SUCCESS,
                        message: '登录成功',
                        credential,
                    };
                } else {
                    return {
                        status: QrCodeLoginStatus.EXPIRED,
                        message: '解析登录凭据失败',
                    };
                }

            default:
                return {
                    status: QrCodeLoginStatus.EXPIRED,
                    message: pollData.message || '未知状态',
                };
        }
    } catch (error) {
        pluginState.log('error', '轮询二维码状态异常:', error);
        return {
            status: QrCodeLoginStatus.EXPIRED,
            message: '请求异常',
        };
    }
}

/**
 * 从登录成功的 URL 中解析凭据
 */
function parseCredentialFromUrl(url: string, refreshToken: string): BilibiliCredential | null {
    try {
        if (!url) return null;

        const queryString = url.split('?')[1];
        if (!queryString) return null;

        const params = new URLSearchParams(queryString);

        const sessdata = params.get('SESSDATA') || '';
        const bili_jct = params.get('bili_jct') || '';
        const dedeuserid = params.get('DedeUserID') || '';

        if (!sessdata || !bili_jct || !dedeuserid) {
            pluginState.log('error', '解析凭据失败: 缺少必要的 Cookie 字段');
            return null;
        }

        return {
            sessdata: decodeURIComponent(sessdata),
            bili_jct,
            dedeuserid,
            refresh_token: refreshToken,
            login_time: Date.now(),
        };
    } catch (error) {
        pluginState.log('error', '解析凭据异常:', error);
        return null;
    }
}

/**
 * 保存登录凭据到配置
 */
export async function saveCredential(credential: BilibiliCredential): Promise<void> {
    try {
        pluginState.config.credential = credential;
        pluginState.saveConfig();
        pluginState.log('info', 'B 站登录凭据已保存');
    } catch (error) {
        pluginState.log('error', '保存凭据失败:', error);
    }
}

/**
 * 获取当前保存的凭据
 */
export function getCredential(): BilibiliCredential | null {
    return pluginState.config.credential || null;
}

/**
 * 清除登录凭据
 */
export async function clearCredential(): Promise<void> {
    try {
        pluginState.config.credential = undefined;
        pluginState.saveConfig();
        pluginState.log('info', 'B 站登录凭据已清除');
    } catch (error) {
        pluginState.log('error', '清除凭据失败:', error);
    }
}

/**
 * 检查是否已登录
 */
export function isLoggedIn(): boolean {
    const credential = getCredential();
    return !!(credential?.sessdata && credential?.bili_jct && credential?.dedeuserid);
}

/**
 * 获取当前登录用户信息
 */
export async function getUserInfo(): Promise<BilibiliUserInfo | null> {
    const credential = getCredential();
    if (!credential) {
        return null;
    }

    try {
        const response = await fetch(USER_INFO_API, {
            method: 'GET',
            headers: {
                ...DEFAULT_HEADERS,
                'Cookie': `SESSDATA=${credential.sessdata}; bili_jct=${credential.bili_jct}; DedeUserID=${credential.dedeuserid}`,
            },
        });

        if (!response.ok) {
            pluginState.log('error', `获取用户信息失败: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json() as BilibiliApiResponse<BilibiliUserInfo>;

        if (data.code !== 0) {
            pluginState.log('warn', `获取用户信息失败: ${data.message}`);
            // 如果返回未登录，清除凭据
            if (data.code === -101) {
                await clearCredential();
            }
            return null;
        }

        return data.data;
    } catch (error) {
        pluginState.log('error', '获取用户信息异常:', error);
        return null;
    }
}

/**
 * 获取登录状态摘要
 */
export async function getLoginStatus(): Promise<{
    isLoggedIn: boolean;
    userInfo: BilibiliUserInfo | null;
    credential: Partial<BilibiliCredential> | null;
}> {
    const loggedIn = isLoggedIn();
    let userInfo: BilibiliUserInfo | null = null;
    let credential: Partial<BilibiliCredential> | null = null;

    if (loggedIn) {
        userInfo = await getUserInfo();
        const cred = getCredential();
        if (cred) {
            // 只返回部分信息，不暴露敏感数据
            credential = {
                dedeuserid: cred.dedeuserid,
                login_time: cred.login_time,
            };
        }
    }

    return {
        isLoggedIn: loggedIn && !!userInfo?.isLogin,
        userInfo,
        credential,
    };
}

/**
 * 获取当前二维码会话状态
 */
export function getQrSessionStatus(): {
    hasSession: boolean;
    isExpired: boolean;
    remainingTime: number;
} {
    if (!currentQrSession) {
        return {
            hasSession: false,
            isExpired: true,
            remainingTime: 0,
        };
    }

    const elapsed = Date.now() - currentQrSession.createTime;
    const remaining = Math.max(0, QRCODE_TIMEOUT - elapsed);

    return {
        hasSession: true,
        isExpired: remaining <= 0,
        remainingTime: Math.floor(remaining / 1000),
    };
}

/**
 * 启动自动刷新服务
 * 每天检查一次 Cookie 状态
 */
export function startAutoRefreshService() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    pluginState.log('info', '启动 Cookie 自动刷新服务');

    // 立即检查一次
    performCookieRefresh().catch(e => {
        pluginState.log('error', '初始 Cookie 检查失败:', e);
    });

    // 每 24 小时检查一次
    refreshTimer = setInterval(() => {
        performCookieRefresh().catch(e => {
            pluginState.log('error', '自动 Cookie 刷新失败:', e);
        });
    }, 24 * 60 * 60 * 1000);
}

/**
 * 停止自动刷新服务
 */
export function stopAutoRefreshService() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
        pluginState.log('info', '已停止 Cookie 自动刷新服务');
    }
}
