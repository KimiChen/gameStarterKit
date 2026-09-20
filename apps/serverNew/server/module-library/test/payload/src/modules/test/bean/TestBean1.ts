import { Bean, OnlyNet } from '@arthropoda/game-engine'

export class TestBean1 extends Bean {
    id: int = 0

    val: int = 0

    @OnlyNet
    testPower: int = 1000
}
