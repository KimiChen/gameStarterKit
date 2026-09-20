import fs from 'fs'
import path from 'path'
import json5 from 'json5'
import { Config, ServiceConfig } from '@arthropoda/game-engine'

export interface FixedServerAddress {
    sid: number
    host: string
    port: number
    internalHost: string
    internalPort: number
    healthPort: number
}

export class FixedServerEndpoint {
    static configPath(fileName: string) {
        const versioned = path.resolve(ROOT_PATH, 'config', 'platforms', PLATFORM_TAG, fileName)
        if (fs.existsSync(versioned)) {
            return versioned
        }
        return path.resolve(ROOT_PATH, 'config', fileName)
    }

    static get(sid: number): FixedServerAddress | undefined {
        let config: Partial<ServiceConfig> = { sid }
        try {
            config = Config.createDefaultServiceConf(sid, CP.platform.fixedServer)
        } catch {
            // 兼容只提供独立 sN.json5、尚未迁移默认区服配置的线路。
        }

        const filePath = this.configPath(`s${sid}.json5`)
        if (fs.existsSync(filePath)) {
            config = { ...config, ...json5.parse(fs.readFileSync(filePath, 'utf8')) }
        }
        if (Number(config.sid) !== sid || !config.clientHost || !config.clientPort) {
            throw new Error(`invalid fixed server config: ${filePath}`)
        }
        return {
            sid,
            host: config.clientHost,
            port: Number(config.clientPort),
            internalHost:
                !config.internalHost || config.internalHost === '0.0.0.0' ? config.clientHost : config.internalHost,
            internalPort: Number(config.internalPort || Number(config.clientPort) + 10000),
            healthPort: Number(config.healthPort || Number(config.clientPort) + 20000),
        }
    }

    static websocketUrl(sid: number) {
        const endpoint = this.get(sid)
        return endpoint ? `ws://${endpoint.host}:${endpoint.port}` : undefined
    }

    static internalActionUrl(sid: number) {
        const endpoint = this.get(sid)
        return endpoint ? `http://${endpoint.internalHost}:${endpoint.internalPort}/internal/action` : undefined
    }

    static healthUrl(sid: number) {
        const endpoint = this.get(sid)
        return endpoint ? `http://${endpoint.internalHost}:${endpoint.healthPort}` : undefined
    }
}
