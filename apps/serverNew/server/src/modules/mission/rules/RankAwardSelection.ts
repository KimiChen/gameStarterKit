interface IAwardConf {
    rank: [number, number]
}

export class RankAwardSelection {
    /**
     * 计算剩余次数
     * @param challengeTimes
     * @param freeTimes
     * @param buyTimes
     * @param leftTimes
     * @returns
     */
    static calLeftTimes(challengeTimes: int, freeTimes: int, buyTimes: int, leftTimes: int): int {
        // 付费挑战次数=已挑战次数-免费次数
        const feeTimes = challengeTimes - freeTimes
        if (feeTimes <= 0) {
            // 付费挑战次数未挑战
            leftTimes += buyTimes
        } else {
            leftTimes = buyTimes + leftTimes - feeTimes
        }
        return leftTimes
    }

    /**
     * 获取排名奖励
     */
    static getAwardConfByRank(confList: IAwardConf[], rank: number): IAwardConf | undefined {
        const confItem = confList[0]
        if (rank < confItem.rank[0]) {
            return undefined
        }
        if (rank <= confItem.rank[1]) {
            return confItem
        }
        if (confList.length === 1 || !confList[1]) {
            return undefined
        }
        return this.getAwardConfByRank(confList.slice(1), rank)
    }
}
