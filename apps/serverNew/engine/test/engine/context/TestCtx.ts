import { ContextEngine } from '../../../src/context/ContextEngine'

async function asyncMethod1(): Promise<number> {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log('执行返回:,' + ContextEngine.currentCtxEngine.uid)
            resolve(42)
        }, 1000)
    })
}

async function test1(i: number) {
    ContextEngine.currentCtxEngine.uid = i * 111
    console.log('开始:' + i + ',' + ContextEngine.currentCtxEngine.uid)
    await asyncMethod1()
    console.log('结束:' + i + ',' + ContextEngine.currentCtxEngine.uid)
}

for (let i = 1; i <= 2; i++) {
    ContextEngine.currentCtxEngine = new ContextEngine()
    test1(i)
}
