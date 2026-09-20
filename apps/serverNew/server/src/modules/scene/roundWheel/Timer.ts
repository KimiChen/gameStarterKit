export class Timer {
    /** 在roundWheel里的桶id，重置延迟后轮次可能会变 */
    bucketIdx: int = 0

    /** 过期轮次 */
    expiration: int = 0

    /** 回调函数 */
    callback!: (actorId: int, callbackArgs: string[]) => int

    /** 地图角色ID */
    actorId: int = 0

    /** 回调函数的参数  */
    callbackArgs: string[] = []

    /** 定时器唯一ID */
    sequenceId: int = 0

    /** 定时器是否已取消 */
    canceled: boolean = false

    constructor(
        actorId: int,
        callback: (actorId: int, callbackArgs: string[]) => int,
        expiration: int,
        args: string[],
        sequenceId: int,
    ) {
        this.callback = callback
        this.expiration = expiration
        this.actorId = actorId
        this.callbackArgs = args
        this.sequenceId = sequenceId
    }
}
