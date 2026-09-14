import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { fontRef } from '../../../kits/uniflex/api/core/index';

export interface ActionButtonProps {
    readonly label: string;
    readonly source: ImageRef;
    readonly outlineColor: string;
    readonly onClick?: () => void;
    readonly width?: number;
    readonly height?: number;
    readonly disabled?: boolean;
}

/** Shared hit area, nine-slice background and dynamic label; skins supply the image and outline. */
export const ActionButton = defineComponent<ActionButtonProps>((p) => (
    <view name="ActionButton" interaction="press" interactable={!p.disabled}
        onClick={() => { if (!p.disabled) p.onClick?.(); }}
        style={{ width: p.width ?? 255, height: p.height ?? 102, opacity: p.disabled ? 0.5 : 1 }}>
        <image name="ActionButton/Background" source={p.source}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <text name="ActionButton/Label" value={p.label}
            style={{ position: 'absolute', left: 8, right: 8, top: 4, bottom: 12,
                font: fontRef('fonts/regular', 400), fontSize: 40, color: '#ffffff',
                outlineColor: p.outlineColor, outlineWidth: 2,
                horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
