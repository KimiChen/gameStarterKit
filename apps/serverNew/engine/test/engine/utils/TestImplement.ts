import { OnlyNet, OnlyRedis } from '../../../src/differ/hash'

export function OnlySelf(): ClassDecorator {
    return function () {}
}

interface A3 {}

class A1 {}

@OnlySelf()
class A2 implements A3 {
    @OnlyRedis
    a: number = 0
}

console.log(new A2())
