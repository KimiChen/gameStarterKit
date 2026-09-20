export class MissionConfigIndex {
    /** Mission type indexed by scene map id. */
    static readonly missionMapIdToType: { [key: string]: int } = {}

    /** Fixed boss reset seconds within a natural day, indexed by map id. */
    static readonly missionResetTime: { [key: string]: int[] } = {}

    static initialize() {
        for (const [, conf] of C.mission()) {
            for (const [, moreConf] of conf.more) {
                this.missionMapIdToType[moreConf.mapId] = conf.id
                this.missionResetTime[moreConf.mapId] = []

                if (moreConf.resetTime == '') {
                    continue
                }

                for (const time of moreConf.resetTime.split(',')) {
                    const parts = time.split(':')
                    const totalSeconds = Int(parts[0]) * 3600 + Int(parts[1]) * 60 + Int(parts[2])
                    this.missionResetTime[moreConf.mapId].push(totalSeconds)
                }
                this.missionResetTime[moreConf.mapId].sort((a, b) => a - b)
            }
        }

        this.missionResetTime[Param.KuiCowMap] = [Param.KuiCowStart * 3600]
    }
}
