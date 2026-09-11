import type { ResourceCatalog, ResourceProvider, ResourceLease } from './resource-provider.js';
import type { CompiledComponent } from '../runtime/runtime.js';
export declare function prepareUIResources(assets: ResourceProvider, catalog: ResourceCatalog, ids: readonly string[]): Promise<void>;
/** Resource lifetime belongs to the binding; each mounted instance retains its own lease. */
export declare function prepareUIComponent<Props>(assets: ResourceProvider, catalog: ResourceCatalog, ids: readonly string[], component: CompiledComponent<Props>): Promise<CompiledComponent<Props>>;
/** @internal */
export declare function retainComponentResources(component: object): ResourceLease | undefined;
/** @internal A separately mounted child uses the parent's prepared resource closure. */
export declare function retainPreparedComponent<Props>(parent: object, child: CompiledComponent<Props>): CompiledComponent<Props>;
/** @internal */
export declare function releaseComponentResources(component: object): void;
