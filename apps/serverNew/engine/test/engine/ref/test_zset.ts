import { ZSet } from '../../../src/differ/ZSet'

const key = 'Rank:Level'

async function test() {
    const load = ZSet.load(key)

    // await load.zAdd(100.1, 1001)

    // const rs = await load.zRem(1001)
    // console.log(rs) // false

    // const score = await load.zIncrBy(20, 1001)
    // console.log(score) // 20

    // const score = await load.zScore(1001)
    // console.log(score) // 20

    // const data = await load.zRevRank(1001)
    // console.log(data)

    const data = await load.zRevRangeByScoreWithScore(0, 10)
    console.log(data)

    const datas = await load.zRangeWithScore(0, 10)
    console.log(datas)
}

test()
