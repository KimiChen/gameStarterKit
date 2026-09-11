/** Deterministic JSON encoding shared by the compiler, build tools and Providers.
 * Object keys are sorted; array order is significant. Only plain JSON values
 * are accepted. In particular no functions, getters, undefined or non-finite numbers.
 */
export declare function canonicalJson(value: unknown): string;
/** Platform-neutral SHA-256 for runtimes without WebCrypto, including LAN HTTP previews. */
export declare function sha256(bytes: Uint8Array): string;
export declare function jsonHash(value: unknown): string;
/** Call only after canonicalJson has validated the acyclic JSON value. */
export declare function freezeJson(value: unknown): void;
