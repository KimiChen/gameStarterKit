import { registerBallMoveGameMode } from "./ballMove/index";
import { registerIdleGameMode } from "./IdleGameMode";

/** Register the starter's gameplay modes at the process composition root. */
export function registerDefaultGameModes(): () => void {
    const unregisterBallMove = registerBallMoveGameMode();
    const unregisterIdle = registerIdleGameMode();
    return () => {
        unregisterBallMove();
        unregisterIdle();
    };
}
