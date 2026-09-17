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
    "字体退回 Editor 默认，不承诺与 Web 像素级一致",
    "ActionButton 描边取组件定义上的默认值；实例级 outlineColor 不能在无 Gear 时覆盖",
]);
