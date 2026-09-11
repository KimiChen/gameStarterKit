import type { CompiledComponent, ComponentRuntimeOptions } from '../runtime/runtime.js';
import type { HostDriver } from '../runtime/host-plan.js';
import type { LayoutMetrics, MountedComponent, PresentedSurface, SurfaceActivity, SurfacePresentationOptions, SurfaceTransitionState, UIProvider } from './ui-provider.js';
import type { LayoutRect } from '../layout/flex-types.js';
import type { ResourceProvider } from './resource-provider.js';
import type { ResourceLease } from './resource-provider.js';
import type { InspectedNode } from './inspection.js';
export interface ProviderHost<Native> {
    readonly driver: HostDriver<Native>;
    readonly metrics: LayoutMetrics;
    destroy(): void;
    inspect?(): readonly InspectedNode[];
    present?(activity: SurfaceActivity, order: number, options: SurfacePresentationOptions, transitionState: SurfaceTransitionState): void | Promise<void>;
    findAnchor?(name: string): LayoutRect | undefined;
}
export interface ProviderHostContext {
    anchorsChanged(): void;
    readonly resources?: ResourceLease;
}
export interface NativeSurfacePresentation<Native> {
    readonly id: number;
    readonly host: ProviderHost<Native>;
    readonly activity: SurfaceActivity;
    readonly presentation: SurfacePresentationOptions;
    readonly transitionState: SurfaceTransitionState;
}
export declare abstract class RetainedUIProvider<Native> implements UIProvider {
    #private;
    readonly assets: ResourceProvider;
    readonly compositor: Readonly<{
        present: (surfaces: readonly PresentedSurface[]) => Promise<void>;
    }>;
    readonly anchors: Readonly<{
        resolve: (name: string) => LayoutRect | undefined;
        subscribe: (listener: () => void) => () => boolean;
    }>;
    constructor(assets: ResourceProvider);
    protected abstract createHost(context: ProviderHostContext): ProviderHost<Native>;
    mount<Props>(component: CompiledComponent<Props>, props: Props, runtimeOptions?: ComponentRuntimeOptions): MountedComponent<Props>;
    private present;
    private resolvePresentation;
    private setRuntimeActivity;
    protected presentNative(entries: readonly NativeSurfacePresentation<Native>[]): Promise<void>;
    private resolveAnchor;
    private notifyAnchorsChanged;
    dispose(): void;
    protected disposeNative(): void;
    /** Read-only presentation checkpoint; tokens contain no platform handles. */
    inspectPresentation(): readonly PresentedSurface[];
    /** Read-only diagnostics for launcher QA; contains no host handles. */
    inspect(): {
        nodes: readonly InspectedNode[];
        layout: LayoutMetrics;
        runtime: {
            commits: number;
            commands: number;
            nodesCreated: number;
            nodesDestroyed: number;
            componentUpdates: number;
        };
    }[];
}
