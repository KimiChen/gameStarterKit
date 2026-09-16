import { defineView } from '@uniflex/compiler';
import { AllianceMemberSettingsPanel, type AllianceMemberSettingsPanelProps } from './AllianceMemberSettingsPanel';

export type AllianceMemberSettingsParams = Omit<AllianceMemberSettingsPanelProps, 'visible'>;

export const AllianceMemberSettings = defineView<AllianceMemberSettingsParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceMemberSettingsPage" style={{ width: 750, height: 1624 }}>
            <AllianceMemberSettingsPanel title={params.title} desc={params.desc}
                r2Power={params.r2Power} r3Power={params.r3Power}
                r2Enabled={params.r2Enabled} r3Enabled={params.r3Enabled}
                onClose={params.onClose} onToggleR2={params.onToggleR2} onToggleR3={params.onToggleR3} />
        </view>
    );
});
