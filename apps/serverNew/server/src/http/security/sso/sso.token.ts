import { createHmac, timingSafeEqual } from 'crypto'
import { SsoSessionPayload } from './sso.types'

function signature(payload: string, secret: string) {
    return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createSsoSessionToken(payload: SsoSessionPayload, secret: string) {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    return `${encodedPayload}.${signature(encodedPayload, secret)}`
}

export function parseSsoSessionToken(token: string, secret: string): SsoSessionPayload | null {
    const [encodedPayload, encodedSignature, ...rest] = token.split('.')
    if (!encodedPayload || !encodedSignature || rest.length > 0) {
        return null
    }

    const expectedSignature = signature(encodedPayload, secret)
    const actualBuffer = Buffer.from(encodedSignature)
    const expectedBuffer = Buffer.from(expectedSignature)
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
        return null
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SsoSessionPayload
        if (!payload.openId || !payload.sessionId || !payload.expiresAt) {
            return null
        }
        return payload
    } catch {
        return null
    }
}
