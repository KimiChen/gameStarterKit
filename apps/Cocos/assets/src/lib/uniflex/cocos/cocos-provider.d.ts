import { Node } from 'cc';
import { RetainedUIProvider } from '../core/provider.js';
import type { HostScrollSnapshot, NativeSurfacePresentation, ProviderHostContext, SurfaceActivity, SurfacePresentationOptions, SurfaceTransitionState } from '../core/provider.js';
import { CocosHostDriver } from './cocos-host.js';
import type { CocosHandle } from './cocos-host.js';
export interface CocosResourceMapping {
    readonly [id: string]: {
        readonly path: string;
        readonly sha256: string;
    };
}
export interface CocosProviderOptions {
    readonly container: Node;
    readonly resources: CocosResourceMapping;
    /** Optional launcher diagnostics; ordinary application providers leave this unset. */
    readonly onScroll?: (scroll: HostScrollSnapshot) => void;
    /** Disable synchronous diagnostic output during measurements. */
    readonly logFirstLayout?: boolean;
    /** Opt-in cumulative Flex and host writeback instrumentation for performance runs. */
    readonly profileLayout?: boolean;
}
export declare class CocosProvider extends RetainedUIProvider<CocosHandle> {
    #private;
    private readonly options;
    constructor(options: CocosProviderOptions);
    protected createHost(context: ProviderHostContext): {
        driver: CocosHostDriver;
        metrics: import("./cocos-host.js").CocosLayoutMetrics;
        destroy: () => void;
        inspect: () => import("../core/provider.js").InspectedNode[];
        findAnchor: (name: string) => {
            width: number;
            height: number;
            x: number;
            y: number;
        } | undefined;
        present: (activity: SurfaceActivity, order: number, options: SurfacePresentationOptions, transitionState: SurfaceTransitionState) => void | Promise<void>;
    };
    protected presentNative(entries: readonly NativeSurfacePresentation<CocosHandle>[]): Promise<void>;
    private capture;
    private syncBackdrops;
    private ensureBackdrop;
    private reorder;
    private destroyBackdrop;
    protected disposeNative(): void;
    /** Launcher-only diagnostics, deliberately absent from the business UIProvider contract. */
    runPerformanceSuite(): Promise<import("./cocos-performance.js").CocosPerformanceReport>;
}
