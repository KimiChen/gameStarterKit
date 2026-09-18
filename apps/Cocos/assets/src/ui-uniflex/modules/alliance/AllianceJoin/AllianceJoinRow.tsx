import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export interface AllianceJoinRowProps {
    readonly name: string;
    readonly members: string;
    readonly minLevel: string;
    readonly power: string;
    readonly joinType: string;
    readonly onClick?: () => void;
}

const NAME = '#59496E';
const META = '#837A91';

export const AllianceJoinRow = defineComponent<AllianceJoinRowProps>((p) => (
    <view name="AllianceJoinRow" interaction="press" onClick={p.onClick}
        style={{ position: 'relative', width: 709, height: 135 }}>
        <image source={imageRef('ui/alliance/join-row-bg')}
            style={{ position: 'absolute', width: 709, height: 135, sizeMode: 'sliced' }} />
        <image source={imageRef('ui/alliance/flag')}
            style={{ position: 'absolute', left: 18, top: 15, width: 108, height: 98 }} />
        <image source={imageRef('ui/alliance/nation-flag')}
            style={{ position: 'absolute', left: 160, top: 15, width: 48, height: 30 }} />
        <text value={p.name}
            style={{ position: 'absolute', left: 216, top: 13, width: 280, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 26, color: NAME, bold: true, verticalAlign: 'center' }} />
        <image source={imageRef('ui/alliance/join-people')}
            style={{ position: 'absolute', left: 168, top: 70, width: 34, height: 30 }} />
        <text value={p.members}
            style={{ position: 'absolute', left: 212, top: 72, width: 80, height: 26,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: META, bold: true, verticalAlign: 'center' }} />
        <text value={p.minLevel}
            style={{ position: 'absolute', left: 303, top: 72, width: 120, height: 26,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: META, bold: true, verticalAlign: 'center' }} />
        <image source={imageRef('ui/alliance/join-fist')}
            style={{ position: 'absolute', left: 515, top: 8, width: 42, height: 38 }} />
        <image source={imageRef('ui/alliance/join-power-bg')}
            style={{ position: 'absolute', left: 537, top: 13, width: 158, height: 33, sizeMode: 'sliced' }} />
        <text value={p.power}
            style={{ position: 'absolute', left: 537, top: 13, width: 158, height: 33,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: NAME, bold: true,
                horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value={p.joinType}
            style={{ position: 'absolute', left: 500, top: 72, width: 196, height: 26,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: META, bold: true,
                horizontalAlign: 'right', verticalAlign: 'center' }} />
    </view>
));
