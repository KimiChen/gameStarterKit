export interface MsgError {
    code: int
    message: string
    noLogin: boolean
    params: string[]
    vars?: string[]
}
