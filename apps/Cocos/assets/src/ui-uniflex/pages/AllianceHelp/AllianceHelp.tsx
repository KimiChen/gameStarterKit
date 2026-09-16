import { defineView } from '@uniflex/compiler';
import { AllianceHelpPanel, type AllianceHelpPanelProps } from './AllianceHelpPanel';

export type AllianceHelpParams = Omit<AllianceHelpPanelProps, 'visible'>;

export const AllianceHelp = defineView<AllianceHelpParams | void>({ zIndex: 'window' }, (context) => {
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
