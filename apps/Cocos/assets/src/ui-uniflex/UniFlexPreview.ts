import { _decorator, Color, Component, Label, Node, ResolutionPolicy, UITransform, view } from "cc";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../designSpec";
import { createBackpackPreview, createCharacterManagePreview, createConfirmPreview, createHeroDetailPreview, createHeroScreenPreview, createMailBattleReportPreview, createPromptPreview, createSettingsPreview } from "./preview";

const { ccclass } = _decorator;

/** UniFlex 独立预览壳，不挂到默认登录场景。 */
@ccclass("UniFlexPreview")
export class UniFlexPreview extends Component {
    private runtime: { dispose(): void } | null = null;
    private statusNode: Node | null = null;

    onLoad(): void {
        this.statusNode = this.showMessage("UniFlex preview booting...");
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        const query = typeof location === "undefined" ? null : new URLSearchParams(location.search);
        const backpack = query?.get("screen") === "backpack";
        const mail = query?.get("screen") === "mail";
        const settings = query?.get("screen") === "settings";
        const character = query?.get("screen") === "character";
        const hero = query?.get("screen") === "hero";
        const heroDetail = query?.get("screen") === "hero-detail";
        const prompt = query?.get("ui") === "prompt";
        if (backpack) view.setDesignResolutionSize(DESIGN_WIDTH, 1334, ResolutionPolicy.FIXED_WIDTH);
        if (mail) view.setDesignResolutionSize(DESIGN_WIDTH, 1334, ResolutionPolicy.FIXED_WIDTH);
        if (settings) view.setDesignResolutionSize(DESIGN_WIDTH, 1334, ResolutionPolicy.FIXED_WIDTH);
        if (hero) view.setDesignResolutionSize(DESIGN_WIDTH, 1334, ResolutionPolicy.FIXED_WIDTH);
        const preview = backpack
            ? createBackpackPreview(this.node)
            : mail ? createMailBattleReportPreview(this.node)
            : settings ? createSettingsPreview(this.node)
            : character ? createCharacterManagePreview(this.node)
            : hero ? createHeroScreenPreview(this.node)
            : heroDetail ? createHeroDetailPreview(this.node)
            : prompt ? createPromptPreview(this.node, query?.get("cancel") !== "0")
            : createConfirmPreview(this.node, query?.get("cancel") !== "0");
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

    onDestroy(): void {
        const runtime = this.runtime;
        this.runtime = null;
        runtime?.dispose();
        this.statusNode?.destroy();
        this.statusNode = null;
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
