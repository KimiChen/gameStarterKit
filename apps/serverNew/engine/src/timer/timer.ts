
/**
 * 用法：
 * 
 * d = tickAfter(2000, (m) => {return 10}, m)
 * d.promise.then((result) => {}).catch((err) => {console.log(err)})
 * d.cancel()  // 取消 
 * 
 * @param millisec 
 * @param func 
 * @param options 
 * @returns 
 */
export function tickAfter<T>(millisec: number, func: (param?: T) => void, options?: T): TickAfterReturnType<T> {
    let timer: any = 0
    const promise = new Promise((resolve, reject) => {
        timer = setTimeout(
            () => {
                try {
                    resolve(func(options))
                } catch (error) {
                    reject(error)
                } finally {
                    timer = 0
                }
            },
            millisec,
        )
    })

    return {
        get promise() {
            return promise
        },
        cancel() {
            if (timer) {
                clearTimeout(timer)
                timer = 0
            }
        },
    }
}

export type TickAfterReturnType<T> = {
    promise: Promise<unknown>;
    cancel: () => void;
}