export declare function promiseFinally<T>(promise: Promise<T>, callback: () => unknown): Promise<T>;
export declare function createAggregateError(errors: readonly unknown[], message: string): Error;
