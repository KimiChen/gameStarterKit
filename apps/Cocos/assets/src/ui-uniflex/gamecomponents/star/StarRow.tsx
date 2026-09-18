import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';

export interface StarRowProps {
    readonly filled: ImageRef;
    readonly empty: ImageRef;
    readonly value: number;
    readonly lefts: readonly number[];
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly count?: number;
    readonly visible?: boolean;
    readonly filledWidth?: number;
    readonly filledHeight?: number;
}

/** n filled/empty stars. Callers inject skins and assembled lefts. */
export const StarRow = defineComponent<StarRowProps>((p) => {
    const filled = p.filled;
    const empty = p.empty;
    const value = p.value;
    const lefts = p.lefts;
    const top = p.top;
    const width = p.width;
    const height = p.height;
    const count = p.count ?? 5;
    const visible = p.visible !== false;
    const filledWidth = p.filledWidth ?? width;
    const filledHeight = p.filledHeight ?? height;
    const insetX = Math.floor((width - filledWidth) / 2);
    const insetY = Math.floor((height - filledHeight) / 2);
    const left0 = lefts[0];
    const left1 = lefts[1];
    const left2 = lefts[2];
    const left3 = lefts[3];
    const left4 = lefts[4];
    const src0 = value >= 1 ? filled : empty;
    const src1 = value >= 2 ? filled : empty;
    const src2 = value >= 3 ? filled : empty;
    const src3 = value >= 4 ? filled : empty;
    const src4 = value >= 5 ? filled : empty;
    const w0 = value >= 1 ? filledWidth : width;
    const w1 = value >= 2 ? filledWidth : width;
    const w2 = value >= 3 ? filledWidth : width;
    const w3 = value >= 4 ? filledWidth : width;
    const w4 = value >= 5 ? filledWidth : width;
    const h0 = value >= 1 ? filledHeight : height;
    const h1 = value >= 2 ? filledHeight : height;
    const h2 = value >= 3 ? filledHeight : height;
    const h3 = value >= 4 ? filledHeight : height;
    const h4 = value >= 5 ? filledHeight : height;
    const x0 = value >= 1 ? insetX : 0;
    const x1 = value >= 2 ? insetX : 0;
    const x2 = value >= 3 ? insetX : 0;
    const x3 = value >= 4 ? insetX : 0;
    const x4 = value >= 5 ? insetX : 0;
    const y0 = value >= 1 ? insetY : 0;
    const y1 = value >= 2 ? insetY : 0;
    const y2 = value >= 3 ? insetY : 0;
    const y3 = value >= 4 ? insetY : 0;
    const y4 = value >= 5 ? insetY : 0;
    const show0 = count >= 1;
    const show1 = count >= 2;
    const show2 = count >= 3;
    const show3 = count >= 4;
    const show4 = count >= 5;
    const pos0 = left0 + x0;
    const pos1 = left1 + x1;
    const pos2 = left2 + x2;
    const pos3 = left3 + x3;
    const pos4 = left4 + x4;
    const top0 = top + y0;
    const top1 = top + y1;
    const top2 = top + y2;
    const top3 = top + y3;
    const top4 = top + y4;
    return (
        <view name="StarRow" visible={visible}
            style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
            <image visible={show0} source={src0}
                style={{ position: 'absolute', left: pos0, top: top0, width: w0, height: h0 }} />
            <image visible={show1} source={src1}
                style={{ position: 'absolute', left: pos1, top: top1, width: w1, height: h1 }} />
            <image visible={show2} source={src2}
                style={{ position: 'absolute', left: pos2, top: top2, width: w2, height: h2 }} />
            <image visible={show3} source={src3}
                style={{ position: 'absolute', left: pos3, top: top3, width: w3, height: h3 }} />
            <image visible={show4} source={src4}
                style={{ position: 'absolute', left: pos4, top: top4, width: w4, height: h4 }} />
        </view>
    );
});
