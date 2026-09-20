import { RankRefBase } from '../../../src/differ/rankRefBase'
import { DiffRank } from '../../../src/differ/DiffRank'

const key = 'Rank:Level'
const uId = 10001080402

async function test() {
    const rank = DiffRank.load(RankRefBase, key)

    // const value = await rank.getTargetRank(uId)

    // const value = await rank.getTargetScore(uId)

    // const value = await rank.getTargetRankInfos(uId)

    // const value = await rank.getRankInfos(0, 10)

    // const value = await rank.getRankIds(0, 10, false)

    // const value = await rank.getRankIdScores(0, 10)

    // const value = await rank.getRankIdScoresByScore(0, 20)

    const value = await rank.set(2002, 100)

    const datas: { id: number; score: number }[] = []
    for (let i = 400; i < 410; i++) {
        datas.push({
            id: i,
            score: i + 10,
        })
    }
    await rank.mSet(datas)

    // const value = await rank.incr(400, 500)

    // for (let i = 400; i < 410; i++) {
    //     await rank.remove(i)
    // }

    // const value = await rank.count()

    // await rank.clear()

    // await rank.expire(10)

    await rank.commit()
    await rank.rollback()

    // console.log(value)

    // const data = await RankRefBase.load(1)
}

test()
