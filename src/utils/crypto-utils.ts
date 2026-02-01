/**
 * 加密工具类
 * 实现 B 站 Cookie 刷新所需的加密算法
 */

import crypto from 'crypto';

/** B 站提供的 RSA 公钥 */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----`;

/**
 * 生成 CorrespondPath
 * 使用 RSA-OAEP 加密 refresh_{timestamp}
 * @param timestamp 毫秒时间戳
 * @returns 加密后的 hex 字符串
 */
export function getCorrespondPath(timestamp: number): string {
    const data = Buffer.from(`refresh_${timestamp}`);

    // 使用公钥加密
    const encrypted = crypto.publicEncrypt(
        {
            key: PUBLIC_KEY_PEM,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        data
    );

    // 转换为 hex 字符串
    return encrypted.toString('hex');
}
