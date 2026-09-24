import { defineComponent } from '@uniflex/compiler';
import { fontRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

/** Soldier frame, portrait icon and dynamic tier badge compose independently. */
export const SoldierPortrait = defineComponent<{
    readonly frame: ImageRef;
    readonly icon: ImageRef;
    readonly badge: ImageRef;
    readonly tier: number;
    readonly left: number;
    readonly top: number;
    readonly onClick?: () => void;
}>((p) => {
    const left = p.left;
    const top = p.top;
    return <view name="SoldierPortrait" interaction="press" onClick={p.onClick}
        style={{ position: 'absolute', left: left, top: top, width: 89, height: 110 }}>
        <image source={p.frame} style={{ position: 'absolute', width: 89, height: 99 }} />
        <image source={p.icon} style={{ position: 'absolute', left: 3, top: 0, width: 83, height: 100 }} />
        <image source={p.badge} style={{ position: 'absolute', left: 29, top: 79, width: 31, height: 31 }} />
        <text value={String(p.tier)} style={{ position: 'absolute', left: 29, top: 77, width: 31, height: 33,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center' }} />
    </view>;
});
