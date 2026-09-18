import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { CheckBox } from '../../components/checkbox/CheckBox';
import { theme } from '../../themes/active';

export interface CharacterPlayerRowProps {
    readonly name: string;
    readonly level: string;
    readonly server: string;
    readonly selected: boolean;
    readonly onSelect?: () => void;
}

export const CharacterPlayerRow = defineComponent<CharacterPlayerRowProps>((p) => (
    <view name="CharacterPlayerRow" interaction="press" onClick={p.onSelect}
        style={{ position: 'relative', width: 626, height: 130 }}>
        <image source={imageRef('ui/character/player-bg')}
            style={{ position: 'absolute', width: 626, height: 130 }} />
        <image source={imageRef('ui/character/avatar')}
            style={{ position: 'absolute', left: 22, top: 14, width: 100, height: 102 }} />
        <text value={p.name} style={{ position: 'absolute', left: 146, top: 14, width: 360, height: 28,
            font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true, verticalAlign: 'center', overflow: 'shrink' }} />
        <view style={{ position: 'absolute', left: 147, top: 49, width: 390, height: 28, flexDirection: 'row', alignItems: 'center' }}>
            <text value="等级: " style={{ height: 28,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#837A91', bold: true, verticalAlign: 'center' }} />
            <text value={p.level} style={{ height: 28, flexGrow: 1,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
        </view>
        <view style={{ position: 'absolute', left: 147, top: 85, width: 390, height: 30, flexDirection: 'row', alignItems: 'center' }}>
            <text value="服务器: " style={{ height: 30,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#837A91', bold: true, verticalAlign: 'center' }} />
            <text value={p.server} style={{ height: 30, flexGrow: 1,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
        </view>
        <view style={{ position: 'absolute', left: 552, top: 39, width: 52, height: 52 }}>
            <CheckBox checked={p.selected} checkedSource={theme.checkbox.on} uncheckedSource={theme.checkbox.off} />
        </view>
    </view>
));
