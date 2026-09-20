import { defineView } from '@uniflex/compiler';
import { HeroStarUpgradePanel, type HeroStarUpgradePanelProps } from '../../../restored/modules/hero/HeroStarUpgrade/HeroStarUpgradePanel';

export type HeroStarUpgradeRestoredParams = Omit<HeroStarUpgradePanelProps, 'visible'>;

export const HeroStarUpgradeRestored = defineView<HeroStarUpgradeRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="HeroStarUpgradePage" style={{ width: 750, height: 1624 }}>
            <HeroStarUpgradePanel title={params.title} stars={params.stars}
                combatPower={params.combatPower} powerGain={params.powerGain}
                attributes={params.attributes} owned={params.owned} required={params.required}
                exchangeCount={params.exchangeCount} onClose={params.onClose}
                onUpgrade={params.onUpgrade} onObtainFragments={params.onObtainFragments}
                onExchange={params.onExchange} />
        </view>
    );
});
