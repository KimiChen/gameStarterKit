import { GuildListItemBean } from '../guild/GuildListItemBean'

export interface GuildList {
    id: int
    /**
     * 联盟列表
     */
    l?: Map<int, GuildListItemBean>
}
