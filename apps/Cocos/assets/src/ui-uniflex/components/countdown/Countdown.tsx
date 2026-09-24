import { defineComponent, useEffect, useRef, useState } from '@uniflex/compiler';
import { fontRef, type FontRef } from '../../../kits/uniflex/api/core/index';
import { formatCountdown, parseCountdownTarget } from './countdownTime';

export interface CountdownProps {
    /** Absolute deadline. Numbers are Unix milliseconds; ISO strings keep their timezone. */
    readonly target?: Date | number | string;
    /** Relative duration, captured when mounted or when this value changes. Ignored when target is set. */
    readonly durationSeconds?: number;
    /** D/DD days, H/HH hours, m/mm minutes, s/ss seconds. Default: HH:mm:ss. */
    readonly format?: string;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly font?: FontRef;
    readonly fontSize?: number;
    readonly color?: string;
    readonly backgroundColor?: string;
    readonly invalidText?: string;
    readonly onComplete?: () => void;
}

/** A wall-clock countdown; delayed frames do not make the clock drift. */
export const Countdown = defineComponent<CountdownProps>((p) => {
    const target = p.target;
    const targetTime = target === undefined ? undefined : parseCountdownTarget(target);
    const durationSeconds = targetTime === undefined ? Math.max(0, p.durationSeconds ?? 0) : 0;
    const deadline = useRef(targetTime ?? Date.now() + durationSeconds * 1000);
    const completed = useRef(false);
    const onComplete = useRef(p.onComplete);
    onComplete.current = p.onComplete;
    const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));

    useEffect(() => {
        deadline.current = targetTime ?? Date.now() + durationSeconds * 1000;
        completed.current = false;
        if (!Number.isFinite(deadline.current)) return;
        let timer: ReturnType<typeof setInterval> | undefined;
        const tick = () => {
            const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
            setRemaining((current) => current === seconds ? current : seconds);
            if (seconds === 0) {
                if (timer !== undefined) clearInterval(timer);
                if (!completed.current) {
                    completed.current = true;
                    onComplete.current?.();
                }
            }
        };
        tick();
        if (!completed.current) timer = setInterval(tick, 200);
        return () => { if (timer !== undefined) clearInterval(timer); };
    }, [targetTime, durationSeconds]);

    const text = Number.isFinite(deadline.current)
        ? formatCountdown(remaining, p.format)
        : (p.invalidText ?? '--:--:--');
    const font = p.font ?? fontRef('fonts/regular', 700);
    return <view name="Countdown" style={{ position: 'absolute', left: p.left, top: p.top,
        width: p.width, height: p.height, backgroundColor: p.backgroundColor }}>
        <text value={text} style={{ width: p.width, height: p.height, font: font,
            fontSize: p.fontSize ?? 28, color: p.color ?? '#ffffff',
            horizontalAlign: 'center', verticalAlign: 'center' }} />
    </view>;
});
