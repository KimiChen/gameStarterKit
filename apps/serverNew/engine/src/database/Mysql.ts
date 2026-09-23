import { DataSource, EntitySchema, MixedList, QueryRunner } from '@arthropoda/typeorm'
import * as mysql2 from 'mysql2'

export interface MysqlConfig {
    host: string
    port?: int
    username: string
    password: string
    database?: string
    logging?: boolean
    // eslint-disable-next-line @typescript-eslint/ban-types
    entities?: MixedList<Function | string | EntitySchema>
    type: 'mysql'
    charset: string
    // poolSize 决定了createQueryRunner同时存在的数量,第三方包默认10个,超过该值再来调用会无限等待
    poolSize?: number
}

export class Mysql {
    readonly link

    constructor(private config: MysqlConfig) {
        // 显式注入驱动，避免 TypeORM 默认选择不支持 caching_sha2_password 的 mysql。
        this.link = new DataSource({ ...config, connectorPackage: 'mysql2', driver: mysql2 })
    }

    initialize() {
        return this.link.initialize()
    }

    destroy() {
        return this.link.destroy()
    }

    client() {
        return this.link
    }

}
