import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../../components/button/ConfirmButton';
import { ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { EmptyState } from '../../../gamecomponents/empty/EmptyState';
import { TabBar } from '../../../components/tab/TabBar';
import { mailTab } from '../../../components/tab/tabSkins';

export type AllianceGiftTab = 'normal' | 'rare';

export interface AllianceGiftPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly tab?: AllianceGiftTab;
    readonly emptyText?: string;
    readonly capText?: string;
    readonly claimLabel?: string;
    readonly onBack?: () => void;
    readonly onClaimAll?: () => void;
    readonly onAction?: (id: string) => void;
    readonly onSelectTab?: (tab: AllianceGiftTab) => void;
}

const CAP = '#857C93';
const CLAIM_WIDTH = 191;
const CLAIM_HEIGHT = 77;

export const AllianceGiftPanel = defineComponent<AllianceGiftPanelProps>((p) => {
    const [tab, setTab] = useState<AllianceGiftTab>(p.tab ?? 'normal');
    const claimWidth = CLAIM_WIDTH;
    const claimHeight = CLAIM_HEIGHT;
    const selectTab = (next: AllianceGiftTab) => {
        setTab(next);
        p.onSelectTab?.(next);
    };
    const back = () => {
        p.onBack?.();
        p.onAction?.('back');
    };
    const claim = () => {
        p.onClaimAll?.();
        p.onAction?.('claim_all');
    };
    const emptyIcon = imageRef('ui/backpack/empty');
    const emptyText = p.emptyText ?? '暂无礼物';
    return (
        <view name="AllianceGift" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <image source={imageRef('ui/hero/bond-bg')}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} />
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#00000099' }} />
            <view style={{ position: 'absolute', left: 0, top: 140, width: 750, height: 209, backgroundColor: '#553E78' }} />
            <view style={{ position: 'absolute', left: 0, top: 227, width: 750, height: 317, backgroundColor: '#271D38' }} />
            <image source={imageRef('ui/alliance/gift-banner')}
                style={{ position: 'absolute', left: 0, top: 208, width: 750, height: 370 }} />
            <view style={{ position: 'absolute', left: 0, top: 544, width: 750, height: 1080, backgroundColor: '#F3EFE9' }} />

            <EmptyState icon={emptyIcon} left={321} top={805} label={emptyText}
                labelLeft={200} labelTop={960} labelWidth={350} />

            <image source={imageRef('ui/alliance/gift-cap')}
                style={{ position: 'absolute', left: 245, bottom: 125, width: 261, height: 39, sizeMode: 'sliced' }} />
            <text value={p.capText ?? '今日奖励上限：'}
                style={{ position: 'absolute', left: 245, bottom: 125, width: 261, height: 39,
                    font: fontRef('fonts/regular', 700), fontSize: 24, color: CAP, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />

            <ScreenHeader title={p.title ?? '联盟礼物'} top={144} titleWidth={280} />

            <TabBar skin={mailTab} left={13} top={492} itemWidth={200} width={737} selected={tab}
                items={[{ id: 'normal', label: '普通礼物' }, { id: 'rare', label: '稀有礼物' }]}
                onSelect={(id) => { if (id === 'normal' || id === 'rare') selectTab(id); }} />

            <ScreenFooter onBack={back} />
            <view style={{ position: 'absolute', left: 280, bottom: 16, width: claimWidth, height: claimHeight }}>
                <ConfirmButton label={p.claimLabel ?? '一键领取'} width={claimWidth} height={claimHeight}
                    onClick={claim} />
            </view>
        </view>
    );
});
