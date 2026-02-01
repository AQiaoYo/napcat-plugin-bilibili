/**
 * B 站 Cookie 自动刷新服务
 * 实现 Cookie 的检查、刷新和持久化
 */

import { pluginState } from '../core/state';
import { getCredential, saveCredential } from './bilibili-login-service';
import { getCorrespondPath } from '../utils/crypto-utils';
import type { BilibiliCredential, BilibiliApiResponse } from '../types';

// ==================== API 接口 ====================

/** 检查 Cookie 是否需要刷新 */
const COOKIE_INFO_API = 'https://passport.bilibili.com/x/passport-login/web/cookie/info';

/** 获取 refresh_csrf (HTML) */
const CORRESPOND_API = 'https://www.bilibili.com/correspond/1/';

/** 刷新 Cookie */
const COOKIE_REFRESH_API = 'https://passport.bilibili.com/x/passport-login/web/cookie/refresh';

/** 确认刷新 */
const CONFIRM_REFRESH_API = 'https://passport.bilibili.com/x/passport-login/web/confirm/refresh';

/** 默认请求头 */
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
};

// ==================== 工具函数 ====================

/**
 * 解析 Set-Cookie 头
 * @param headers 响应头
 * @returns 解析后的 Cookie 对象
 */
function parseSetCookie(headers: Headers): Partial<BilibiliCredential> {
    const cookies: Partial<BilibiliCredential> = {};
    const setCookie = headers.get('set-cookie');

    if (!setCookie) return cookies;

    // 处理多个 Set-Cookie (fetch API 可能合并为一个字符串，用逗号分隔，或者返回数组)
    // 注意：fetch API 的 headers.get('set-cookie') 可能只返回第一个或者合并后的字符串
    // 这里做简单的解析尝试

    const parts = setCookie.split(/,(?=\s*\w+=)/); // 尝试分割多个 cookie

    parts.forEach(part => {
        if (part.includes('SESSDATA=')) {
            const match = part.match(/SESSDATA=([^;]+)/);
            if (match) cookies.sessdata = decodeURIComponent(match[1]);
        }
        if (part.includes('bili_jct=')) {
            const match = part.match(/bili_jct=([^;]+)/);
            if (match) cookies.bili_jct = match[1];
        }
        if (part.includes('DedeUserID=')) {
            const match = part.match(/DedeUserID=([^;]+)/);
            if (match) cookies.dedeuserid = match[1];
        }
    });

    return cookies;
}

/**
 * 生成完整的 Cookie 字符串
 */
function getCookieString(cred: BilibiliCredential): string {
    return `SESSDATA=${encodeURIComponent(cred.sessdata)}; bili_jct=${cred.bili_jct}; DedeUserID=${cred.dedeuserid}`;
}

// ==================== 核心逻辑 ====================

/**
 * 检查是否需要刷新 Cookie
 * @returns { refresh: boolean, timestamp: number }
 */
async function checkNeedRefresh(credential: BilibiliCredential): Promise<{ refresh: boolean; timestamp: number } | null> {
    try {
        const url = `${COOKIE_INFO_API}?csrf=${credential.bili_jct}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...DEFAULT_HEADERS,
                'Cookie': getCookieString(credential)
            }
        });

        const data = await response.json() as BilibiliApiResponse<{
            refresh: boolean;
            timestamp: number;
        }>;

        if (data.code !== 0) {
            pluginState.log('warn', `检查 Cookie 状态失败: ${data.message} (${data.code})`);
            return null;
        }

        return data.data;
    } catch (error) {
        pluginState.log('error', '检查 Cookie 状态异常:', error);
        return null;
    }
}

/**
 * 获取 refresh_csrf
 */
async function getRefreshCsrf(correspondPath: string, credential: BilibiliCredential): Promise<string | null> {
    try {
        const url = `${CORRESPOND_API}${correspondPath}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...DEFAULT_HEADERS,
                'Cookie': getCookieString(credential)
            }
        });

        const html = await response.text();

        // 解析 <div id="1-name">xxx</div>
        const match = html.match(/<div id="1-name">([^<]+)<\/div>/);
        if (match && match[1]) {
            return match[1];
        }

        pluginState.log('warn', '无法从页面获取 refresh_csrf');
        return null;
    } catch (error) {
        pluginState.log('error', '获取 refresh_csrf 异常:', error);
        return null;
    }
}

