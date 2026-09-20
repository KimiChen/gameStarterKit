import { log, mt_rand } from '@arthropoda/game-engine'
import { SystemErrors } from '../errors/SystemErrors'

interface IConfigPro {
    pro: number // 权重变量名
}

export class GameRandom {
    static rand(min: number, max: number): int {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    /**
     * 通过数组元素配置对象的权重变量随机
     * @param confList 配置对象
     * @returns
     */
    static randomByWeightConfig<T extends IConfigPro>(confList: T[]) {
        let sum = 0
        for (const value of confList) {
            const pro = value.pro
            sum += pro
        }
        // 未配置概率
        if (sum <= 0) {
            throw new Error('未配置概率')
        }
        const ran = Math.floor(Math.random() * sum) + 1
        for (const value of confList) {
            const pro = value.pro
            sum -= pro
            if (ran > sum) {
                return value
            }
        }
        throw new Error('未随机到')
    }

    static randomByWeightConfigMap<T extends IConfigPro>(confMap: ConfigReadonlyMap<any, T>) {
        let sum = 0
        for (const [, value] of confMap) {
            const pro = value.pro
            sum += pro
        }
        // 未配置概率
        if (sum <= 0) {
            throw new Error('未配置概率')
        }
        const ran = Math.floor(Math.random() * sum) + 1
        for (const [, value] of confMap) {
            const pro = value.pro
            sum -= pro
            if (ran > sum) {
                return value
            }
        }
        throw new Error('未随机到')
    }

    /**
     * 根据权重随机
     * @param goodList 索引=>权重
     * @returns
     */
    static randomByWeight<T>(goodList: Map<T, number>): T | number | null {
        if (goodList.size <= 1) {
            return goodList.keys().next().value
        }

        let totalWeight = 0
        for (const weight of goodList.values()) {
            totalWeight += weight
        }

        if (totalWeight <= 0) {
            throw SystemErrors.SysParamError
        }

        const randNum = Math.floor(Math.random() * totalWeight) + 1
        let currentWeight = totalWeight
        for (const [id, weight] of goodList) {
            currentWeight -= weight
            if (randNum > currentWeight) {
                return id
            }
        }

        return null
    }

    /**
     * 根据权重取多条数据
     */
    static randomManyByWeightConfig<T extends IConfigPro>(confList: T[], num: int = 1) {
        const count = confList.length
        if (count < num) {
            // 配置里的数量一定得大于读取的数量
            return []
        }
        if (count == num) {
            return confList
        }

        let sum = 0
        const randomArr = new Map<int, int>()
        for (const index in confList) {
            randomArr.set(parseInt(index), confList[index].pro)
            sum += confList[index].pro
        }
        const returnArr: T[] = []
        let index: int = 0
        for (let i = 0; i < num; i++) {
            if (i > 0) {
                sum -= randomArr.get(index)!
                randomArr.delete(index)
            }
            const ran = mt_rand(1, sum)
            let tempSum = sum

            // 计算此次随机的key
            for (const [k, v] of randomArr) {
                tempSum -= v
                if (ran > tempSum) {
                    index = k
                    break
                }
            }
            returnArr.push(confList[index])
        }
        return returnArr
    }

    static getProbability(probability: int, precision: int = 10000) {
        if (!probability) {
            return false
        }

        if (precision < 100) {
            log.error('概率基数不能小于 100')
            return false
        }

        if (probability >= precision) {
            return true
        }

        const rand = GameRandom.rand(1, precision)
        return rand <= probability
    }

    static randomStr(length: int): string {
        let hash = ''
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz'
        const max = chars.length - 1
        for (let i = 0; i < length; i++) {
            hash += chars[Math.floor(Math.random() * max)]
        }
        return hash
    }
}
