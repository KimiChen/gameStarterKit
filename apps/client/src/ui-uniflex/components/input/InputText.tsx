import { defineComponent } from '@uniflex/compiler';
import { fontRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

export interface InputTextProps {
    readonly background: ImageRef;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly value: string;
    readonly onInput?: (value: string) => void;
    readonly placeholder?: string;
    readonly maxLength?: number;
    readonly fontSize?: number;
    readonly color?: string;
    readonly placeholderColor?: string;
    readonly textAlign?: 'left' | 'center';
    readonly textLeft?: number;
    readonly textWidth?: number;
}

const DEFAULT_COLOR = '#6F6555';

/** Background + input + placeholder text. Callers inject the skin. */
export const InputText = defineComponent<InputTextProps>((p) => {
    const background = p.background;
    const left = p.left;
    const top = p.top;
    const width = p.width;
    const height = p.height;
    const value = p.value;
    const onInput = p.onInput;
    const placeholder = p.placeholder ?? '';
    const maxLength = p.maxLength;
    const fontSize = p.fontSize ?? 26;
    const color = p.color ?? DEFAULT_COLOR;
    const placeholderColor = p.placeholderColor ?? color;
    const textAlign = p.textAlign ?? 'center';
    const textLeft = p.textLeft ?? 0;
    const textWidth = p.textWidth ?? width;
    const empty = value === '';
    const showPlaceholder = empty && placeholder !== '';
    const font = fontRef('fonts/regular', 700);
    return (
        <view name="InputText" style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image source={background}
                style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, sizeMode: 'sliced' }} />
            <input value={value} placeholder="" maxLength={maxLength} onInput={onInput}
                style={{ position: 'absolute', left: textLeft, top: 0, width: textWidth, height: height,
                    fontSize: fontSize, color: color, textAlign: textAlign }} />
            <text visible={showPlaceholder} value={placeholder}
                style={{ position: 'absolute', left: textLeft, top: 0, width: textWidth, height: height,
                    font: font, fontSize: fontSize, color: placeholderColor, bold: true,
                    horizontalAlign: textAlign, verticalAlign: 'center' }} />
        </view>
    );
});
