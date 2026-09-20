import { AdItem } from '../../../generated/protocol/server/C2S/mod/ads/AdItem'
import { Service } from '../../runtime/protocol/ServiceType'

export interface ReqAdd extends Service<'Base'> {
    propId: int
    propNum: int
    bytes: Uint8Array
    bytes1: ArrayBuffer
    adsMap: Map<int, AdItem>
}

export interface ResAdd {
    propId: int
    propNum: int
    result: boolean
}

export interface ReqAddProp extends Service<'Base'> {
    propId: int
    propNum: int
}

export interface ResAddProp {
    propId: int
    propNum: int
    result: boolean
    others?: int[]
    maps?: int //Map<int, int>
}

export enum TaskType {
    kHero = 1,
    kGc,
    kRedDot,
    kSkill,
}

export interface ReqUpdateLv extends Service<'Base'> {
    lv: uint
    tp: TaskType
}

export interface ResUpdateLv {
    lv: int
    gc: int
    success: boolean
}
