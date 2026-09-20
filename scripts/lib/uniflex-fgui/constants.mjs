/** FairyGUI published-package constants. Numeric values match fairygui.mjs. */

export const FGUI_MAGIC = 0x46475549;
export const FGUI_VERSION = 7;

export const PackageItemType = Object.freeze({
    Image: 0,
    Component: 3,
});

export const ObjectType = Object.freeze({
    Image: 0,
    Graph: 3,
    Loader: 4,
    Group: 5,
    Text: 6,
    Component: 9,
    Button: 12,
});

export const AutoSizeType = Object.freeze({
    None: 0,
    Both: 1,
    Height: 2,
    Shrink: 3,
});

export const AlignType = Object.freeze({
    Left: 0,
    Center: 1,
    Right: 2,
});

export const VertAlignType = Object.freeze({
    Top: 0,
    Middle: 1,
    Bottom: 2,
});

export const LoaderFillType = Object.freeze({
    None: 0,
    Scale: 1,
    ScaleFree: 4,
});

export const OverflowType = Object.freeze({
    Visible: 0,
    Hidden: 1,
    Scroll: 2,
});

export const ScrollType = Object.freeze({
    Horizontal: 0,
    Vertical: 1,
    Both: 2,
});

export const ScrollBarDisplayType = Object.freeze({
    Default: 0,
    Visible: 1,
    Auto: 2,
    Hidden: 3,
});

/** ScrollPane flags: touch drag on (16) + bounceback on (64); unset 512/2048 keep clipping on. */
export const SCROLL_PANE_FLAGS = 16 | 64;

export const RelationType = Object.freeze({
    Center_Center: 3,
    Middle_Middle: 10,
    Width: 14,
    Height: 15,
    Size: 24,
});

export const GraphType = Object.freeze({
    Rect: 1,
});

export const ButtonMode = Object.freeze({
    Common: 0,
});

export const DownEffect = Object.freeze({
    Scale: 2,
});

export const SLOT_HOSTS = Object.freeze(["PopupFrame"]);
export const BUTTON_COMPONENTS = Object.freeze(["ActionButton", "CloseButton"]);
/** Thin wrappers around ActionButton; instance label lives on the nested button. */
export const WRAPPER_BUTTONS = Object.freeze(["ConfirmButton", "CancelButton"]);
export const COMMON_COMPONENTS = Object.freeze([
    "ActionButton",
    "ConfirmButton",
    "CancelButton",
    "CloseButton",
    "ItemSlot",
    "PopupFrame",
]);

export const COMMON_PACKAGE = "UniFlex_Common";
export const PROJECT_TYPE = "CocosCreator";

/** Same face UniFlex web preview uses (`fonts/regular`). */
export const PREVIEW_FONT_FAMILY = "UniFlex";
export const PREVIEW_FONT_CANDIDATES = Object.freeze([
    "apps/Cocos/assets/resources/uniflex/fonts/regular.ttf",
    "apps/art/fairygui/assets/L10n_zh_hans/Font/siyuanheitiCNRegular.ttf",
]);

/** UniFlex web uses outlineWidth*2 as -webkit-text-stroke. FairyGUI-dom uses the same CSS. */
export function uniflexStrokeSize(outlineWidth) {
    const width = Number(outlineWidth) || 0;
    return width > 0 ? width * 2 : 0;
}

export const ACTION_OUTLINE = Object.freeze({
    ConfirmButton: "#643e14",
    CancelButton: "#4e783b",
});

export const ACTION_OUTLINE_BY_RESOURCE = Object.freeze({
    "ui/button/confirm": "#643e14",
    "ui/button/cancel": "#4e783b",
    "ui/button/yellow": "#643E14",
    "ui/button/red": "#6A2A28",
});

export const ObjectPropID = Object.freeze({
    Text: 0,
    Icon: 1,
    Color: 2,
    OutlineColor: 3,
    FontSize: 8,
});

export const BUTTON_CONTROLLER_PAGES = Object.freeze([
    ["0", "up"],
    ["1", "down"],
    ["2", "over"],
    ["3", "selectedOver"],
    ["4", "disabled"],
    ["5", "selectedDisabled"],
]);

export const DEFAULT_STYLES = Object.freeze({
    "PopupFrame/Title": Object.freeze({
        fontSize: 40, color: "#ffffff", outlineColor: "#593d84", outlineWidth: 2,
        bold: true, overflow: "shrink", horizontalAlign: "center", verticalAlign: "center",
    }),
    "Prompt/Message": Object.freeze({
        fontSize: 28, color: "#3f3254", overflow: "shrink",
        horizontalAlign: "center", verticalAlign: "center", wrap: true,
    }),
    "ActionButton/Label": Object.freeze({
        fontSize: 40, color: "#ffffff", outlineColor: "#643e14", outlineWidth: 2,
        overflow: "shrink", horizontalAlign: "center", verticalAlign: "center",
    }),
    "ActionButton/IconLabel": Object.freeze({
        fontSize: 40, color: "#ffffff", outlineWidth: 2, overflow: "shrink",
        horizontalAlign: "left", verticalAlign: "center",
    }),
    "WideMenuButton/Label": Object.freeze({
        fontSize: 28, color: "#3F3254", bold: true, overflow: "shrink",
        horizontalAlign: "center", verticalAlign: "center",
    }),
    "NotificationBadge/Count": Object.freeze({
        fontSize: 24, color: "#FFFFFF", bold: true, overflow: "shrink",
        horizontalAlign: "center", verticalAlign: "center",
        outlineColor: "#000000", outlineWidth: 2,
    }),
    "PopupFrame/Mask": Object.freeze({ backgroundColor: "#00000099" }),
});

export const KNOWN_LOSSES = Object.freeze([
    "flex 不进 FGUI，只进烘焙坐标",
    "visible 只导出当前预览态，页签内容不生成 controller",
    "disabled 只反映当前 opacity，不生成 setGray gear",
    "UniFlex defineComponent 导出为同名 FairyGUI 组件；可见图/尺寸/文字皮肤不同则内联，不生成 controller",
    "纯色背景导出为拉伸填充图，不使用 Graph 或 9 宫格（fairygui-dom 的 border-image 会画出格子线）",
    "press 的 UniFlex 组件导出为 Button；未登记的 press 容器保持为组",
    "range 只在预览拖动，不生成 GSlider",
    "FairyGUI-dom 用 webkit-text-stroke，字重/抗锯齿与 UniFlex canvas 不完全同像素",
]);
