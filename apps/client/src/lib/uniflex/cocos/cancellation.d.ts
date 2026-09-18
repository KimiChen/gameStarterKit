/** Native JSB / mini-games need not provide the DOM AbortController global. */
export declare class Cancellation {
    aborted: boolean;
    private readonly listeners;
    subscribe(listener: () => void): () => void;
    abort(): void;
}
