import { Service } from '../../runtime/protocol/ServiceType'

export interface ReqWeaponCleanse extends Service<'Base'> {
    slotId: int // 坑位id
    propId: int // 额外消耗的道具id
}
export interface ResWeaponCleanse {}

export interface ReqWeaponDrop extends Service<'Base'> {
    slotId: int // 坑位id
}
export interface ResWeaponDrop {}

export interface ReqWeaponLvUp extends Service<'Base'> {}
export interface ResWeaponLvUp {}

export interface ReqWeaponReplace extends Service<'Base'> {
    slotId: int // 坑位id
}

export interface ResWeaponReplace {}

export interface ReqWeaponWear extends Service<'Base'> {
    rareId: int //至宝Id
}
export interface ResWeaponWear {}
