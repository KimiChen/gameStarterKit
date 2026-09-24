import { defineComponent, For, useEffect, useRef, useState } from '@uniflex/compiler';
import { fontRef, imageRef, type FontRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

export interface FloatingHintProps {
    readonly text: string;
    /** Starting position in the parent. Leave room above it for the rise distance. */
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly icon?: ImageRef;
    readonly iconSize?: number;
    readonly iconGap?: number;
    readonly font?: FontRef;
    readonly fontSize?: number;
    readonly textWidth?: number;
    readonly color?: string;
    readonly outlineColor?: string;
    readonly outlineWidth?: number;
    readonly rise?: number;
    readonly durationMs?: number;
    /** Absolute start time used by FloatingHintQueue for staggered playback. */
    readonly startAtMs?: number;
    /** Change this when the same message should play again. */
    readonly replayKey?: string | number;
    readonly visible?: boolean;
    /** Useful in previews; gameplay hints normally play once. */
    readonly loop?: boolean;
    readonly loopDelayMs?: number;
}

/** One-shot upward hint; passing `icon` adds an image before the text. */
export const FloatingHint = defineComponent<FloatingHintProps>((p) => {
    const text = p.text;
    const left = p.left;
    const top = p.top;
    const width = Math.max(0, p.width);
    const height = Math.max(0, p.height);
    const icon = p.icon;
    const showIcon = icon !== undefined;
    const iconSource = icon ?? imageRef('ui/shop/getitem-icon');
    const iconSize = showIcon ? Math.max(0, p.iconSize ?? 40) : 0;
    const iconGap = showIcon ? Math.max(0, p.iconGap ?? 8) : 0;
    const fontSize = p.fontSize ?? 30;
    const font = p.font ?? fontRef('fonts/regular', 700);
    const textWidth = Math.max(1, p.textWidth ?? Math.ceil(text.length * fontSize));
    const contentWidth = iconSize + iconGap + textWidth;
    const contentLeft = (width - contentWidth) / 2;
    const color = p.color ?? '#ffe99f';
    const outlineColor = p.outlineColor ?? '#51346d';
    const outlineWidth = p.outlineWidth ?? 2;
    const rise = Math.max(0, p.rise ?? 64);
    const durationMs = Math.max(1, p.durationMs ?? 1000);
    const startAtMs = p.startAtMs;
    const loopDelayMs = Math.max(0, p.loopDelayMs ?? 500);
    const replayKey = p.replayKey;
    const active = p.visible !== false && text.length > 0 && width > 0 && height > 0;
    const loop = p.loop === true;
    const [progress, setProgress] = useState(1);

    useEffect(() => {
        if (!active) {
            setProgress(1);
            return;
        }
        const started = startAtMs ?? Date.now();
        const cycleMs = durationMs + loopDelayMs;
        let interval: ReturnType<typeof setInterval> | undefined;
        let delay: ReturnType<typeof setTimeout> | undefined;
        const tick = () => {
            const elapsed = Date.now() - started;
            if (elapsed < 0) return;
            const phase = loop ? elapsed % cycleMs : elapsed;
            const next = Math.min(1, phase / durationMs);
            setProgress(next);
            if (!loop && next >= 1 && interval !== undefined) {
                clearInterval(interval);
                interval = undefined;
            }
        };
        const begin = () => {
            tick();
            if (loop || Date.now() - started < durationMs) interval = setInterval(tick, 32);
        };
        const waitMs = started - Date.now();
        if (waitMs > 0) {
            setProgress(1);
            delay = setTimeout(begin, waitMs);
        } else {
            begin();
        }
        return () => {
            if (delay !== undefined) clearTimeout(delay);
            if (interval !== undefined) clearInterval(interval);
        };
    }, [active, text, replayKey, durationMs, startAtMs, loop, loopDelayMs]);

    const eased = 1 - (1 - progress) * (1 - progress);
    const translateY = -rise * eased;
    const opacity = Math.max(0, Math.min(1, (1 - progress) / 0.35));
    const shown = active && progress < 1;
    const textLeft = contentLeft + iconSize + iconGap;
    const iconTop = (height - iconSize) / 2;

    return (
        <view name="FloatingHint" visible={shown} style={{ position: 'absolute', left: left, top: top,
            width: width, height: height, translateY: translateY, opacity: opacity }}>
            <image name="FloatingHint/Icon" visible={showIcon} source={iconSource}
                style={{ position: 'absolute', left: contentLeft, top: iconTop,
                    width: iconSize, height: iconSize }} />
            <text name="FloatingHint/Text" value={text}
                style={{ position: 'absolute', left: textLeft, top: 0,
                    width: textWidth, height: height, font: font, fontSize: fontSize,
                    color: color, bold: true, outlineColor: outlineColor, outlineWidth: outlineWidth,
                    verticalAlign: 'center', overflow: 'clamp' }} />
        </view>
    );
});

export interface FloatingHintQueueItem {
    readonly id: number;
    readonly text: string;
    readonly icon?: ImageRef;
    readonly textWidth?: number;
    /** Trigger time; defaults to the time the queue receives this item. */
    readonly requestedAtMs?: number;
}

export interface FloatingHintQueueProps extends Omit<FloatingHintProps,
    'text' | 'icon' | 'textWidth' | 'loop' | 'loopDelayMs' | 'replayKey'> {
    /** Pending hints in arrival order, including the currently playing hint. */
    readonly items: readonly FloatingHintQueueItem[];
    /** Remove the completed item from `items` when called. */
    readonly onComplete: (id: number) => void;
    /** Minimum separation for nearly simultaneous triggers; defaults to 120 ms. */
    readonly minIntervalMs?: number;
    /** Optional hint that loops only while the queue is empty. */
    readonly idleText?: string;
    readonly idleIcon?: ImageRef;
    readonly idleTextWidth?: number;
    readonly idleLoopDelayMs?: number;
}

/** Keeps manual trigger timing while slightly separating simultaneous hints. */
export const FloatingHintQueue = defineComponent<FloatingHintQueueProps>((p) => {
    const durationMs = Math.max(1, p.durationMs ?? 1000);
    const minIntervalMs = Math.max(0, p.minIntervalMs ?? 120);
    const visible = p.visible !== false;
    const starts = useRef(new Map<number, number>());
    const nextStartAt = useRef(0);
    const onComplete = useRef(p.onComplete);
    onComplete.current = p.onComplete;
    if (!visible) {
        starts.current.clear();
        nextStartAt.current = 0;
    } else {
        const now = Date.now();
        for (const item of p.items) {
            if (starts.current.has(item.id)) continue;
            const startAt = Math.max(now, item.requestedAtMs ?? now, nextStartAt.current);
            starts.current.set(item.id, startAt);
            nextStartAt.current = startAt + minIntervalMs;
        }
        for (const id of starts.current.keys()) {
            if (!p.items.some((item) => item.id === id)) starts.current.delete(id);
        }
    }
    const scheduled = p.items.map((item) => ({ ...item, startAtMs: starts.current.get(item.id) }));

    useEffect(() => {
        if (!visible) return;
        const timers = p.items.map((item) => {
            const startAt = starts.current.get(item.id) ?? Date.now();
            return setTimeout(() => onComplete.current(item.id),
                Math.max(0, startAt + durationMs - Date.now()));
        });
        return () => timers.forEach(clearTimeout);
    }, [p.items, visible, durationMs]);

    return (
        <view name="FloatingHintQueue" visible={p.visible !== false} style={{
            position: 'absolute', left: p.left, top: p.top, width: p.width, height: p.height,
        }}>
            <FloatingHint text={p.idleText ?? ''} icon={p.idleIcon} left={0} top={0}
                width={p.width} height={p.height} font={p.font} fontSize={p.fontSize}
                textWidth={p.idleTextWidth} color={p.color} outlineColor={p.outlineColor}
                outlineWidth={p.outlineWidth} iconSize={p.iconSize} iconGap={p.iconGap}
                rise={p.rise} durationMs={durationMs} loopDelayMs={p.idleLoopDelayMs}
                visible={visible && p.items.length === 0} loop />
            <For each={scheduled} key="id">
                {(item) => <FloatingHint text={item.text} icon={item.icon} left={0} top={0}
                    width={p.width} height={p.height} font={p.font} fontSize={p.fontSize}
                    textWidth={item.textWidth} color={p.color} outlineColor={p.outlineColor}
                    outlineWidth={p.outlineWidth} iconSize={p.iconSize} iconGap={p.iconGap}
                    rise={p.rise} durationMs={durationMs} replayKey={item.id}
                    startAtMs={item.startAtMs} visible={visible} />}
            </For>
        </view>
    );
});
