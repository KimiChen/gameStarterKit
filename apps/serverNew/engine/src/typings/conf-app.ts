export interface LoginKeyItem {
    readonly cp_app_id: string
    readonly cp_app_key: string
    readonly cp_pay_key: string
    readonly verify_class: string
    readonly plats: string[]
}

export interface LoginKeyConfig {
    [k: string]: LoginKeyItem
}
export interface OpenIpConfig {
    ips: string[]
}
export interface GameUrlConfig {
    [k: string]: { [k: string]: string }
}

export interface IAppConfigMap {
    readonly login_key: LoginKeyConfig
    readonly open_ip: OpenIpConfig
    readonly game_url: GameUrlConfig
}

export enum E_APP_TYPE {
    DEFAULT,
    API,
    SERVICE,
}