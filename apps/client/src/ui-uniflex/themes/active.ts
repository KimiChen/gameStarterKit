import type { FontRef, ImageRef } from '../../kits/uniflex/api/core/index';
import { classicTheme } from './classic/theme';
import { restoredTheme } from './restored/theme';

export type ThemeTextAlign = 'left' | 'center' | 'right';

/** Keep resource discriminants while allowing different colors, aligns, and dimensions. */
type ThemeValues<T> = T extends FontRef | ImageRef ? T
    : T extends ThemeTextAlign ? ThemeTextAlign
    : T extends string ? string
    : T extends number ? number
    : T extends object ? { readonly [K in keyof T]: ThemeValues<T[K]> } : T;

export type ComponentTheme = ThemeValues<typeof classicTheme>;
export type ThemeName = 'classic' | 'restored';

export const themes: {
    readonly classic: ComponentTheme;
    readonly restored: ComponentTheme;
} = {
    classic: classicTheme,
    restored: restoredTheme,
};

/** Default skin; pass `theme` to components for runtime switching. Explicit skin props take precedence. */
export { classicTheme, restoredTheme };
export { classicTheme as theme };
