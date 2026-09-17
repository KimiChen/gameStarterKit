import catalog from './screens.json';
import generatedPsdComponents from './components.generated.json';
import type { RegisteredComponent } from './psd-ownership';

export type { RegisteredComponent } from './psd-ownership';

export interface ScreenCanvas {
    readonly width: number;
    readonly height: number;
}

export interface ScreenEntry {
    readonly id: string;
    readonly aliases: readonly string[];
    readonly default?: boolean;
    readonly canvas: ScreenCanvas;
    readonly componentName: string;
    readonly rootName: string;
    readonly source: string;
}

export interface ScreenCatalog {
    readonly screens: readonly ScreenEntry[];
    readonly components: readonly RegisteredComponent[];
}

export const screenCatalog = catalog as ScreenCatalog;

/** defineComponent discovery for PSD ownership. FGUI export merges this with screenCatalog.components. */
export const psdComponents = generatedPsdComponents.components as readonly RegisteredComponent[];

export function findPreviewScreen(id: string | null | undefined): ScreenEntry | null {
    if (!id) return screenCatalog.screens.find((screen) => screen.default) ?? null;
    const key = id.trim().toLowerCase();
    if (!key) return null;
    return screenCatalog.screens.find((screen) =>
        screen.id === key || screen.aliases.some((alias) => alias.toLowerCase() === key)) ?? null;
}
