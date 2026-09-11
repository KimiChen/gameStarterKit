export interface ToastOptions {
    readonly durationMs?: number;
    readonly level?: 'info' | 'success' | 'warning' | 'error';
}
/** Transient messages live in the reserved system layer and never enter navigation history. */
export interface ToastService {
    show(message: string, options?: ToastOptions): void;
}
export interface LoadingHandle {
    release(): void;
}
export interface LoadingService {
    readonly active: boolean;
    readonly keys: readonly string[];
    acquire(key: string): LoadingHandle;
    subscribe(listener: () => void): () => void;
}
/** Reference-counted loading state so concurrent requests cannot hide each other. */
export declare function createLoadingService(): LoadingService;
