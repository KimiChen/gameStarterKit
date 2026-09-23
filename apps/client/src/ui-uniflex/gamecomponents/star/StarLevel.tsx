import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../kits/uniflex/api/core/index';

/** Cut size of one upgrade star. The whole frame is one image. */
export const STAR_WIDTH = 68;
export const STAR_HEIGHT = 64;

export interface StarLevelProps {
    /** Lit corners, 0–5, counterclockwise from the top. 0 is empty, 5 is full. */
    readonly value: number;
    readonly visible?: boolean;
}

/** One upgrade star. 0–5 swap a single precomposed 68×64 frame. */
export const StarLevel = defineComponent<StarLevelProps>((p) => {
    const value = p.value;
    const clamped = value <= 0 ? 0 : value >= 5 ? 5 : value;
    const lit = Math.floor(clamped);
    const visible = p.visible !== false;
    const empty = imageRef('ui/star-upgrade/star-empty');
    const star1 = imageRef('ui/star-upgrade/star-1');
    const star2 = imageRef('ui/star-upgrade/star-2');
    const star3 = imageRef('ui/star-upgrade/star-3');
    const star4 = imageRef('ui/star-upgrade/star-4');
    const full = imageRef('ui/star-upgrade/star-full');
    const frames = [empty, star1, star2, star3, star4, full];
    const source = frames[lit] ?? empty;
    return (
        <view name="StarLevel" visible={visible}
            style={{ position: 'absolute', left: 0, top: 0, width: 68, height: 64 }}>
            <image source={source}
                style={{ position: 'absolute', left: 0, top: 0, width: 68, height: 64 }} />
        </view>
    );
});
