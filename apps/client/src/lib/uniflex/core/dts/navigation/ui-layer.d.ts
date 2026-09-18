import type { CompiledComponent } from '../runtime/runtime.js';
import type { ProviderMetrics, StageAnchorRegistry } from '../provider/ui-provider.js';
import type { LayerZIndex } from './semantic-z-index.js';
import type { UINavigationContext, PreparedComponentPin, PreparedComponentSnapshot } from './ui-surface.js';
import type { HostPlan } from '../runtime/host-plan.js';
declare const uiLayerBrand: unique symbol;
export interface UILayerDefinitionOptions {
    readonly zIndex: LayerZIndex;
}
export interface UILayerDefinition {
    readonly id: string;
    readonly options: Readonly<UILayerDefinitionOptions>;
    readonly [uiLayerBrand]: true;
}
export interface UILayerRenderContext extends UINavigationContext {
    readonly anchors: StageAnchorRegistry;
    readonly metrics: ProviderMetrics | undefined;
}
export interface BoundUILayer {
    readonly id: string;
    readonly layer: UILayerDefinition;
    readonly component: CompiledComponent<UILayerRenderContext>;
    readonly prepare?: () => Promise<void>;
    readonly acquirePrepared?: () => Promise<PreparedComponentPin<UILayerRenderContext>>;
    readonly evictPrepared?: () => boolean;
    readonly inspectPrepared?: () => PreparedComponentSnapshot;
    readonly dispose?: () => void;
    /** Small navigation metadata available before the layer Plan is loaded. */
    readonly navigation?: Pick<HostPlan, 'name' | 'tabTargets'>;
}
export declare function defineUILayer(id: string, options: UILayerDefinitionOptions): UILayerDefinition;
export declare function bindUILayer(layer: UILayerDefinition, component: CompiledComponent<UILayerRenderContext>): BoundUILayer;
export declare function bindDeferredUILayer(layer: UILayerDefinition, navigation: Pick<HostPlan, 'name' | 'tabTargets'>, load: () => Promise<CompiledComponent<UILayerRenderContext>>): BoundUILayer;
export {};
