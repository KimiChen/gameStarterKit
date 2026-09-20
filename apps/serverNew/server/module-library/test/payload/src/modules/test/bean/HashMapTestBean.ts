import { ClassNetMap, DiffMap, Mod, ServerHashJson } from '@arthropoda/game-engine'

@ClassNetMap
// @Mod
export class HashMapTestBean extends ServerHashJson {
    id: int = 0

    exp: int = 0

    lv: int = 0

    map?: DiffMap<int, int>
}
