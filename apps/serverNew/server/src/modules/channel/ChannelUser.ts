export class ChannelUser {
    public userId: string

    public userName: string

    /**
     * 类型需要按照实际需求进行定义
     */
    public extension: any | null

    public channelId: string

    constructor(userId: string, userName: string, channelId: string = '999999', extension: any = null) {
        this.userId = userId
        this.userName = userName
        this.channelId = channelId
        this.extension = extension
    }
}
