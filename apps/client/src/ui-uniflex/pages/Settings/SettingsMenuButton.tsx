import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export interface SettingsMenuButtonProps {
    readonly id: string;
    readonly label: string;
    readonly left: number;
    readonly top: number;
    readonly icon?: ImageRef;
    readonly iconLeft?: number;
    readonly iconTop?: number;
    readonly iconWidth?: number;
    readonly iconHeight?: number;
    readonly labelColor?: string;
    readonly labelOutline?: string;
    readonly labelOutlineWidth?: number;
    readonly labelFontSize?: number;
    readonly onSelect?: (id: string) => void;
}

export const SettingsMenuButton = defineComponent<SettingsMenuButtonProps>((p) => (
    <view name="SettingsMenuButton" interaction="press" onClick={() => p.onSelect?.(p.id)}
        style={{ position: 'absolute', left: p.left, top: p.top, width: 326, height: 114 }}>
        <image name="SettingsMenuButton/Background" source={imageRef('ui/settings/button')}
            style={{ position: 'absolute', width: 326, height: 114, sizeMode: 'sliced' }} />
        <image name="SettingsMenuButton/Icon" source={p.icon ?? imageRef('ui/settings/gear')}
            style={{ position: 'absolute', left: p.iconLeft ?? 33, top: p.iconTop ?? 31,
                width: p.iconWidth ?? 54, height: p.iconHeight ?? 54 }} />
        <text name="SettingsMenuButton/Label" value={p.label}
            style={{ position: 'absolute', left: 128, top: 30, width: 184, height: 54,
                font: fontRef('fonts/regular', 700), fontSize: p.labelFontSize ?? 28,
                color: p.labelColor ?? '#3F3254', bold: true,
                outlineColor: p.labelOutline, outlineWidth: p.labelOutlineWidth ?? 0,
                horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
