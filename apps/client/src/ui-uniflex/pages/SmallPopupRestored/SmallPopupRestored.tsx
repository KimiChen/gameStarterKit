import { defineView } from '@uniflex/compiler';
import { PopupFrame } from '../../components/popup/PopupFrame';

export interface SmallPopupRestoredParams {
    readonly title?: string;
    readonly onClose?: () => void;
}

const PANEL_LEFT = 21;
const PANEL_TOP = 557;
const PANEL_WIDTH = 708;
const PANEL_HEIGHT = 510;

export const SmallPopupRestored = defineView<SmallPopupRestoredParams, void>({ zIndex: 'window' }, (context) => {
    return (
        <view name="SmallPopupRestoredPage" style={{ width: 750, height: 1624 }}>
            <PopupFrame title={context.params.title ?? '标题'} kind="small" left={PANEL_LEFT} top={PANEL_TOP}
                width={PANEL_WIDTH} height={PANEL_HEIGHT} onClose={context.params.onClose} />
            <view name="SmallPopupRestored/Content"
                style={{ position: 'absolute', left: PANEL_LEFT, top: PANEL_TOP, width: PANEL_WIDTH, height: PANEL_HEIGHT }} />
        </view>
    );
});
