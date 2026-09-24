import { defineView } from '@uniflex/compiler';
import { MailSharePanel, type MailSharePanelProps } from './MailSharePanel';

export type MailShareParams = Omit<MailSharePanelProps, 'visible'>;
export const MailShare = defineView<MailShareParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return <view name="MailShare" style={{ width: 750, height: 1624 }}>
        <MailSharePanel destinations={params.destinations} onClose={params.onClose} onSelect={params.onSelect} />
    </view>;
});
