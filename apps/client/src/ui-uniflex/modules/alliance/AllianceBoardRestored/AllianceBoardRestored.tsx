import { defineView } from '@uniflex/compiler';
import { AllianceBoardPanel, type AllianceBoardPanelProps } from '../AllianceBoard/AllianceBoardPanel';

export type AllianceBoardRestoredParams = Omit<AllianceBoardPanelProps, 'visible'>;

export const AllianceBoardRestored = defineView<AllianceBoardRestoredParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceBoardPage" style={{ width: 750, height: 1624 }}>
            <AllianceBoardPanel title={params.title} tab={params.tab}
                placeholder={params.placeholder} emptyText={params.emptyText}
                onBack={params.onBack} onSend={params.onSend}
                onAction={params.onAction} onSelectTab={params.onSelectTab} />
        </view>
    );
});
