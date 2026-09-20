import { Config, ContextEngine, IAppConfigMap, IPlatformConfigMap } from '@arthropoda/game-engine'

export function initializeConfigGlobals() {
    global.C = new Proxy<ConfType>({} as ConfType, {
        get(target, p) {
            return (key?: any, defaultValue?: any) => {
                const name = p.toString()
                const engineCtx = ContextEngine.currentCtxEngine
                if (engineCtx) {
                    const spaceKey = Ctx.gameTableName2SpaceKey?.[name] ?? String(Ctx.sid)
                    if (spaceKey) {
                        const v = Config.getConfigBySpace(spaceKey, name, { key, defaultValue })
                        if (v !== undefined) {
                            return v
                        }
                    }
                }
                return Config.getConfig(name, { key, defaultValue })
            }
        },
    })

    global.Param = new Proxy<ParamTypes>({} as ParamTypes, {
        get(target, p) {
            return Config.getConfig('param', { key: p.toString() })
        },
    })

    global.CP = new Proxy<IPlatformConfigMap>({} as IPlatformConfigMap, {
        get(target, p) {
            return Config.getConfig(p.toString())
        },
    })

    global.CA = new Proxy<IAppConfigMap>({} as IAppConfigMap, {
        get(target, p) {
            return Config.getConfig(p.toString())
        },
    })
}

global.Int = function (v?: any) {
    const n = parseInt(v)
    if (Number.isSafeInteger(n)) {
        return Math.trunc(n)
    }
    return 0
}

Object.defineProperty(global, 'Ctx', {
    get: function () {
        return ContextEngine.currentCtxEngine!.ctxLogic
    },
})
