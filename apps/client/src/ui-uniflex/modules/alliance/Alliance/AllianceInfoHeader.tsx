import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export interface AllianceInfoHeaderProps {
    readonly tag?: string;
    readonly name?: string;
    readonly leader?: string;
    readonly power?: string;
    readonly memberCount?: string;
}

export const AllianceInfoHeader = defineComponent<AllianceInfoHeaderProps>((p) => (
    <view name="AllianceInfoHeader" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 541 }}>
        <image source={imageRef('ui/alliance/flag')}
            style={{ position: 'absolute', left: 35, top: 339, width: 198, height: 178 }} />
        <image source={imageRef('ui/alliance/info-panel')}
            style={{ position: 'absolute', left: 242, top: 388, width: 476, height: 131, sizeMode: 'sliced' }} />
        <text value={p.tag ?? '[LFS]'}
            style={{ position: 'absolute', left: 257, top: 350, width: 200, height: 30,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#FFC400', bold: true, verticalAlign: 'center' }} />
        <text value={p.name ?? '斧头帮'}
            style={{ position: 'absolute', left: 500, top: 350, width: 190, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#ffffff', bold: true,
                outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'right', verticalAlign: 'center' }} />
        <image source={imageRef('ui/alliance/icon-leader')}
            style={{ position: 'absolute', left: 256, top: 401, width: 33, height: 28 }} />
        <image source={imageRef('ui/alliance/icon-power')}
            style={{ position: 'absolute', left: 258, top: 441, width: 29, height: 29 }} />
        <image source={imageRef('ui/alliance/icon-members')}
            style={{ position: 'absolute', left: 254, top: 481, width: 36, height: 30 }} />
        <text value="盟主"
            style={{ position: 'absolute', left: 296, top: 398, width: 160, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
        <text value="联盟战力"
            style={{ position: 'absolute', left: 296, top: 438, width: 160, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
        <text value="联盟成员人数"
            style={{ position: 'absolute', left: 296, top: 478, width: 180, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
        <text value={p.leader ?? '80'}
            style={{ position: 'absolute', left: 560, top: 398, width: 140, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#3F3254', bold: true,
                horizontalAlign: 'right', verticalAlign: 'center' }} />
        <text value={p.power ?? '154万'}
            style={{ position: 'absolute', left: 560, top: 438, width: 140, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#3F3254', bold: true,
                horizontalAlign: 'right', verticalAlign: 'center' }} />
        <text value={p.memberCount ?? '25/50'}
            style={{ position: 'absolute', left: 560, top: 478, width: 140, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#3F3254', bold: true,
                horizontalAlign: 'right', verticalAlign: 'center' }} />
        <view style={{ position: 'absolute', left: 0, top: 538, width: 750, height: 3, backgroundColor: '#C6C1C5' }} />
    </view>
));
