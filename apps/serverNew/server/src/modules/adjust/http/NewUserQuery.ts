import { IsArray, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator'

export const PAGE_INDEX = 'PAGE_INDEX'
export const PAGE_CUSTOM_FUNCTION = 'PAGE_CUSTOM_FUNCTION'
export type AdjustPageName = typeof PAGE_INDEX | typeof PAGE_CUSTOM_FUNCTION

//#region NewUser
export class NewUserQuery {
    @IsNumber()
    @Min(1)
    sId: int = 0

    @IsNumber()
    t: int = 0
}

export interface NewUserResponse {
    status: int
    msg: string
    data: {
        serverId: int
        hashKey: string
        ws: string
        apiUrl: string
    }
}

//#endregion

//#region AdjustDoMain
export interface AdjustDoMainResponse {
    status: int
    msg: string
    data: {
        name: string
        value: string
    }[]
}
//#endregion

//#region AdjustApiChange
export class AdjustApiChangeBody {
    @Min(1)
    @IsNumber()
    uId: int = 0

    @IsNotEmpty()
    do: string = ''

    @IsNotEmpty()
    timeFormat?: string
}
//#endregion

//#region AdjustAction
export class ParseCommitActionBody {
    @IsString()
    uId: string = ''

    @IsArray()
    actionRequest: any[] = []

    pageName: AdjustPageName = PAGE_INDEX
}

export interface ParseCommitActionResponse {
    status: int
    data: any[]
    debug?: any
    codeMirrorMode?: string
    msg?: string
    notification?: string
}

export class AdjustGetCustomBody {
    @IsString()
    uId: string = ''

    @IsArray()
    routeList: string[] = []

    pageName: AdjustPageName = PAGE_INDEX
}
//#endregion
