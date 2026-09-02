import { registerBallMoveGameMode } from "./ballMove/index";
import { registerIdleGameMode } from "./IdleGameMode";
import { registerSnakeGameMode } from "./snake/index";

/** Register the starter's gameplay modes at the process composition root. */
export function registerDefaultGameModes(): () => void {
    const unregisterBallMove = registerBallMoveGameMode();
    const unregisterIdle = registerIdleGameMode();
    const unregisterSnake = registerSnakeGameMode();
    return () => {
        unregisterBallMove();
        unregisterIdle();
        unregisterSnake();
    };
}
