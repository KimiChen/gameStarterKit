import { GameDemoBossMemberBean } from '../gameDemo/GameDemoBossMemberBean'

export interface GameDemoBossLobby {
    id: int

    members?: Map<int, GameDemoBossMemberBean>
}
