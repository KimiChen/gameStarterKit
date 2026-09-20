import { BaseEntity, QueryRunner } from '@arthropoda/typeorm'
import { md5 } from '../utils/common'
import { Mysql, MysqlConfig } from './Mysql'
import { PlatformMysqlConfig } from '../typings/conf-platform'

export class DBExport {
    public static get client(): Mysql {
        return DB.client
    }

    public static get entityManager() {
        return DB.entityManager
    }

    static async startTransaction<T>(cb: (runner: QueryRunner) => Promise<T> | T): Promise<T> {
        return DB.startTransaction(cb)
    }
}
export class DB {
    private static dbs: { [k: string]: Mysql } = {}

    // 方便调用
    public static client: Mysql

    //entity们默认的entityManager
    public static get entityManager() {
        return DB.client.client().manager
    }

    // 初始化所有的db
    public static async init(beans: { new (): BaseEntity }[], centerConf: PlatformMysqlConfig) {
        await this.initClient(beans, centerConf)
    }

    public static async clear() {
        for (const key in this.dbs) {
            await this.dbs[key].destroy()
        }
        this.dbs = {}
    }

    private static async initClient(beans: { new (): BaseEntity }[], myConf: PlatformMysqlConfig) {
        const mysqlConf = <MysqlConfig>myConf
        if (!mysqlConf) {
            throw new Error('centerSql未配置')
        }
        const key = md5(mysqlConf.host + mysqlConf.username)
        if (this.dbs[key]) {
            return this.dbs[key]
        }
        // 把center相关的entity加入
        mysqlConf.entities = beans
        mysqlConf.type = 'mysql'

        const db = new Mysql(mysqlConf)
        this.dbs[key] = db
        this.client = this.dbs[key]

        try {
            await db.initialize()
        } catch (error: any) {
            throw new Error('Mysql Initialize Error:' + error.message)
        }

        return this.dbs[key]
    }

    /**
     * 事务执行
     * 1.回调结束时自动commit
     * 2.可以在业务里主动提交commit或rollback,不会导致该函数报错
     * 3.不会捕获抛出的错误,需要自己捕获
     * 4.原封不动透传返回回调中返回的数据
     */
    static async startTransaction<T>(cb: (runner: QueryRunner) => Promise<T> | T): Promise<T> {
        const runner = DB.client.link.createQueryRunner()
        await runner.startTransaction()
        try {
            const res = await cb(runner)
            if (runner.isTransactionActive) {
                await runner.commitTransaction()
            }
            return res
        } catch (err) {
            if (runner.isTransactionActive) {
                await runner.rollbackTransaction()
            }
            throw err
        } finally {
            await runner.release()
        }
    }
}
