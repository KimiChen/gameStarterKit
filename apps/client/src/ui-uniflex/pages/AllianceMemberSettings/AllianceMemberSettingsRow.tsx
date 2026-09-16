import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { CheckBox } from '../../components/checkbox/CheckBox';
import { theme } from '../../themes/active';

export interface AllianceMemberSettingsRowProps {
    readonly label: string;
    readonly power: string;
    readonly checked: boolean;
    readonly fistTop: number;
    readonly powerLeft: number;
    readonly powerTop: number;
    readonly checkTop: number;
    readonly labelTop: number;
    readonly onToggle?: () => void;
}

const META = '#837A91';

export const AllianceMemberSettingsRow = defineComponent<AllianceMemberSettingsRowProps>((p) => (
    <view name="AllianceMemberSettingsRow">
        <text value={p.label}
            style={{ position: 'absolute', left: 25, top: p.labelTop, width: 220, height: 22,
                font: fontRef('fonts/regular', 700), fontSize: 22, color: META, bold: true, verticalAlign: 'center' }} />
        <image source={imageRef('ui/alliance/mset-fist')}
            style={{ position: 'absolute', left: 402, top: p.fistTop, width: 51, height: 48 }} />
        <image source={imageRef('ui/alliance/mset-power-bg')}
            style={{ position: 'absolute', left: p.powerLeft, top: p.powerTop, width: 176, height: 37, sizeMode: 'sliced' }} />
        <text value={p.power}
            style={{ position: 'absolute', left: p.powerLeft, top: p.powerTop, width: 176, height: 37,
                font: fontRef('fonts/regular', 700), fontSize: 26, color: '#ffffff', bold: true,
                outlineColor: '#000000', outlineWidth: 2,
                horizontalAlign: 'center', verticalAlign: 'center' }} />
        <view name="AllianceMemberSettingsRow/Check" interaction="press" onClick={() => p.onToggle?.()}
            style={{ position: 'absolute', left: 639, top: p.checkTop, width: 37, height: 37 }}>
            <CheckBox checked={p.checked} size={37} hitSize={37}
                checkedSource={theme.checkbox.on} uncheckedSource={theme.checkbox.off} />
        </view>
    </view>
));
