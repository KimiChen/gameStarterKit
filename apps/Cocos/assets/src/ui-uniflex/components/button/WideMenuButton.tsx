import { defineComponent } from '@uniflex/compiler';
import { fontRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

export interface WideMenuButtonProps {
    readonly background: ImageRef;
    readonly icon: ImageRef;
    readonly iconWidth: number;
    readonly iconHeight: number;
    readonly label: string;
    readonly left: number;
    readonly top: number;
    readonly onClick?: () => void;
    readonly labelLeft?: number;
    readonly labelTop?: number;
    readonly labelWidth?: number;
    readonly labelHeight?: number;
}

const WIDTH = 326;
const HEIGHT = 114;
const ICON_CENTER_X = 60;
const DEFAULT_LABEL_LEFT = 118;
const DEFAULT_LABEL_TOP = 28;
const DEFAULT_LABEL_WIDTH = 190;
const DEFAULT_LABEL_HEIGHT = 58;
const COLOR = '#3F3254';

/** Wide icon+label row. Callers inject the skin and icon. */
export const WideMenuButton = defineComponent<WideMenuButtonProps>((p) => {
    const background = p.background;
    const icon = p.icon;
    const iconWidth = p.iconWidth;
    const iconHeight = p.iconHeight;
    const label = p.label;
    const left = p.left;
    const top = p.top;
    const onClick = p.onClick;
    const width = WIDTH;
    const height = HEIGHT;
    const iconLeft = ICON_CENTER_X - iconWidth / 2;
    const iconTop = (height - iconHeight) / 2;
    const labelLeft = p.labelLeft ?? DEFAULT_LABEL_LEFT;
    const labelTop = p.labelTop ?? DEFAULT_LABEL_TOP;
    const labelWidth = p.labelWidth ?? DEFAULT_LABEL_WIDTH;
    const labelHeight = p.labelHeight ?? DEFAULT_LABEL_HEIGHT;
    const font = fontRef('fonts/regular', 700);
    return (
        <view name="WideMenuButton" interaction="press" onClick={() => onClick?.()}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image source={background}
                style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, sizeMode: 'sliced' }} />
            <image source={icon}
                style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
            <text value={label}
                style={{ position: 'absolute', left: labelLeft, top: labelTop, width: labelWidth, height: labelHeight,
                    font: font, fontSize: 28, color: COLOR, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
