import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { ScreenHeader } from '../../components/chrome/ScreenHeader';
import { PanelTab } from '../../components/tab/PanelTab';

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

const GRAY = '#837A91';
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

            <image source={imageRef('ui/backpack/empty')}
                style={{ position: 'absolute', left: 321, top: 805, width: 108, height: 116 }} />
            <text value={p.emptyText ?? '暂无礼物'}
                style={{ position: 'absolute', left: 200, top: 960, width: 350, height: 40,
                    font: fontRef('fonts/regular', 700), fontSize: 40, color: GRAY, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />

            <image source={imageRef('ui/alliance/gift-cap')}
                style={{ position: 'absolute', left: 245, top: 1315, width: 261, height: 39, sizeMode: 'sliced' }} />
            <text value={p.capText ?? '今日奖励上限：'}
                style={{ position: 'absolute', left: 245, top: 1315, width: 261, height: 39,
                    font: fontRef('fonts/regular', 700), fontSize: 24, color: CAP, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />

            <ScreenHeader title={p.title ?? '联盟礼物'} top={144} titleWidth={280} />

            <PanelTab label="普通礼物" active={tab === 'normal'} left={13} top={492} width={200}
                onClick={() => selectTab('normal')} />
            <PanelTab label="稀有礼物" active={tab === 'rare'} left={227} top={492} width={200}
                onClick={() => selectTab('rare')} />

            <image source={imageRef('ui/mail/footer')}
                style={{ position: 'absolute', left: 0, top: 1369, width: 750, height: 110, sizeMode: 'sliced' }} />
            <view name="AllianceGift/Back" interaction="press" onClick={back}
                style={{ position: 'absolute', left: 13, top: 1396, width: 64, height: 56 }}>
                <image source={imageRef('ui/mail/back')} style={{ width: 64, height: 56 }} />
            </view>
            <view style={{ position: 'absolute', left: 280, top: 1386, width: claimWidth, height: claimHeight }}>
                <ConfirmButton label={p.claimLabel ?? '一键领取'} width={claimWidth} height={claimHeight}
                    onClick={claim} />
            </view>
        </view>
    );
});
