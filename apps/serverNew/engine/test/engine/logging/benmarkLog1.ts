import winston from "winston";

const logger = winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

let now = new Date().getTime()
for (let i = 0; i < 10_0000; i++) {
    logger.isDebugEnabled()//10万次27ms
}
console.log(new Date().getTime()-now) //1000万次731ms

now = new Date().getTime()
for (let i = 0; i < 10_0000; i++) {
    logger.debug('aa')//DebugEnabled为true写文件762ms， 为false哪里都不输出却要3.8s
}
console.log(new Date().getTime()-now)
