import { GameError } from '@arthropoda/game-engine'

export class WeaponErrors {
    static readonly WeaponMaxLv = new GameError(21004, '法宝已满级')

    static readonly WeaponNoOpenSlot = new GameError(21005, '坑位未开启')

    static readonly WeaponNoRare = new GameError(21006, '未拥有该至宝')
}
