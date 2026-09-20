export type AdjustRole = 'readonly' | 'readwrite'

export interface SsoRemoteUser {
    uid: string
    name: string
    account: string
    phone: string
    avatar: string
}

export interface SsoSessionPayload {
    openId: string
    sessionId: string
    issuedAt: number
    expiresAt: number
}

export interface SsoSessionRecord extends SsoSessionPayload, SsoRemoteUser {
    loginIp: string
}

export interface AdjustSsoUser {
    uid: string
    name: string
    account: string
    phone: string
    avatar: string
    role: AdjustRole
    isAdmin: boolean
}
