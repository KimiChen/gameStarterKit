import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface ResourceCounterProps {
    readonly theme?: ComponentTheme;
    readonly icon: ImageRef;
    readonly left: number;
    readonly top: number;
    readonly value: string;
    readonly id?: string;
    readonly onClick?: () => void;
    readonly background?: ImageRef;
    readonly plus?: ImageRef;
    readonly backgroundLeft?: number;
    readonly backgroundTop?: number;
    readonly iconLeft?: number;
    readonly iconTop?: number;
    readonly iconWidth?: number;
    readonly valueLeft?: number;
    readonly valueTop?: number;
    readonly valueWidth?: number;
    readonly valueColor?: string;
    readonly valueOutline?: string;
}

/** Currency chip. Callers inject icon; inner boxes paste assembled values. */
export const ResourceCounter = defineComponent<ResourceCounterProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const icon = p.icon;
    const plus = p.plus ?? theme.resource.plus;
    const left = p.left;
    const top = p.top;
    const value = p.value;
    const id = p.id ?? '';
    const onClick = p.onClick;
    const background = p.background ?? theme.resource.background;
    const backgroundLeft = p.backgroundLeft ?? p.theme?.resource.bgLeft ?? activeTheme.resource.bgLeft;
    const backgroundTop = p.backgroundTop ?? p.theme?.resource.bgTop ?? activeTheme.resource.bgTop;
    const iconLeft = p.iconLeft ?? p.theme?.resource.iconLeft ?? activeTheme.resource.iconLeft;
    const iconTop = p.iconTop ?? p.theme?.resource.iconTop ?? activeTheme.resource.iconTop;
    const iconWidth = p.iconWidth ?? p.theme?.resource.iconWidth ?? activeTheme.resource.iconWidth;
    const plusOffsetLeft = p.theme?.resource.plusOffsetLeft ?? activeTheme.resource.plusOffsetLeft;
    const plusOffsetTop = p.theme?.resource.plusOffsetTop ?? activeTheme.resource.plusOffsetTop;
    const plusLeft = backgroundLeft + plusOffsetLeft;
    const plusTop = backgroundTop + plusOffsetTop;
    const valueLeft = p.valueLeft ?? p.theme?.resource.valueLeft ?? activeTheme.resource.valueLeft;
    const valueTop = p.valueTop ?? p.theme?.resource.valueTop ?? activeTheme.resource.valueTop;
    const valueWidth = p.valueWidth ?? p.theme?.resource.valueWidth ?? activeTheme.resource.valueWidth;
    const width = p.theme?.resource.width ?? activeTheme.resource.width;
    const height = p.theme?.resource.height ?? activeTheme.resource.height;
    const bgWidth = p.theme?.resource.bgWidth ?? activeTheme.resource.bgWidth;
    const bgHeight = p.theme?.resource.bgHeight ?? activeTheme.resource.bgHeight;
    const iconHeight = p.theme?.resource.iconHeight ?? activeTheme.resource.iconHeight;
    const plusWidth = p.theme?.resource.plusWidth ?? activeTheme.resource.plusWidth;
    const plusHeight = p.theme?.resource.plusHeight ?? activeTheme.resource.plusHeight;
    const valueHeight = p.theme?.resource.valueHeight ?? activeTheme.resource.valueHeight;
    const valueSize = p.theme?.resource.valueSize ?? activeTheme.resource.valueSize;
    const valueColor = p.valueColor ?? theme.resource.color;
    const valueOutline = p.valueOutline ?? theme.resource.outline;
    const outlineWidth = p.theme?.resource.outlineWidth ?? activeTheme.resource.outlineWidth;
    const label = id === '' ? value : `${id} ${value}`;
    const font = theme.resource.font;
    return (
        <view name="ResourceCounter" interaction="press" accessibilityLabel={label} onClick={() => onClick?.()}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image source={background}
                style={{ position: 'absolute', left: backgroundLeft, top: backgroundTop, width: bgWidth, height: bgHeight,
                    sizeMode: 'sliced' }} />
            <image source={icon}
                style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
            <image source={plus}
                style={{ position: 'absolute', left: plusLeft, top: plusTop, width: plusWidth, height: plusHeight }} />
            <text value={value}
                style={{ position: 'absolute', left: valueLeft, top: valueTop, width: valueWidth, height: valueHeight,
                    font: font, fontSize: valueSize, color: valueColor, bold: true,
                    outlineColor: valueOutline, outlineWidth: outlineWidth, verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
