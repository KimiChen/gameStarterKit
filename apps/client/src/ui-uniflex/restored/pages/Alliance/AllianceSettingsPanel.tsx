import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { WideMenuButton } from '../../components/button/WideMenuButton';
import { AllianceInfoHeader } from './AllianceInfoHeader';

export interface AllianceSettingsPanelProps {
    readonly visible?: boolean;
    readonly tag?: string;
    readonly name?: string;
    readonly leader?: string;
    readonly power?: string;
    readonly memberCount?: string;
    readonly onAction?: (id: string) => void;
}

export const AllianceSettingsPanel = defineComponent<AllianceSettingsPanelProps>((p) => {
    const iconInfo = imageRef('ui/alliance/icon-info');
    const iconConfig = imageRef('ui/alliance/icon-config');
    const iconEnvelope = imageRef('ui/alliance/icon-envelope');
    const iconRank = imageRef('ui/alliance/icon-rank');
    const iconCastle = imageRef('ui/alliance/icon-castle');
    const iconInvite = imageRef('ui/alliance/icon-invite');
    const iconList = imageRef('ui/alliance/icon-list');
    const iconMemberConfig = imageRef('ui/alliance/icon-member-config');
    const menuBg = imageRef('ui/alliance/button');
    return (
    <view name="AllianceSettings" visible={p.visible !== false}
        style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1369 }}>
        <AllianceInfoHeader tag={p.tag} name={p.name} leader={p.leader} power={p.power} memberCount={p.memberCount} />
        <WideMenuButton background={menuBg} left={32} top={558} label="联盟信息" icon={iconInfo}
            iconWidth={52} iconHeight={58} onClick={() => p.onAction?.('open_info')} />
        <WideMenuButton background={menuBg} left={392} top={558} label="设置" icon={iconConfig}
            iconWidth={57} iconHeight={57} onClick={() => p.onAction?.('open_config')} />
        <WideMenuButton background={menuBg} left={32} top={707} label="礼物" icon={iconEnvelope}
            iconWidth={66} iconHeight={48} onClick={() => p.onAction?.('open_mailgift')} />
        <WideMenuButton background={menuBg} left={392} top={707} label="排行榜" icon={iconRank}
            iconWidth={63} iconHeight={58} onClick={() => p.onAction?.('open_rank')} />
        <WideMenuButton background={menuBg} left={32} top={857} label="迁城" icon={iconCastle}
            iconWidth={57} iconHeight={58} onClick={() => p.onAction?.('open_move')} />
        <WideMenuButton background={menuBg} left={392} top={857} label="邀请成员" icon={iconInvite}
            iconWidth={64} iconHeight={59} onClick={() => p.onAction?.('open_invite')} />
        <WideMenuButton background={menuBg} left={32} top={1006} label="列表" icon={iconList}
            iconWidth={47} iconHeight={54} onClick={() => p.onAction?.('open_list')} />
        <WideMenuButton background={menuBg} left={392} top={1006} label="成员设置" icon={iconMemberConfig}
            iconWidth={57} iconHeight={56} onClick={() => p.onAction?.('open_member_config')} />
        <WideMenuButton background={menuBg} left={32} top={1155} label="列表" icon={iconList}
            iconWidth={47} iconHeight={54} onClick={() => p.onAction?.('open_list_dup')} />
    </view>
    );
});
