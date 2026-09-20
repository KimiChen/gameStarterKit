import { GameError } from '@arthropoda/game-engine'

export class EquipErrors {
    static readonly EquipSameId = new GameError(170001, '该装备已穿戴')

    static readonly EquipNoWear = new GameError(170002, '该位置装备未穿戴')

    static readonly EquipGemIsInlay = new GameError(170003, '该坑位已镶嵌宝石')

    static readonly EquipGemNoInlay = new GameError(170004, '坑位宝石未镶嵌无法镌刻')

    static readonly EquipGemCanNotEngrave = new GameError(170005, '坑位宝石无法镌刻，配置问题或已达到最大')

    static readonly EquipFashionHasNot = new GameError(170006, '该时装未获得')

    static readonly EquipWearLvLimit = new GameError(170007, '该坑位穿戴的装备等级限制')

    static readonly EquipPropError = new GameError(170008, '装备库数据异常')

    static readonly EquipNotExist = new GameError(170009, '该装备不存在')

    static readonly EquipForgetCd = new GameError(170010, '打造冷却中')

    static readonly EquipBagFull = new GameError(170011, '装备背包已满')

    static readonly EquipDisassembly = new GameError(170012, '该装备已被拆解')

    static readonly FashionNotDurable = new GameError(170013, '神装耐久不足，无法穿戴')

    static readonly EquipLock = new GameError(170014, '该装备已被锁定')
}
