import { RootBean } from '../differ/bean'
import { HashJson } from '../differ/hashJson'

/** 生成的同步模块的信息  */
export interface ModInfo {
    id: int
    modName: string
    type: typeof RootBean | typeof HashJson
    subMod?: string
}
