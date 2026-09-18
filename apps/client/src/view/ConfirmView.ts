import { BlockInputEvents, UITransform, type Node } from "cc";
import { CocosView } from "./CocosView";
import type { ConfirmLogic } from "../logic/page/ConfirmLogic";
import { UniFlexCocosRuntime } from "../kits/uniflex/api/cocos/index";
import { Confirm, loadGameUI } from "../ui-uniflex/generated/ui";
import { resourceMap } from "../ui-uniflex/generated/resource-map";

/** 路由和关闭仍由 ViewMgr 拥有；UniFlex 只负责这一次 Confirm 的渲染。 */
export class ConfirmView extends CocosView {
    private runtime: UniFlexCocosRuntime | null = null;
    private parentLayer: Node | null = null;
    private readonly resize = (): void => {
        const parent = this.parentLayer?.getComponent(UITransform);
        const transform = this.root.getComponent(UITransform);
        if (!parent || !transform) return;
        transform.width = parent.width;
        transform.height = parent.height;
        this.root.setPosition((0.5 - parent.anchorX) * parent.width, (0.5 - parent.anchorY) * parent.height);
    };

    mountToLayer(parent: Node, width: number, height: number, fullscreen: boolean): void {
        super.mountToLayer(parent, width, height, fullscreen);
        this.parentLayer = parent;
        parent.on("size-changed", this.resize, this);
    }

    protected onCreate(): void {
        // 计划/字体还在加载时也要挡住底层场景输入。
        this.root.addComponent(BlockInputEvents);
    }

    async setup(logic: ConfirmLogic): Promise<void> {
        const context = this.lifecycleContext;
        if (!context?.isActive()) throw new Error("Confirm 生命周期已结束。");
        if (this.runtime) throw new Error("Confirm 已完成配置。");
        const runtime = new UniFlexCocosRuntime({
            container: this.root,
            resources: resourceMap,
            loadUI: loadGameUI,
        });
        this.runtime = runtime;
        await runtime.start(Confirm, { logic, isActive: () => context.isActive() && this.acceptsInput });
    }

    protected onCloseLifecycle(): void {
        this.parentLayer?.off("size-changed", this.resize, this);
        this.parentLayer = null;
        const runtime = this.runtime;
        this.runtime = null;
        runtime?.dispose();
    }
}
