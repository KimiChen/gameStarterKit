import { defineView } from '@uniflex/compiler';
import { AllianceGiftPanel, type AllianceGiftPanelProps } from './AllianceGiftPanel';

export type AllianceGiftParams = Omit<AllianceGiftPanelProps, 'visible'>;

export const AllianceGift = defineView<AllianceGiftParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceGiftPage" style={{ width: 750, height: 1624 }}>
            <AllianceGiftPanel title={params.title} tab={params.tab}
                emptyText={params.emptyText} capText={params.capText}
                claimLabel={params.claimLabel} onBack={params.onBack}
                onClaimAll={params.onClaimAll} onAction={params.onAction}
                onSelectTab={params.onSelectTab} />
        </view>
    );
});
