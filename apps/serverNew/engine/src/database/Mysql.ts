import { DataSource, EntitySchema, MixedList, QueryRunner } from '@arthropoda/typeorm'

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
        this.link = new DataSource(config)
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
