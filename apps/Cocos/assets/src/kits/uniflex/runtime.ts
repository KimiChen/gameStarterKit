import {
    createSurfaceNavigator,
    type BoundUILayer,
    type SurfaceNavigator,
    type UIDefinition,
    type UISurfaceRegistry,
} from '../../lib/uniflex/mod/core/navigation';
import type { UIProvider } from '../../lib/uniflex/mod/core/index';

export interface UniFlexUIBundle {
    readonly registry: UISurfaceRegistry;
    readonly layers: readonly BoundUILayer[];
}

export interface UniFlexRuntimeProvider extends UIProvider {
    inspect(): readonly { readonly nodes: readonly unknown[] }[];
    dispose(): void;
}

export interface UniFlexRuntimeOptions<Provider extends UniFlexRuntimeProvider> {
    readonly provider: Provider;
    readonly loadUI: (provider: Provider) => Promise<UniFlexUIBundle>;
    readonly createNavigator?: typeof createSurfaceNavigator;
}

export interface UniFlexDesignSnapshot {
    readonly schemaVersion: 1;
    readonly kind: 'uniflex-design-snapshot';
    readonly canvas: { readonly width: number; readonly height: number };
    readonly nodes: readonly unknown[];
}

/** Owns one provider and navigation lifetime without importing either host or business UI. */
export class UniFlexRuntime<Provider extends UniFlexRuntimeProvider> {
    readonly provider: Provider;
    private navigator: SurfaceNavigator | null = null;
    private stopped = false;
    private started = false;

    constructor(private readonly options: UniFlexRuntimeOptions<Provider>) {
        this.provider = options.provider;
    }

    async start<Params, Result>(
        initial: UIDefinition<Params, Result>,
        params: Params,
    ): Promise<void> {
        if (this.stopped) throw new Error('UniFlex UI runtime has stopped.');
        if (this.started) throw new Error('UniFlex UI runtime has already started.');
        this.started = true;
        let unownedBundle: UniFlexUIBundle | undefined;
        try {
            const bundle = await this.options.loadUI(this.provider);
            unownedBundle = bundle;
            if (this.stopped)
                throw new Error('UniFlex UI runtime stopped during loading.');
            const navigator = (this.options.createNavigator ?? createSurfaceNavigator)(
                this.provider,
                bundle.registry,
                { layers: bundle.layers },
            );
            this.navigator = navigator;
            unownedBundle = undefined;
            await navigator.goto(initial, params).ready;
            if (this.stopped) throw new Error('UniFlex UI runtime stopped during mounting.');
        } catch (error) {
            try {
                if (unownedBundle) disposeBundle(unownedBundle);
            } finally {
                this.dispose();
            }
            throw error;
        }
    }

    back(): Promise<boolean> {
        if (!this.navigator) return Promise.resolve(false);
        return this.navigator.back();
    }

    snapshot(width: number, height: number): UniFlexDesignSnapshot {
        return {
            schemaVersion: 1,
            kind: 'uniflex-design-snapshot',
            canvas: { width, height },
            nodes: this.provider.inspect().flatMap((entry) => entry.nodes),
        };
    }

    dispose(): void {
        if (this.stopped) return;
        this.stopped = true;
        const navigator = this.navigator;
        this.navigator = null;
        try {
            navigator?.destroy();
        } finally {
            this.provider.dispose();
        }
    }
}

function disposeBundle(bundle: UniFlexUIBundle): void {
    let failed = false;
    let failure: unknown;
    for (const entry of [...bundle.registry.bindings, ...bundle.layers]) {
        try {
            entry.dispose?.();
        } catch (error) {
            if (!failed) failure = error;
            failed = true;
        }
    }
    if (failed) throw failure;
}
