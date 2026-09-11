export interface ScrollMotionOptions {
    brake: number;
    inertia: boolean;
    elastic: boolean;
    bounceDuration: number;
}
/** Offset grows towards the end of the content; position includes elastic displacement. */
export declare class ScrollMotion {
    position: number;
    max: number;
    dragging: boolean;
    animating: boolean;
    private options;
    private previousTime;
    private readonly samples;
    private start;
    private delta;
    private duration;
    private elapsed;
    private braking;
    private brakingStart;
    private wasOutside;
    begin(position: number, max: number, now: number, options?: Partial<ScrollMotionOptions>): void;
    stop(): void;
    drag(delta: number, now: number): number;
    release(): void;
    advance(dt: number): number;
    private outside;
    private bounce;
    private startAuto;
}
