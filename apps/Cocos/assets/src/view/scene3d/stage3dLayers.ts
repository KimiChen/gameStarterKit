/** Project settings store masks; Layers.nameToLayer instead returns a bit index. */
export const STAGE3D_DEFAULT_LAYER = 1 << 30;
export const STAGE3D_HIDDEN_LAYER = 1 << 0;
export const STAGE3D_OVERLAY_LAYER = 1 << 1;
/** Match the SC0 camera: hidden content is neither rendered nor picked. */
export const STAGE3D_CAMERA_MASK = STAGE3D_DEFAULT_LAYER | STAGE3D_OVERLAY_LAYER;
export const STAGE3D_PICK_MASK = STAGE3D_DEFAULT_LAYER;
export const STAGE3D_CAMERA_PRIORITY = 0;
