import * as console from 'console'
import path from 'path'
import { RecProject } from './record/RecProject'

/**
 * 协议 / Bean / 模块索引生成入口。
 *
 * 职责边界：这里只负责「按顺序驱动各生成步骤并落盘」，具体职责在各自的生成器里
 * （`GenBean` Bean 记录与 C2S Bean、`GenProtocol` 协议表与 Action 汇总）。
 * ⛔ 不再有 `-gPb` 开关：PB 产物与其生成器已随 P6 删除，不存在「强制生成 pb」的路径。
 */
class AutoGen {
    async gen() {
        const recProject = RecProject.instance.init(path.resolve(__dirname, '../../../'), false)
        await recProject.genBean.gen()
        recProject.genBean.genC2SBeans()
        await recProject.genProtocol.gen()
        await recProject.project.save()
        recProject.formatCode()
        recProject.saveRecord()
    }
}

const startTime = new Date().getTime()
new AutoGen()
    .gen()
    .then(() => {
        console.log('生成完毕，总共耗时ms：' + (new Date().getTime() - startTime))
    })
    .catch((reason) => {
        console.error(reason)
        process.exitCode = 1
    })
