import { defineView } from '@uniflex/compiler';
import { AllianceHelpPanel, type AllianceHelpPanelProps } from '../AllianceHelp/AllianceHelpPanel';

export type AllianceHelpRestoredParams = Omit<AllianceHelpPanelProps, 'visible'>;

export const AllianceHelpRestored = defineView<AllianceHelpRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceHelpPage" style={{ width: 750, height: 1624 }}>
            <AllianceHelpPanel title={params.title} pointsLabel={params.pointsLabel}
                pointsText={params.pointsText} emptyText={params.emptyText}
                actionLabel={params.actionLabel} onClose={params.onClose}
                onCreate={params.onCreate} onAction={params.onAction} />
        </view>
    );
});
