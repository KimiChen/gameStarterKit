export interface MsgError {
    code: number
    message: string
    noLogin?: boolean
    params?: string[]
    vars?: string[]
    stack?: string
}
