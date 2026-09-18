import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

export interface ResourceCounterProps {
    readonly icon: ImageRef;
    readonly left: number;
    readonly top: number;
    readonly value: string;
    readonly id?: string;
    readonly onClick?: () => void;
    readonly background?: ImageRef;
    readonly backgroundLeft?: number;
    readonly backgroundTop?: number;
    readonly iconLeft?: number;
    readonly iconTop?: number;
    readonly iconWidth?: number;
    readonly valueLeft?: number;
    readonly valueTop?: number;
    readonly valueWidth?: number;
}

const WIDTH = 153;
const HEIGHT = 45;
const BG_WIDTH = 138;
const BG_HEIGHT = 32;
const ICON_HEIGHT = 31;
const PLUS_WIDTH = 20;
const PLUS_HEIGHT = 21;
const VALUE_HEIGHT = 32;
const DEFAULT_BG_LEFT = 7;
const DEFAULT_BG_TOP = 5;
const DEFAULT_ICON_LEFT = 4;
const DEFAULT_ICON_TOP = 4;
const DEFAULT_ICON_WIDTH = 37;
const PLUS_OFFSET_LEFT = 16;
const PLUS_OFFSET_TOP = 12;
const DEFAULT_VALUE_LEFT = 44;
const DEFAULT_VALUE_TOP = 5;
const DEFAULT_VALUE_WIDTH = 101;

/** Currency chip. Callers inject icon; inner boxes paste assembled values. */
export const ResourceCounter = defineComponent<ResourceCounterProps>((p) => {
    const icon = p.icon;
    const plus = imageRef('ui/backpack/resource-plus');
    const left = p.left;
    const top = p.top;
    const value = p.value;
    const id = p.id ?? '';
    const onClick = p.onClick;
    const background = p.background ?? imageRef('ui/backpack/resource-bg');
    const backgroundLeft = p.backgroundLeft ?? DEFAULT_BG_LEFT;
    const backgroundTop = p.backgroundTop ?? DEFAULT_BG_TOP;
    const iconLeft = p.iconLeft ?? DEFAULT_ICON_LEFT;
    const iconTop = p.iconTop ?? DEFAULT_ICON_TOP;
    const iconWidth = p.iconWidth ?? DEFAULT_ICON_WIDTH;
    const plusLeft = backgroundLeft + PLUS_OFFSET_LEFT;
    const plusTop = backgroundTop + PLUS_OFFSET_TOP;
    const valueLeft = p.valueLeft ?? DEFAULT_VALUE_LEFT;
    const valueTop = p.valueTop ?? DEFAULT_VALUE_TOP;
    const valueWidth = p.valueWidth ?? DEFAULT_VALUE_WIDTH;
    const width = WIDTH;
    const height = HEIGHT;
    const bgWidth = BG_WIDTH;
    const bgHeight = BG_HEIGHT;
    const iconHeight = ICON_HEIGHT;
    const plusWidth = PLUS_WIDTH;
    const plusHeight = PLUS_HEIGHT;
    const valueHeight = VALUE_HEIGHT;
    const label = id === '' ? value : `${id} ${value}`;
    const font = fontRef('fonts/regular', 700);
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
                    font: font, fontSize: 22, color: '#FFFFFF', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
