import { IsString } from 'class-validator'

export interface ConfHistoryRes {
    s: number
    serverInfoArr: { name: string; value: int }[]
    files: {
        id: int
        config_name: string
        server_id: int
        update_ts: int
        create_ts: int
        date: string
        can_start: int
        available: int
    }[]
}

export class AdjustConfigDeleteReqBody {
    @IsString()
    ids: string = ''
}
