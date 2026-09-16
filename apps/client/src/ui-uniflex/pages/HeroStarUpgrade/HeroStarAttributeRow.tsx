import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export interface HeroStarAttributeRowProps {
    readonly striped: boolean;
    readonly name: string;
    readonly current: string;
    readonly next: string;
}

export const HeroStarAttributeRow = defineComponent<HeroStarAttributeRowProps>((p) => (
    <view name="HeroStarAttributeRow" style={{ width: 683, height: 55 }}>
        <image visible={p.striped} source={imageRef('ui/star-upgrade/row-bg')}
            style={{ position: 'absolute', width: 683, height: 55 }} />
        <image source={imageRef('ui/star-upgrade/attack-icon')}
            style={{ position: 'absolute', left: 29, top: 12, width: 25, height: 32 }} />
        <text value={p.name}
            style={{ position: 'absolute', left: 57, top: 10, width: 160, height: 36,
                font: fontRef('fonts/regular', 700), fontSize: 28, color: '#837A91', bold: true,
                verticalAlign: 'center' }} />
        <text value={p.current}
            style={{ position: 'absolute', left: 237, top: 10, width: 140, height: 36,
                font: fontRef('fonts/regular', 700), fontSize: 28, color: '#59496E', bold: true,
                verticalAlign: 'center' }} />
        <image source={imageRef('ui/star-upgrade/arrow')}
            style={{ position: 'absolute', left: 397, top: 9, width: 41, height: 38 }} />
        <text value={p.next}
            style={{ position: 'absolute', left: 522, top: 10, width: 140, height: 36,
                font: fontRef('fonts/regular', 700), fontSize: 28, color: '#368934', bold: true,
                verticalAlign: 'center' }} />
    </view>
));
