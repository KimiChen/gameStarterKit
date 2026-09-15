import { defineView } from '@uniflex/compiler';
import { PopupFrame } from '../../components/popup/PopupFrame';

export interface SmallPopupRestoredParams {
    readonly title?: string;
    readonly onClose?: () => void;
}

export const SmallPopupRestored = defineView<SmallPopupRestoredParams, void>({ zIndex: 'window' }, (context) => {
    return <PopupFrame title={context.params.title ?? '标题'} kind="small" height={510} onClose={context.params.onClose}>
        <view name="SmallPopupRestored/Content" style={{ width: '100%', height: '100%' }} />
    </PopupFrame>;
});
