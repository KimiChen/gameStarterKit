import { RetainedUIProvider } from '../core/provider.js';
import type { HostScrollSnapshot, NativeSurfacePresentation, ProviderHostContext, SurfaceActivity, SurfacePresentationOptions, SurfaceTransitionState } from '../core/provider.js';
import { DOMHostDriver } from './dom-host.js';
import type { DOMHandle } from './dom-host.js';
export interface WebResourceMapping {
    readonly [id: string]: {
        readonly url: string;
        readonly sha256: string;
    };
}
export type WebAsset = {
    readonly url: string;
    readonly image?: HTMLImageElement;
    readonly font?: FontFace;
    readonly family?: string;
};
export interface WebProviderOptions {
    readonly container: HTMLElement;
    readonly resources: WebResourceMapping;
    readonly width?: number;
    readonly height?: number;
    /** Optional launcher diagnostics; ordinary application providers leave this unset. */
    readonly onScroll?: (scroll: HostScrollSnapshot) => void;
}
export declare class WebProvider extends RetainedUIProvider<DOMHandle> {
    #private;
    private readonly options;
    constructor(options: WebProviderOptions);
    protected createHost(context: ProviderHostContext): {
        driver: DOMHostDriver;
        metrics: {
            dirtyRoots: number;
            measuredLeaves: number;
            percentageFallbacks: number;
            layoutPasses: number;
            layoutMs: number;
            writebackMs: number;
        };
        destroy: () => void;
        inspect: () => import("../core/index.js").InspectedNode[];
        findAnchor: (name: string) => {
            width: number;
            height: number;
            x: number;
            y: number;
        } | undefined;
        present: (activity: SurfaceActivity, order: number, options: SurfacePresentationOptions, transitionState: SurfaceTransitionState) => void | Promise<void>;
    };
    protected presentNative(entries: readonly NativeSurfacePresentation<DOMHandle>[]): Promise<void>;
    protected disposeNative(): void;
}
