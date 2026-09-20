import { DiffMap, Mod, ServerHashJson } from '@arthropoda/game-engine'

// @Mod
export class HashJsonNetTestBean extends ServerHashJson {
    id: int = 0

    exp: int = 0

    lv: int = 0

    map?: DiffMap<int, int>

    getNotifyUids(): number[] {
        return [this.id]
    }
}
