export interface StoreFactoryContext<Environment> {
    readonly environment: Environment;
    readonly signal: AbortSignal;
    onDispose(dispose: () => void): void;
}
export interface StoreDefinition<Store extends object> {
    (): Store;
    readonly id: string;
}
export interface StoreRoot<Environment> {
    readonly environment: Environment;
    readonly signal: AbortSignal;
    readonly disposed: boolean;
    dispose(): void;
}
export declare function defineStore<Store extends object, Environment = unknown>(id: string, factory: (context: StoreFactoryContext<Environment>) => Store): StoreDefinition<Store>;
export declare function createStoreRoot<Environment>(environment: Environment): StoreRoot<Environment>;
export declare function getActiveStoreRoot<Environment = unknown>(): StoreRoot<Environment> | undefined;
