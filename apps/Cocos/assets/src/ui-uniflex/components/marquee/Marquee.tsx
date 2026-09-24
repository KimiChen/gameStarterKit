import { defineComponent, useEffect, useState } from '@uniflex/compiler';
import { fontRef, type FontRef } from '../../../kits/uniflex/api/core/index';

export interface MarqueeProps {
    readonly text: string;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly font?: FontRef;
    readonly fontSize?: number;
    readonly color?: string;
    /** Exact rendered width when known; the default reserves one em per UTF-16 code unit. */
    readonly textWidth?: number;
    /** Travel speed in logical pixels per second. */
    readonly speed?: number;
    readonly gap?: number;
    readonly paused?: boolean;
    readonly backgroundColor?: string;
}

/** A single line enters from the right, exits on the left, then repeats. */
export const Marquee = defineComponent<MarqueeProps>((p) => {
    const text = p.text;
    const left = p.left;
    const top = p.top;
    const width = Math.max(0, p.width);
    const height = Math.max(0, p.height);
    const fontSize = p.fontSize ?? 24;
    const font = p.font ?? fontRef('fonts/regular', 700);
    const color = p.color ?? '#ffffff';
    const textWidth = Math.max(1, p.textWidth ?? Math.ceil(text.length * fontSize));
    const gap = Math.max(0, p.gap ?? 32);
    const speed = Math.max(0, p.speed ?? 80);
    const paused = p.paused === true;
    const backgroundColor = p.backgroundColor;
    const travel = width + textWidth + gap;
    const contentWidth = width + travel;
    const [offset, setOffset] = useState(0);

    useEffect(() => setOffset(0), [text, width, textWidth, gap]);
    useEffect(() => {
        if (paused || speed === 0 || width === 0 || text.length === 0) return;
        let previous = Date.now();
        const timer = setInterval(() => {
            const now = Date.now();
            const elapsed = Math.min(100, Math.max(0, now - previous));
            previous = now;
            setOffset((current) => {
                const next = current + speed * elapsed / 1000;
                return next >= travel ? 0 : next;
            });
        }, 32);
        return () => clearInterval(timer);
    }, [text, width, textWidth, gap, speed, paused]);

    return (
        <scroll-view name="Marquee" direction="horizontal" inertia={false} elastic={false}
            scrollOffset={offset} style={{ position: 'absolute', left: left, top: top,
                width: width, height: height, backgroundColor: backgroundColor }}>
            <view name="Marquee/Track" style={{ position: 'relative', width: contentWidth, height: height }}>
                <text value={text} style={{ position: 'absolute', left: width, top: 0,
                    width: textWidth, height: height, font: font, fontSize: fontSize,
                    color: color, verticalAlign: 'center', overflow: 'clamp' }} />
            </view>
        </scroll-view>
    );
});
