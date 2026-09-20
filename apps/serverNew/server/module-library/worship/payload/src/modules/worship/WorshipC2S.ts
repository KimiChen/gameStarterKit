import { Service } from '../../runtime/protocol/ServiceType'

export interface ReqWorshopLotter extends Service<'Base'> {
    slotId: int // 坑位id
    propId: int // 道具id
}
export interface ResWorshopLotter {
    skillId: int // 技能Id
}

export interface ReqWorshopReplace extends Service<'Base'> {
    slotId: int // 坑位id
}
export interface ResWorshopReplace {}
