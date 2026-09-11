import { _decorator, Component, ResolutionPolicy, view } from "cc";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../designSpec";
import { createBackpackPreview, createConfirmPreview } from "./preview";

const { ccclass } = _decorator;

/** UniFlex 独立预览壳，不挂到默认登录场景。 */
@ccclass("UniFlexPreview")
export class UniFlexPreview extends Component {
    private runtime: { dispose(): void } | null = null;

    onLoad(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        const query = typeof location === "undefined" ? null : new URLSearchParams(location.search);
        const backpack = query?.get("screen") === "backpack";
        if (backpack) view.setDesignResolutionSize(DESIGN_WIDTH, 1334, ResolutionPolicy.FIXED_WIDTH);
        const preview = backpack
            ? createBackpackPreview(this.node)
            : createConfirmPreview(this.node, query?.get("cancel") !== "0");
        this.runtime = preview;
        void preview.ready.catch((error) => {
            console.error("[UniFlexPreview] Confirm 预览启动失败：", error);
            this.runtime?.dispose();
            this.runtime = null;
        });
    }

    onDestroy(): void {
        const runtime = this.runtime;
        this.runtime = null;
        runtime?.dispose();
    }
}
