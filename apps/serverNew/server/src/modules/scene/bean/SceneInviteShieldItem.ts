import { Bean, OnlyNet } from '@arthropoda/game-engine'
import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'

export class SceneInviteShieldItem extends Bean {
    /**
     * 玩家ID
     */
    id: int = 0

    /**
     * 玩家信息
     */
    @OnlyNet
    userInfo?: UserInfoOnlyNetBean
}
