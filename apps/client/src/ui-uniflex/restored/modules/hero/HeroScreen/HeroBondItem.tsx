import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../../kits/uniflex/api/core/index';

export interface HeroBondItemProps {
    readonly name: string;
    readonly lit: boolean;
    readonly onClick?: () => void;
}

/** One bond scroll. Size stays fixed so swipe does not jump; dim marks off-center items. */
export const HeroBondItem = defineComponent<HeroBondItemProps>((p) => (
    <view name="HeroBondItem" interaction="press" onClick={p.onClick}
        style={{ width: 281, height: 360 }}>
        <image source={imageRef('ui/hero/bond-scroll')}
            style={{ position: 'absolute', width: 281, height: 360 }} />
        <image source={imageRef('ui/hero/bond-art')}
            style={{ position: 'absolute', left: 35, top: 55, width: 210, height: 277 }} />
        <text value={p.name}
            style={{ position: 'absolute', left: 40, top: 14, width: 200, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 26, color: '#F9CD4A', bold: true,
                outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        <image visible={!p.lit} source={imageRef('ui/hero/bond-dim')}
            style={{ position: 'absolute', width: 281, height: 360 }} />
    </view>
));
