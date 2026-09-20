import { ContextEngine } from '../../../src/context/ContextEngine'
import { ContextLogic } from '../../../src/context/ContextLogic'
import { Config } from '../../../src/config/config'
import { GameManager } from '../../../src/manager/GameManager'
import { UserBase } from '../../../src/bean/base/UserBase'
async function asyncMethod1(): Promise<number> {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log('执行返回:,' + Ctx.num)
            resolve(42)
        }, 1000)
    })
}

async function test1(i: number) {
    Ctx.num = i * 111
    console.log('开始:' + i + ',' + Ctx.num)
    await asyncMethod1()
    console.log('结束:' + i + ',' + Ctx.num)
}
GameManager.init()
for (let i = 1; i <= 2; i++) {
    ContextEngine.currentCtx = new ContextEngine()
    test1(i)
}
Ctx.user = new UserBase(22)
console.log(Ctx.userBase)
