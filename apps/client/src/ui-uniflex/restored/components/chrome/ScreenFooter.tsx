import { defineComponent } from '@uniflex/compiler';
import { imageRef, type ImageRef } from '../../../../kits/uniflex/api/core/index';
import { BackButton } from './BackButton';

export interface ScreenFooterProps {
    readonly top: number;
    readonly source?: ImageRef;
    readonly backLeft?: number;
    readonly backTop?: number;
    readonly onBack?: () => void;
}

const FOOTER_WIDTH = 750;
const FOOTER_HEIGHT = 110;
const DEFAULT_BACK_LEFT = 13;
const DEFAULT_BACK_INSET = 27;

/** Footer bar + back arrow. `backLeft`/`backTop` are page-absolute so assembled values paste through. */
export const ScreenFooter = defineComponent<ScreenFooterProps>((p) => {
    const top = p.top;
    const source = p.source ?? imageRef('ui/mail/footer');
    const backLeft = p.backLeft ?? DEFAULT_BACK_LEFT;
    const backTop = p.backTop ?? (top + DEFAULT_BACK_INSET);
    const buttonTop = backTop - top;
    const onBack = p.onBack;
    return (
        <view name="ScreenFooter" style={{ position: 'absolute', left: 0, top: top, width: FOOTER_WIDTH, height: FOOTER_HEIGHT }}>
            <image source={source}
                style={{ position: 'absolute', left: 0, top: 0, width: FOOTER_WIDTH, height: FOOTER_HEIGHT, sizeMode: 'sliced' }} />
            <BackButton left={backLeft} top={buttonTop} onClick={onBack} />
        </view>
    );
});
