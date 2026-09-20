export class AchieveProgressionRules {
    public static getAchieveId(sort: int): int {
        return sort / 100000
    }

    public static getAchieveLevel(achievePoint: int): int {
        let lv = 0
        const conf = C.achievement_medal()
        conf.forEach((f) => {
            if (achievePoint < f.need) {
                return
            }
            lv = f.id
        })
        return lv
    }
}
