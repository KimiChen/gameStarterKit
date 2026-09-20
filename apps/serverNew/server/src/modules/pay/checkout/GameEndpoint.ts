export class GameEndpoint {
    /**
     * 获取游戏API地址
     */
    static getApiUrl() {
        return CA.game_url[PLATFORM_VERSION][PLATFORM] ?? ''
    }
}
