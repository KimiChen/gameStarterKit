export interface HttpConfig {
    protoJsonPath: string // proto.json 路径
    platformPath: string  // platform.json5 路径
    beanPath:string       // bean 路径
}

export let httpCfg : HttpConfig

export function InitHttpConfig(cfg : HttpConfig) {
    httpCfg = cfg
}

