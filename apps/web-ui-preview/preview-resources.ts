import { ResourceStore, sha256, type ResourceEntry, type ProviderHostContext } from "../client/src/kits/uniflex/api/provider/index";
import { UniFlexRuntime } from "../client/src/kits/uniflex/api/core/index";
import { WebProvider, type UniFlexWebRuntimeOptions, type WebResourceMapping } from "../client/src/kits/uniflex/api/web/index";
// Web-only host adapter. Keep this SDK driver dependency here, out of the Cocos/kit API.
import { DOMHostDriver } from "../client/src/lib/uniflex/mod/web/dom-host";
import type { WebAsset } from "../client/src/lib/uniflex/mod/web/web-provider";

/** One immutable resource version per document; runtimes retain independent navigation and state. */
export class PreviewResources {
    readonly store: ResourceStore<WebAsset>;
    private readonly abort = new AbortController();

    constructor(private readonly document: Document, private readonly mapping: WebResourceMapping) {
        this.store = new ResourceStore(
            (entry) => this.load(entry),
            (asset) => {
                if (asset.font) document.fonts.delete(asset.font);
                URL.revokeObjectURL(asset.url);
            },
            async (ref) => ({ value: await (await this.fetch(ref)).json() }),
        );
    }

    private async fetch(ref: { id: string; sha256: string }): Promise<Response> {
        const mapped = this.mapping[ref.id];
        if (!mapped || mapped.sha256 !== ref.sha256) throw new Error(`Resource mapping mismatch: ${ref.id}`);
        const response = await fetch(mapped.url, { signal: this.abort.signal });
        if (!response.ok) throw new Error(`Resource ${ref.id}: HTTP ${response.status}`);
        return response;
    }

    private async load(entry: ResourceEntry): Promise<WebAsset> {
        const bytes = await (await this.fetch(entry)).arrayBuffer();
        const subtle = globalThis.crypto?.subtle;
        const hash = subtle
            ? Array.from(new Uint8Array(await subtle.digest("SHA-256", bytes)), (n) => n.toString(16).padStart(2, "0")).join("")
            : sha256(new Uint8Array(bytes));
        if (hash !== entry.sha256) throw new Error(`Resource checksum mismatch: ${entry.id}`);
        const url = URL.createObjectURL(new Blob([bytes], { type: entry.kind === "font" ? "font/ttf" : "image/png" }));
        try {
            if (entry.kind === "font") {
                const family = `UniFlex-${entry.sha256.slice(0, 16)}`;
                const font = new FontFace(family, bytes, { weight: String(entry.weight) });
                await font.load();
                this.abort.signal.throwIfAborted();
                this.document.fonts.add(font);
                return { url, font, family };
            }
            const image = this.document.createElement("img");
            image.src = url;
            await image.decode();
            this.abort.signal.throwIfAborted();
            if (image.naturalWidth !== entry.width || image.naturalHeight !== entry.height)
                throw new Error(`Decoded size mismatch: ${entry.id}`);
            return { url, image };
        } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
        }
    }

    dispose(): void {
        this.abort.abort();
        this.store.dispose();
    }
}

/** Reuse the SDK compositor and lifecycle; only supply the host's shared resource resolver. */
class PreviewProvider extends WebProvider {
    declare readonly assets: ResourceStore<WebAsset>;

    constructor(private readonly previewOptions: UniFlexWebRuntimeOptions, private readonly pool: PreviewResources) {
        super(previewOptions);
        this.assets = pool.store;
    }

    protected override createHost(context: ProviderHostContext): ReturnType<WebProvider["createHost"]> {
        const options = this.previewOptions;
        const driver = new DOMHostDriver(options.container, this.pool.store.context(context.resources),
            options.width ?? 750, options.height ?? 1334, context.anchorsChanged, options.onScroll);
        return {
            driver,
            metrics: driver.metrics,
            destroy: () => driver.destroy(),
            inspect: () => driver.inspect(),
            findAnchor: (name) => driver.findAnchor(name),
            present: (activity, order, options, transitionState) => driver.present(activity, order, options, transitionState),
        };
    }
}

export function createPreviewRuntime(options: UniFlexWebRuntimeOptions, pool: PreviewResources) {
    return new UniFlexRuntime<WebProvider>({ provider: new PreviewProvider(options, pool), loadUI: options.loadUI });
}
