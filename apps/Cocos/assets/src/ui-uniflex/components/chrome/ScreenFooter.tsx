import { defineComponent } from '@uniflex/compiler';
import { imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';
import { BackButton } from './BackButton';

export interface ScreenFooterProps {
    readonly source?: ImageRef;
    readonly backLeft?: number;
    readonly onBack?: () => void;
}

export const SCREEN_FOOTER_HEIGHT = 110;
const FOOTER_WIDTH = 750;
const DEFAULT_BACK_LEFT = 13;
const DEFAULT_BACK_INSET = 27;

/** Footer bar + back arrow, pinned to the parent bottom. */
export const ScreenFooter = defineComponent<ScreenFooterProps>((p) => {
    const source = p.source ?? imageRef('ui/mail/footer');
    const backLeft = p.backLeft ?? DEFAULT_BACK_LEFT;
    const onBack = p.onBack;
    return (
        <view name="ScreenFooter" style={{ position: 'absolute', left: 0, bottom: 0, width: FOOTER_WIDTH, height: SCREEN_FOOTER_HEIGHT }}>
            <image source={source}
                style={{ position: 'absolute', left: 0, top: 0, width: FOOTER_WIDTH, height: SCREEN_FOOTER_HEIGHT, sizeMode: 'sliced' }} />
            <BackButton left={backLeft} top={DEFAULT_BACK_INSET} onClick={onBack} />
        </view>
    );
});
