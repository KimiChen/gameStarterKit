import { IsNotEmpty, IsString } from 'class-validator'
import type { ServerItem } from '../../serverSettings/http/ServerListCatalog'

export class UserLoginQuery {
    @IsString()
    loginType: string = ''

    @IsString()
    quicklyUser: string = ''

    @IsString()
    deviceId: string = ''

    @IsString()
    os: string = ''
}

export type UserLoginResponse = {
    s: int
    ul: any
    openId: string
    al: ServerItem[]
    isNew: boolean
    h: string
    centerId: int
    isCertificate?: boolean
    isOps?: int
}

export type GongGaoListResponse = {
    s: int

    gonggao: {
        open: int
        ver?: int
        l?: GongGaoItem[]
    }
}

export interface GongGaoItem {
    id: int
    title: string
    content: string
    ver: int
    type: int
    img: string
    sort: int
}

export class PackageVersionQuery {
    @IsNotEmpty({ message: '该字段不能为空' })
    pf: string = ''

    @IsNotEmpty({ message: '该字段不能为空' })
    channelId: string = ''

    @IsNotEmpty({ message: '该字段不能为空' })
    channelChildId: string = ''

    @IsNotEmpty({ message: '该字段不能为空' })
    appVer: string = ''

    @IsString()
    resVer: string = ''

    @IsNotEmpty({ message: '该字段不能为空' })
    deviceId: string = ''

    @IsString()
    platform: string = ''

    @IsString()
    branch: string = 'master'

    @IsString()
    cdnSec: string = ''
}

export interface PackageVersionResponse {
    code: number

    loginUrl: string // 登录服务器地址
    resUrl: string // 热更资源地址前缀
    frontWhite: number // 是否设备白名单
    logOn: number // unity日志上报开关

    /** 包版本  */
    baseVersion: string // 包更新版本, 这个字段必须为 x.x.x 格式
    packageUrl: string // 包更新地址
    packageForceUpdate: number // 是否包强更

    /** 包资源 */
    resVersion: string // 资源更新版本 这个字段必须为 x.x.x 格式
    resForceUpdate: number // 是否资源强更
    packageCdnVer: string // cdn模块版本号(客户端当前资源版本对应的)
    packageCdnVer2: string // 热更版本对应的 cdn模块版本号

    updateRestart: number // 热更后是否重启
    isJump: number // 是否跳转 (用于跳转服务器)
    downLoadType: number // 是否包内下载
    codeVer: string
    pytsVer: string
    separateVer: string

    url?: string // 若isJump>0,线路跳转
    pf?: string
    gv?: string
    silentDownloadFlag: number
    silentDownloadLimit: number

    isAb?: number
}
