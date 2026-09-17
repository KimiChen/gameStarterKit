import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { WideMenuButton } from '../../components/button/WideMenuButton';
import { AllianceInfoHeader } from './AllianceInfoHeader';

export interface AllianceHomePanelProps {
    readonly visible?: boolean;
    readonly tag?: string;
    readonly name?: string;
    readonly leader?: string;
    readonly power?: string;
    readonly memberCount?: string;
    readonly announceTitle?: string;
    readonly announceWelcome?: string;
    readonly announceLines?: readonly string[];
    readonly onAction?: (id: string) => void;
}

const defaultLines = [
    '1. 升级科技：每日捐献联盟科技，可使联盟快速发展。',
    '2. 集结章鱼王：发起集结章鱼王可获得丰厚奖励，快速提高战力。',
    '3. 参与集结：在战争界面中打开自动集结，每天有 50 次参与奖励。',
] as const;

export const AllianceHomePanel = defineComponent<AllianceHomePanelProps>((p) => {
    const iconWar = imageRef('ui/alliance/icon-war');
    const iconHelp = imageRef('ui/alliance/icon-help');
    const iconGift = imageRef('ui/alliance/icon-gift');
    const iconTech = imageRef('ui/alliance/icon-tech');
    const iconTerritory = imageRef('ui/alliance/icon-territory');
    const iconShop = imageRef('ui/alliance/icon-shop');
    const iconGather = imageRef('ui/alliance/icon-gather');
    const menuBg = imageRef('ui/alliance/button');
    return (
    <view name="AllianceHome" visible={p.visible !== false}
        style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1369 }}>
        <AllianceInfoHeader tag={p.tag} name={p.name} leader={p.leader} power={p.power} memberCount={p.memberCount} />
        <image source={imageRef('ui/alliance/announce-bg')}
            style={{ position: 'absolute', left: 30, top: 547, width: 690, height: 211, sizeMode: 'sliced' }} />
        <image source={imageRef('ui/alliance/announce-header')}
            style={{ position: 'absolute', left: 33, top: 550, width: 684, height: 41, sizeMode: 'sliced' }} />
        <text value={p.announceTitle ?? '斧头帮公告板'}
            style={{ position: 'absolute', left: 48, top: 550, width: 540, height: 41,
                font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
        <view interaction="press" onClick={() => p.onAction?.('edit_announcement')}
            style={{ position: 'absolute', left: 613, top: 551, width: 38, height: 38 }}>
            <image source={imageRef('ui/alliance/announce-edit')} style={{ width: 38, height: 38 }} />
        </view>
        <view interaction="press" onClick={() => p.onAction?.('copy_announcement')}
            style={{ position: 'absolute', left: 669, top: 551, width: 38, height: 38 }}>
            <image source={imageRef('ui/alliance/announce-copy')} style={{ width: 38, height: 38 }} />
        </view>
        <text value={p.announceWelcome ?? '欢迎加入联盟 - 努力发展联盟，让我们变得更强大！'}
            style={{ position: 'absolute', left: 48, top: 598, width: 654, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 22, color: '#837A91', bold: true, verticalAlign: 'center', overflow: 'shrink' }} />
        <text value={p.announceLines?.[0] ?? defaultLines[0]}
            style={{ position: 'absolute', left: 48, top: 632, width: 654, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 22, color: '#837A91', bold: true, verticalAlign: 'center', overflow: 'shrink' }} />
        <text value={p.announceLines?.[1] ?? defaultLines[1]}
            style={{ position: 'absolute', left: 48, top: 664, width: 654, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 22, color: '#837A91', bold: true, verticalAlign: 'center', overflow: 'shrink' }} />
        <text value={p.announceLines?.[2] ?? defaultLines[2]}
            style={{ position: 'absolute', left: 48, top: 696, width: 654, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 22, color: '#837A91', bold: true, verticalAlign: 'center', overflow: 'shrink' }} />
        <WideMenuButton background={menuBg} left={32} top={776} label="战争" icon={iconWar}
            iconWidth={55} iconHeight={54} onClick={() => p.onAction?.('open_war')} />
        <WideMenuButton background={menuBg} left={392} top={776} label="联盟帮助" icon={iconHelp}
            iconWidth={69} iconHeight={56} onClick={() => p.onAction?.('open_help')} />
        <WideMenuButton background={menuBg} left={32} top={925} label="礼物" icon={iconGift}
            iconWidth={52} iconHeight={56} onClick={() => p.onAction?.('open_gift')} />
        <WideMenuButton background={menuBg} left={392} top={925} label="科技" icon={iconTech}
            iconWidth={59} iconHeight={58} onClick={() => p.onAction?.('open_tech')} />
        <WideMenuButton background={menuBg} left={32} top={1075} label="领地" icon={iconTerritory}
            iconWidth={58} iconHeight={58} onClick={() => p.onAction?.('open_territory')} />
        <WideMenuButton background={menuBg} left={392} top={1075} label="商店" icon={iconShop}
            iconWidth={65} iconHeight={59} onClick={() => p.onAction?.('open_shop')} />
        <WideMenuButton background={menuBg} left={32} top={1224} label="召集" icon={iconGather}
            iconWidth={71} iconHeight={54} onClick={() => p.onAction?.('open_gather')} />
    </view>
    );
});
