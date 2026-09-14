import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export interface SettingsMenuButtonProps {
    readonly id: string;
    readonly label: string;
    readonly left: number;
    readonly top: number;
    readonly onSelect?: (id: string) => void;
}

export const SettingsMenuButton = defineComponent<SettingsMenuButtonProps>((p) => (
    <view name="SettingsMenuButton" interaction="press" onClick={() => p.onSelect?.(p.id)}
        style={{ position: 'absolute', left: p.left, top: p.top, width: 326, height: 114 }}>
        <image name="SettingsMenuButton/Background" source={imageRef('ui/settings/button')}
            style={{ position: 'absolute', width: 326, height: 114, sizeMode: 'sliced' }} />
        <image name="SettingsMenuButton/Icon" source={imageRef('ui/settings/gear')}
            style={{ position: 'absolute', left: 33, top: 31, width: 54, height: 54 }} />
        <text name="SettingsMenuButton/Label" value={p.label}
            style={{ position: 'absolute', left: 128, top: 30, width: 184, height: 54,
                font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true,
                horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
