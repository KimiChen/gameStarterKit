import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

export interface BackButtonProps {
    readonly top: number;
    readonly left?: number;
    readonly onClick?: () => void;
}

const WIDTH = 64;
const HEIGHT = 56;
const DEFAULT_LEFT = 13;

/** Footer back arrow. `left`/`top` are page-absolute so assembled values paste through. */
export const BackButton = defineComponent<BackButtonProps>((p) => {
    const left = p.left ?? DEFAULT_LEFT;
    const top = p.top;
    const icon = imageRef('ui/mail/back');
    return (
        <view name="BackButton" interaction="press" accessibilityLabel="返回" onClick={() => p.onClick?.()}
            style={{ position: 'absolute', left: left, top: top, width: WIDTH, height: HEIGHT }}>
            <image source={icon} style={{ width: WIDTH, height: HEIGHT }} />
        </view>
    );
});
