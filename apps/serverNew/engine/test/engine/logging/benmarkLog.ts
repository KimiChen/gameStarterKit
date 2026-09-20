import {Env, Level, LogOptions, Output} from '../../../src/logging/config'
import {log} from '../../../src/logging/log'

// 初始化选项，会根据 Env 和 Output 进行缺省默认设置
const opts = <LogOptions>{
    output: Output.File,
    level: Level.Info,
    env: Env.Prod,
    channels: [
        //2 个文件通道，当然也可以添加 console 通道
        {
            name: 'game', // 没有指定 default 则第一个为默认
            dirname: './log',
        },
    //     {
    //         name: 'console',
    //     },
    ],
}

// 初始化日志
log.init(opts)

let now = new Date().getTime()
for (let i = 0; i < 10_0000; i++) {
    Log.http.isDebugEnabled()//10万次27ms
}
console.log(new Date().getTime()-now) //1000万次731ms

now = new Date().getTime()
for (let i = 0; i < 100_0000; i++) {
    Log.http.debug((i:number)=>i+'aa', i)
}
console.log(new Date().getTime()-now)
