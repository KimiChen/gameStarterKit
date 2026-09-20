import { Bean } from '@arthropoda/game-engine'

export class FashionWearBean extends Bean {
    /**
     * 时装类型：1衣服2发饰3发型4五官5脸饰6套装
     */
    type: int = 0

    /**
     * 穿戴时装ID
     */
    cId: int = 0
}
