import { RootBean } from '../differ/bean'
import { HashJson } from '../differ/hashJson'

/** 生成的同步模块的信息  */
export  interface GenModInfo {
    type: typeof RootBean | typeof HashJson
    subMod?: string
}
