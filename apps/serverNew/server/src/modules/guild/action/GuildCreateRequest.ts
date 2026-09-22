/** Adjust 管理入口创建联盟时使用的内部参数，不是客户端协议。 */
export interface GuildCreateRequest {
    guildName: string
    head: int
    notice: string
    contact: string
    open: int
}
