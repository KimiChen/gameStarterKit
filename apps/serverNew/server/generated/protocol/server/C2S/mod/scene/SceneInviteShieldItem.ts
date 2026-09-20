import { UserInfoOnlyNetBean } from '../user/UserInfoOnlyNetBean'

export interface SceneInviteShieldItem {
    /**
     * 玩家ID
     */
    id: int
    /**
     * 玩家信息
     */
    userInfo?: UserInfoOnlyNetBean
}
