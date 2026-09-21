import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme, type ThemeTextAlign } from '../../themes/active';

export interface InputTextProps {
    readonly theme?: ComponentTheme;
    readonly background?: ImageRef;
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
    readonly textAlign?: ThemeTextAlign;
    readonly textLeft?: number;
    readonly textWidth?: number;
}

/** Background + input + placeholder text. Callers inject the skin. */
export const InputText = defineComponent<InputTextProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const background = p.background ?? theme.input.background;
    const left = p.left;
    const top = p.top;
    const width = p.width;
    const height = p.height;
    const value = p.value;
    const onInput = p.onInput;
    const placeholder = p.placeholder ?? '';
    const maxLength = p.maxLength;
    const fontSize = p.fontSize ?? p.theme?.input.fontSize ?? activeTheme.input.fontSize;
    const color = p.color ?? theme.input.color;
    const placeholderColor = p.placeholderColor ?? theme.input.placeholder;
    const textAlign = p.textAlign ?? p.theme?.input.textAlign ?? activeTheme.input.textAlign;
    const textLeft = p.textLeft ?? p.theme?.input.textLeft ?? activeTheme.input.textLeft;
    const textWidth = p.textWidth ?? (width - textLeft);
    const empty = value === '';
    const showPlaceholder = empty && placeholder !== '';
    const font = theme.input.font;
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
