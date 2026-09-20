import { IsNotEmpty, Min } from 'class-validator'

export interface ClientConfigGetListRes {
    s?: int
    l?: ClientConfigVersion[]
    prefix?: string
    is_zip?: boolean
}

export interface ClientConfigVersion {
    /** 盐值 */
    salt: string
    /** 文件大小 */
    size: number
    /** 下载地址 */
    uri: string
    /** 是否测试配置 */
    isTestConfig: boolean
}

export class DownloadQuery {
    @Min(1)
    sId: int = 0

    @IsNotEmpty()
    name: string = ''
}

export class ConfigZipQuery {
    @Min(1)
    sId: int = 0

    @IsNotEmpty()
    fileNames: string = ''
}
