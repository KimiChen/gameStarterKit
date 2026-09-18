import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../../kits/uniflex/api/core/index';
import { fontRef } from '../../../../kits/uniflex/api/core/index';

export interface ActionButtonProps {
    readonly label: string;
    readonly source: ImageRef;
    readonly outlineColor: string;
    readonly onClick?: () => void;
    readonly width?: number;
    readonly height?: number;
    readonly disabled?: boolean;
    readonly icon?: ImageRef;
    readonly iconWidth?: number;
    readonly iconHeight?: number;
}

/** Shared hit area and nine-slice skin. Label-only, or a centered icon + label row. */
export const ActionButton = defineComponent<ActionButtonProps>((p) => {
    const hasIcon = p.icon != null;
    const iconWidth = p.iconWidth ?? 48;
    const iconHeight = p.iconHeight ?? 48;
    const iconLabelWidth = Math.max(40, p.label.length * 26);
    return (
        <view name="ActionButton" interaction="press" interactable={!p.disabled}
            onClick={() => { if (!p.disabled) p.onClick?.(); }}
            style={{ width: p.width ?? 255, height: p.height ?? 102, opacity: p.disabled ? 0.5 : 1 }}>
            <image name="ActionButton/Background" source={p.source}
                style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
            <text name="ActionButton/Label" visible={!hasIcon} value={p.label}
                style={{ position: 'absolute', left: 8, right: 8, top: 4, bottom: 12,
                    font: fontRef('fonts/regular', 400), fontSize: 40, color: '#ffffff',
                    outlineColor: p.outlineColor, outlineWidth: 2,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <view name="ActionButton/IconRow" visible={hasIcon}
                style={{ position: 'absolute', left: 8, right: 8, top: 4, bottom: 12,
                    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
                <image name="ActionButton/Icon" source={p.icon ?? p.source}
                    style={{ width: iconWidth, height: iconHeight }} />
                <text name="ActionButton/IconLabel" value={p.label}
                    style={{ width: iconLabelWidth, height: '100%',
                        font: fontRef('fonts/regular', 400), fontSize: 40, color: '#ffffff',
                        outlineColor: p.outlineColor, outlineWidth: 2,
                        horizontalAlign: 'left', verticalAlign: 'center', overflow: 'shrink' }} />
            </view>
        </view>
    );
});
