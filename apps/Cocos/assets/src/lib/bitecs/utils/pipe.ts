// @ts-nocheck — vendored 上游源码：上游以非 strict（noImplicitAny:false）编译，本仓库 strict 下误报；字节锁禁改，偏差只此一行（见 README.md）
type Func = (...args: any) => any
export const pipe = <T extends Func, U extends Func, R extends Func>
    (...functions: [T, ...U[], R]): ((...args: Parameters<T>) => ReturnType<R>) => {
    return (...args: Parameters<T>): ReturnType<R> => 
        functions.reduce((result, fn) => [fn(...result)], args as any)[0]
}
