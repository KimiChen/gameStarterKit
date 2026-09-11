/** One demand-driven frame pump per Host, shared by delayed creation and presentation. */
export declare class HostFrameScheduler {
    private readonly now;
    private readonly requestFrame;
    private readonly tasks;
    private readonly animations;
    private cancelFrame?;
    private disposed;
    constructor(now: () => number, requestFrame: (callback: () => void) => () => void);
    delay(callback: () => void, delayMs: number): () => void;
    animate(durationMs: number, write: (progress: number) => void, complete: () => void): () => void;
    get pending(): number;
    dispose(): void;
    private wake;
    private stopIfIdle;
}
