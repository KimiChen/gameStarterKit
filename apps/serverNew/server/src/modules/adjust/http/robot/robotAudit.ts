import { getHttpReqClientIp } from '@arthropoda/game-engine'
import { Request } from 'express'

interface RobotRequest extends Request {
    adjustSsoUser?: {
        uid?: string
        name?: string
        account?: string
        isAdmin?: boolean
    }
}

export function auditRobot(req: RobotRequest, fields: Record<string, unknown>, error?: unknown) {
    const record = {
        time: new Date().toISOString(),
        operator: req.adjustSsoUser?.name || req.adjustSsoUser?.account || 'sso-disabled',
        operatorId: req.adjustSsoUser?.uid || '',
        isAdmin: req.adjustSsoUser?.isAdmin === true,
        ip: getHttpReqClientIp(req),
        success: !error,
        ...fields,
        ...(error ? { errorType: error instanceof Error ? error.name : typeof error } : {}),
    }
    const line = `[adjust-robot-audit] ${JSON.stringify(record)}`
    if (error) {
        Log.http.error(line)
    } else {
        Log.http.info(line)
    }
}

export type AdjustRobotRequest = RobotRequest
