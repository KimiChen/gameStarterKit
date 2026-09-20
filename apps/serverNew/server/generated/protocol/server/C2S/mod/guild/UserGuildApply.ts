export interface UserGuildApply {
    id: int
    /**
     * 玩家Id
     */
    uId: int
    /**
     * 申请记录<guild,time>
     */
    records?: Map<int, int>
}
