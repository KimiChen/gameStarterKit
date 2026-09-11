import { CocosProvider, type CocosResourceMapping } from "../../../../lib/uniflex/mod/cocos/index";
import type { Node } from "cc";
import { UniFlexRuntime, type UniFlexUIBundle } from "../../runtime";

export { CocosProvider };
export type { CocosResourceMapping };
export type { UniFlexUIBundle as UniFlexCocosUIBundle };

export interface UniFlexCocosRuntimeOptions {
    readonly container: Node;
    readonly resources: CocosResourceMapping;
    readonly loadUI: (provider: CocosProvider) => Promise<UniFlexUIBundle>;
}

export class UniFlexCocosRuntime extends UniFlexRuntime<CocosProvider> {
    constructor(options: UniFlexCocosRuntimeOptions) {
        super({
            provider: new CocosProvider({ container: options.container, resources: options.resources }),
            loadUI: options.loadUI,
        });
    }
}
