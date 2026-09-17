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
});

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
export const COMMON_COMPONENTS = Object.freeze([
    "ActionButton",
    "ConfirmButton",
    "CancelButton",
    "CloseButton",
    "PopupBackground",
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
    "PopupFrame/Mask": Object.freeze({ backgroundColor: "#00000099" }),
});

export const KNOWN_LOSSES = Object.freeze([
    "flex 不进 FGUI，只进烘焙坐标",
    "visible 只导出当前预览态，不生成 controller",
    "disabled 只反映当前 opacity，不生成 setGray gear",
    "共享组件以首次出现为模板；可见图不同则内联到页面，不生成 controller",
    "FairyGUI-dom 用 webkit-text-stroke，字重/抗锯齿与 UniFlex canvas 不完全同像素",
]);
