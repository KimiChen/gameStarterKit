// @ts-nocheck — vendored 上游源码：上游以非 strict（noImplicitAny:false）编译，本仓库 strict 下误报；字节锁禁改，偏差只此一行（见 README.md）
export const defineHiddenProperty = (obj:any,key:any,value:any) => Object.defineProperty(obj, key, {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
})

export const defineHiddenProperties = (obj:any,kv:any) => {
    const descriptors = {
        enumerable: false,
        writable: true,
        configurable: true,
    }
    Object.defineProperties(obj, Reflect.ownKeys(kv).reduce((a,k) => Object.assign(a, {[k]: {value: kv[k], ...descriptors}}), {}))
}