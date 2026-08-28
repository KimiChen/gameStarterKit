import { registerIdleGameMode } from "./IdleGameMode";

/** Register the starter's non-default gameplay modes at the process composition root. */
export function registerDefaultGameModes(): () => void {
    const unregisterIdle = registerIdleGameMode();
    return () => unregisterIdle();
}
