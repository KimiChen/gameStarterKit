import { _decorator, Color, Component, Label, Node, ResolutionPolicy, UITransform, view } from "cc";
import { DESIGN_WIDTH } from "../designSpec";
import { createPreviewScreen, previewCanvasHeight, resolvePreviewScreenId, type PreviewHandle } from "./previewCatalog";

const { ccclass } = _decorator;

/** UniFlex 独立预览壳，不挂到默认登录场景。默认 PreviewHome，点格子进程内切页。 */
@ccclass("UniFlexPreview")
export class UniFlexPreview extends Component {
    private runtime: PreviewHandle | null = null;
    private statusNode: Node | null = null;
    private currentId = "";
    private alive = true;

    onLoad(): void {
        this.statusNode = this.showMessage("UniFlex preview booting...");
        const query = typeof location === "undefined" ? null : new URLSearchParams(location.search);
        const requested = query?.get("screen") || query?.get("ui") || null;
        this.openScreen(resolvePreviewScreenId(requested), query);
    }

    onDestroy(): void {
        this.alive = false;
        const runtime = this.runtime;
        this.runtime = null;
        runtime?.dispose();
        this.statusNode?.destroy();
        this.statusNode = null;
    }

    private openScreen(id: string, query: URLSearchParams | null): void {
        if (!this.alive) return;
        if (this.currentId === id && this.runtime) return;
        const prev = this.runtime;
        this.runtime = null;
        prev?.dispose();
        this.currentId = id;
        view.setDesignResolutionSize(DESIGN_WIDTH, previewCanvasHeight(id), ResolutionPolicy.FIXED_WIDTH);
        const preview = createPreviewScreen(this.node, id, {
            query,
            navigate: (target) => this.openScreen(resolvePreviewScreenId(target), query),
        });
        this.runtime = preview;
        void preview.ready.then(() => {
            if (this.runtime !== preview) return;
            this.statusNode?.destroy();
            this.statusNode = null;
        }).catch((error) => {
            if (this.runtime !== preview) return;
            const message = error instanceof Error ? error.message : String(error);
            console.error("[UniFlexPreview] 预览启动失败：", error);
            this.runtime?.dispose();
            this.runtime = null;
            this.showError(message);
        });
    }

    private showError(message: string): void {
        this.statusNode?.destroy();
        this.statusNode = this.showMessage(`UniFlex preview failed\n${message}`, true);
    }

    private showMessage(message: string, error = false): Node {
        const node = new Node("UniFlexPreviewError");
        node.layer = this.node.layer;
        this.node.addChild(node);
        const transform = node.addComponent(UITransform);
        const size = view.getVisibleSize();
        transform.setContentSize(size.width, size.height);
        const label = node.addComponent(Label);
        label.string = message;
        label.fontSize = 24;
        label.lineHeight = 34;
        label.color = error ? new Color(255, 220, 220, 255) : new Color(220, 235, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.CLAMP;
        return node;
    }
}
