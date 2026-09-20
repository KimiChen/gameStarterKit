import { ContextEngine } from '../../../src/context/ContextEngine'
import { asyncHook } from '../../../src/context/context'

asyncHook.enable()

class Root {
    constructor(
        public id: number,
        public ctx: ContextEngine,
    ) { }
}
const loadedMap = new Map<string, Root>()

class Task {
    constructor(
        public ctx: ContextEngine,
        public ids: int[],
    ) { }

    loadded(id: number) {
        const ctx = ContextEngine.currentCtx
        const key = id.toString()
        let loaded = loadedMap.get(key)
        if (loaded) {
            //已经被锁定
            loaded.ctx.todoCalls.push(this)
            this.onDone()
            throw [id, this]
        }
        loaded = new Root(id, ctx)
        loadedMap.set(key, loaded)
        return loaded
    }

    onDone() {
        for (const id of this.ids) {
            const key = id.toString()
            loadedMap.delete(key)
        }
    }

    async load(ms: number): Promise<Root> {
        return new Promise((resolve, reject) =>
            setTimeout(() => {
                try {
                    resolve(this.loadded(ms))
                } catch (error) {
                    reject(error) // 如果出现错误，则使用 reject() 来拒绝 Promise
                }
            }, ms),
        )
    }

    async action() {
        const u1 = await this.load(this.ids[0])
        const u2 = await this.load(this.ids[1])
        console.log('完成业务', u1.id, u2.id)
    }
}

async function doTask(task: Task) {
    try {
        await task.action()
    } catch (e) {
        if (Array.isArray(e)) {
            console.log(`锁定${e[0]}失败，等待重新执行`, task.ids)
        }
    }
    task.onDone()
}

async function doGameAction(ids: number[]) {
    ContextEngine.currentCtx = new ContextEngine()
    const task = new Task(ContextEngine.currentCtx, ids)
    await doTask(task)
    for (const todoTask of task.ctx.todoCalls) {
        todoTask.currentCtx = ContextEngine.currentCtx = new ContextEngine()
        await doTask(todoTask)
    }
}

doGameAction([101, 1102]).catchError('')
doGameAction([1102, 101]).catchError('')
