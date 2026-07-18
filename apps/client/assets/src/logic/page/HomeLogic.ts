/**
 * 主界面逻辑（纯 TS，无头单测）——展示用户 id + 「进入游戏」意图。
 * 导航（进入 ballMove 玩法房）在 view/Main 层，此处只暴露意图回调。
 */
export class HomeLogic {
    /** 当前展示的用户 id */
    userId = "";
    /** 点「进入游戏」按钮回调——view 层据此进入 ballMove 玩法 */
    onEnterBattle: () => void = () => {};

    setUserId(uid: string): void {
        this.userId = uid;
    }

    enterBattle(): void {
        this.onEnterBattle();
    }
}
