import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export interface AllianceMemberRowProps {
    readonly visible?: boolean;
    readonly power?: string;
    readonly combat?: string;
    readonly status?: string;
    readonly online?: boolean;
}

export const AllianceMemberRow = defineComponent<AllianceMemberRowProps>((p) => (
    <view name="AllianceMemberRow" visible={p.visible !== false}
        style={{ position: 'relative', width: 661, height: 78 }}>
        <image source={imageRef('ui/alliance/member-row')}
            style={{ position: 'absolute', width: 661, height: 78, sizeMode: 'sliced' }} />
        <image source={imageRef('ui/alliance/member-avatar')}
            style={{ position: 'absolute', left: 14, top: 5, width: 67, height: 68 }} />
        <text value={p.power ?? '5000'}
            style={{ position: 'absolute', left: 92, top: 20, width: 160, height: 40,
                font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
        <image source={imageRef('ui/alliance/fist')}
            style={{ position: 'absolute', left: 529, top: 8, width: 35, height: 32 }} />
        <text value={p.combat ?? '5000'}
            style={{ position: 'absolute', left: 566, top: 6, width: 80, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#E6A317', bold: true, verticalAlign: 'center' }} />
        <text value={p.status ?? '在线'}
            style={{ position: 'absolute', left: 480, top: 40, width: 160, height: 28,
                font: fontRef('fonts/regular', 700), fontSize: 22,
                color: p.online === true ? '#419A35' : '#837A91', bold: true,
                horizontalAlign: 'right', verticalAlign: 'center' }} />
    </view>
));
