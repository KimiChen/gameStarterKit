import { WebProvider, type WebProviderOptions } from "../../../../lib/uniflex/mod/web/index";
import { UniFlexRuntime, type UniFlexUIBundle } from "../../runtime";

export { WebProvider };
export type { WebProviderOptions, WebResourceMapping } from "../../../../lib/uniflex/mod/web/index";

export interface UniFlexWebRuntimeOptions extends WebProviderOptions {
    readonly loadUI: (provider: WebProvider) => Promise<UniFlexUIBundle>;
}

export class UniFlexWebRuntime extends UniFlexRuntime<WebProvider> {
    constructor({ loadUI, ...options }: UniFlexWebRuntimeOptions) {
        super({ provider: new WebProvider(options), loadUI });
    }
}