/**
 * 执行 Cookie 刷新操作
 */
export async function performCookieRefresh(): Promise<boolean> {
    const credential = getCredential();
    if (!credential || !credential.refresh_token) {
        pluginState.logDebug('未登录或缺少 refresh_token，跳过刷新');
        return false;
    }

    try {
        // 1. 检查是否需要刷新
        pluginState.log('info', '开始检查 B 站 Cookie 状态...');
        const checkResult = await checkNeedRefresh(credential);

        if (!checkResult) return false;

        if (!checkResult.refresh) {
            pluginState.log('info', 'Cookie 状态良好，无需刷新');
            return true;
        }

        pluginState.log('info', '检测到 Cookie 需要刷新，开始刷新流程...');

        // 2. 生成 CorrespondPath
        const correspondPath = getCorrespondPath(checkResult.timestamp);

        // 3. 获取 refresh_csrf
        const refreshCsrf = await getRefreshCsrf(correspondPath, credential);
        if (!refreshCsrf) {
            pluginState.log('error', '获取 refresh_csrf 失败，终止刷新');
            return false;
        }

        // 保存旧的 refresh_token 用于确认
        const oldRefreshToken = credential.refresh_token;

        // 4. 请求刷新 Cookie
        const params = new URLSearchParams();
        params.append('csrf', credential.bili_jct);
        params.append('refresh_csrf', refreshCsrf);
        params.append('source', 'main_web');
        params.append('refresh_token', oldRefreshToken);

        const refreshResponse = await fetch(COOKIE_REFRESH_API, {
            method: 'POST',
            headers: {
                ...DEFAULT_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': getCookieString(credential)
            },
            body: params
        });

        const refreshData = await refreshResponse.json() as BilibiliApiResponse<{
            status: number;
            message: string;
            refresh_token: string;
        }>;

        if (refreshData.code !== 0) {
            pluginState.log('error', `刷新 Cookie 失败: ${refreshData.message}`);
            return false;
        }

        // 解析新 Cookie
        // 注意：这里需要从 headers 中获取 Set-Cookie
        // 由于 fetch API 在某些环境下可能对 Set-Cookie 处理有限制，
        // 我们假设 headers.get('set-cookie') 能正常工作
        const newCookies = parseSetCookie(refreshResponse.headers);
        const newRefreshToken = refreshData.data.refresh_token;

        if (!newCookies.sessdata || !newCookies.bili_jct) {
            pluginState.log('error', '刷新响应未包含完整的 Cookie');
            return false;
        }

        // 构造新凭据
        const newCredential: BilibiliCredential = {
            ...credential,
            sessdata: newCookies.sessdata || credential.sessdata,
            bili_jct: newCookies.bili_jct || credential.bili_jct,
            dedeuserid: newCookies.dedeuserid || credential.dedeuserid,
            refresh_token: newRefreshToken,
            login_time: Date.now()
        };

        // 5. 确认刷新
        // 这一步非常重要，必须使用新 Cookie 确认旧 refresh_token
        pluginState.log('info', 'Cookie 刷新成功，正在确认更新...');

        const confirmParams = new URLSearchParams();
        confirmParams.append('csrf', newCredential.bili_jct);
        confirmParams.append('refresh_token', oldRefreshToken);

        const confirmResponse = await fetch(CONFIRM_REFRESH_API, {
            method: 'POST',
            headers: {
                ...DEFAULT_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': getCookieString(newCredential)
            },
            body: confirmParams
        });

        const confirmData = await confirmResponse.json() as BilibiliApiResponse<any>;

        if (confirmData.code !== 0) {
            pluginState.log('warn', `确认刷新失败: ${confirmData.message}，但新 Cookie 可能已生效`);
            // 即便确认失败，我们通常也应该保存新 Cookie，因为服务端可能已经生效
        }

        // 保存新凭据
        await saveCredential(newCredential);
        pluginState.log('info', 'B 站 Cookie 刷新并保存成功！');
        return true;

    } catch (error) {
        pluginState.log('error', 'Cookie 刷新流程异常:', error);
        return false;
    }
}
