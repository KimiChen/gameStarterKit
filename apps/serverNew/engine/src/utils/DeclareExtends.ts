
declare global {
    interface Promise<T> {
        /** 
         * 自动catch写入错误日志
         * @param title 错误标题,建议好好填方便排查错误
        */
        catchError(title: string): void
    }
}

Promise.prototype.catchError = function (title: string) {
    this.catch(err => {
        if (Object.hasOwn(global, 'Log')) {
            Log.error(`${title}%s`, err)
        } else {
            console.error(`${title}%s`, err)
        }
    })
}

export { }

