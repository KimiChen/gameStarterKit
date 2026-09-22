import { UserInfoOnlyNetBean } from '../../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'

/** 历练场景的 Boss 展示数据。 */
export interface MissionBossView {
    id: int
    hp: int
    owner?: UserInfoOnlyNetBean
    personNum: int
    dieTime: int
    roomId: int
}
