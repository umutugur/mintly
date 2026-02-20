import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config.js';
import { ApiError } from '../errors.js';
function getString(input) {
    return typeof input === 'string' ? input : undefined;
}
export function issueTokenPair(params) {
    const config = getConfig();
    const accessPayload = {
        sub: params.userId,
        email: params.email,
        type: 'access',
    };
    const refreshPayload = {
        sub: params.userId,
        email: params.email,
        type: 'refresh',
        jti: randomUUID(),
    };
    const accessToken = jwt.sign(accessPayload, config.jwtAccessSecret, {
        algorithm: 'HS256',
        expiresIn: `${config.accessTtlMin}m`,
    });
    const refreshToken = jwt.sign(refreshPayload, config.jwtRefreshSecret, {
        algorithm: 'HS256',
        expiresIn: `${config.refreshTtlDays}d`,
    });
    const refreshExpiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000);
    return {
        accessToken,
        refreshToken,
        refreshTokenHash: hashRefreshToken(refreshToken),
        refreshExpiresAt,
    };
}
export function verifyAccessToken(token) {
    const config = getConfig();
    try {
        const decoded = jwt.verify(token, config.jwtAccessSecret, {
            algorithms: ['HS256'],
        });
        const payload = decoded;
        const sub = getString(payload.sub);
        const email = getString(payload.email);
        const type = getString(payload.type);
        if (!sub || !email || type !== 'access') {
            throw new Error('Invalid token payload');
        }
        return {
            sub,
            email,
            type: 'access',
        };
    }
    catch {
        throw new ApiError({
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired access token',
            statusCode: 401,
        });
    }
}
export function verifyRefreshToken(token) {
    const config = getConfig();
    try {
        const decoded = jwt.verify(token, config.jwtRefreshSecret, {
            algorithms: ['HS256'],
        });
        const payload = decoded;
        const sub = getString(payload.sub);
        const email = getString(payload.email);
        const type = getString(payload.type);
        const jti = getString(payload.jti);
        if (!sub || !email || !jti || type !== 'refresh') {
            throw new Error('Invalid token payload');
        }
        return {
            sub,
            email,
            jti,
            type: 'refresh',
        };
    }
    catch {
        throw new ApiError({
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid or expired refresh token',
            statusCode: 401,
        });
    }
}
export function hashRefreshToken(token) {
    return createHash('sha256').update(token).digest('hex');
}
