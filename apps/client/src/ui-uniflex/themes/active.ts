import type { FontRef, ImageRef } from '../../kits/uniflex/api/core/index';
import { classicTheme } from './classic/theme';
import { midnightTheme } from './midnight/theme';
import { restoredTheme } from './restored/theme';

export type ThemeTextAlign = 'left' | 'center' | 'right';

/** Keep resource discriminants while allowing different colors, aligns, and dimensions. */
type ThemeValues<T> = T extends FontRef | ImageRef ? T
    : T extends ThemeTextAlign ? ThemeTextAlign
    : T extends string ? string
    : T extends number ? number
    : T extends object ? { readonly [K in keyof T]: ThemeValues<T[K]> } : T;

export type ComponentTheme = ThemeValues<typeof classicTheme>;
export type ThemeName = 'classic' | 'midnight' | 'restored';

export const themes: {
    readonly classic: ComponentTheme;
    readonly midnight: ComponentTheme;
    readonly restored: ComponentTheme;
} = {
    classic: classicTheme,
    midnight: midnightTheme,
    restored: restoredTheme,
};

/** Default skin; pass `theme` to components for runtime switching. Explicit skin props take precedence. */
export { classicTheme, midnightTheme, restoredTheme };
export { classicTheme as theme };
