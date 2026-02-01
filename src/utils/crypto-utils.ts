/**
 * 加密工具类
 * 实现 B 站 Cookie 刷新所需的加密算法 + 配置加密存储
 */

import crypto from 'crypto';
import os from 'os';

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

// ==================== 配置加密存储相关 ====================

/** 加密算法 */
const ALGORITHM = 'aes-256-gcm';
/** 密钥长度 */
const KEY_LENGTH = 32;
/** IV 长度 */
const IV_LENGTH = 16;
/** Auth Tag 长度 */
const AUTH_TAG_LENGTH = 16;
/** 加密数据前缀，用于识别是否已加密 */
const ENCRYPTED_PREFIX = 'ENC:';

/**
 * 生成基于机器特征的加密密钥
 * 使用机器 ID + 固定盐值派生密钥，保证同一机器上密钥一致
 */
function deriveEncryptionKey(): Buffer {
    // 收集机器特征信息
    const machineInfo = [
        os.hostname(),
        os.platform(),
        os.arch(),
        // 取第一个网卡的 MAC 地址作为额外熵
        ...Object.values(os.networkInterfaces())
            .flat()
            .filter(iface => iface && !iface.internal && iface.mac !== '00:00:00:00:00:00')
            .map(iface => iface?.mac)
            .slice(0, 1),
    ].filter(Boolean).join('|');

    // 固定盐值（可以考虑后续支持用户自定义）
    const salt = 'napcat-plugin-bilibili-cookie-encryption-salt-v1';

    // 使用 PBKDF2 派生密钥
    return crypto.pbkdf2Sync(machineInfo, salt, 100000, KEY_LENGTH, 'sha256');
}

/** 缓存派生的密钥 */
let cachedKey: Buffer | null = null;

/**
 * 获取加密密钥（带缓存）
 */
function getEncryptionKey(): Buffer {
    if (!cachedKey) {
        cachedKey = deriveEncryptionKey();
    }
    return cachedKey;
}

/**
 * 加密字符串
 * @param plaintext 明文
 * @returns 加密后的字符串（带前缀标识）
 */
export function encryptString(plaintext: string): string {
    if (!plaintext) return plaintext;

    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        // 格式: ENC:iv(hex):authTag(hex):encrypted(hex)
        return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (error) {
        // 加密失败时返回原文（降级处理）
        console.error('[Bilibili] 加密失败:', error);
        return plaintext;
    }
}

/**
 * 解密字符串
 * @param ciphertext 密文（带前缀标识）
 * @returns 解密后的明文
 */
export function decryptString(ciphertext: string): string {
    if (!ciphertext) return ciphertext;

    // 检查是否是加密格式
    if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) {
        // 未加密的旧数据，直接返回
        return ciphertext;
    }

    try {
        const key = getEncryptionKey();
        const parts = ciphertext.slice(ENCRYPTED_PREFIX.length).split(':');

        if (parts.length !== 3) {
            throw new Error('Invalid encrypted format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = Buffer.from(parts[2], 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);

        return decrypted.toString('utf8');
    } catch (error) {
        // 解密失败时返回原文（可能是旧格式或损坏的数据）
        console.error('[Bilibili] 解密失败:', error);
        return ciphertext;
    }
}

/**
 * 检查字符串是否已加密
 */
export function isEncrypted(value: string): boolean {
    return value?.startsWith(ENCRYPTED_PREFIX) ?? false;
}
