import { defineView, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { MainNav, type MainNavSlot } from '../../../restored/gamecomponents/navigation/MainNav';
import { HeroBondsPanel, type HeroBond, type HeroBondMember } from '../../../restored/modules/hero/HeroScreen/HeroBondsPanel';
import { HeroListPanel, type HeroCardItem } from '../../../restored/modules/hero/HeroScreen/HeroListPanel';

export type HeroScreenTab = 'hero' | 'team' | 'bonds';

export interface HeroScreenRestoredParams {
    readonly title?: string;
    readonly cards?: readonly HeroCardItem[];
    readonly bonds?: readonly HeroBond[];
    readonly bondMembers?: readonly HeroBondMember[];
    readonly nav?: MainNavSlot;
    readonly onRecruit?: () => void;
    readonly onSelectCard?: (id: string) => void;
    readonly onSelectBond?: (id: string) => void;
    readonly onBondDetail?: (id: string) => void;
    readonly onNav?: (slot: MainNavSlot) => void;
    readonly onClose?: () => void;
}

const defaultCards: readonly HeroCardItem[] = [
    { id: 'c1', quality: 'red', classId: 'anchor', owned: true, level: 'Lv.20', stars: 1, team: '1' },
    { id: 'c2', quality: 'yellow', classId: 'shield', owned: true, level: 'Lv.18', stars: 2, team: '1' },
    { id: 'c3', quality: 'purple', classId: 'sword', owned: true, level: 'Lv.24', stars: 3, team: '1' },
    { id: 'c4', quality: 'blue', classId: 'shield', owned: true, level: 'Lv.12', stars: 1, team: '2' },
    { id: 'c5', quality: 'green', classId: 'shield', owned: true, level: 'Lv.8', stars: 1 },
    { id: 'c6', quality: 'yellow', classId: 'anchor', owned: true, level: 'Lv.30', stars: 4, team: '2' },
    { id: 'c7', quality: 'purple', classId: 'anchor', owned: false, fragments: '9/10', fillWidth: 99 },
    { id: 'c8', quality: 'purple', classId: 'anchor', owned: false, fragments: '3/10', fillWidth: 33 },
    { id: 'c9', quality: 'purple', classId: 'anchor', owned: false, fragments: '6/10', fillWidth: 66 },
    { id: 'c10', quality: 'blue', classId: 'sword', owned: false, fragments: '1/10', fillWidth: 22 },
    { id: 'c11', quality: 'green', classId: 'sword', owned: false, fragments: '8/10', fillWidth: 88 },
    { id: 'c12', quality: 'red', classId: 'anchor', owned: false, fragments: '5/10', fillWidth: 55 },
    { id: 'c13', quality: 'purple', classId: 'anchor', owned: false, fragments: '2/10', fillWidth: 22 },
    { id: 'c14', quality: 'yellow', classId: 'shield', owned: false, fragments: '7/10', fillWidth: 77 },
    { id: 'c15', quality: 'blue', classId: 'anchor', owned: false, fragments: '4/10', fillWidth: 44 },
    { id: 'c16', quality: 'green', classId: 'sword', owned: false, fragments: '9/10', fillWidth: 99 },
];

const defaultBonds: readonly HeroBond[] = [
    { id: 'bond-gale', name: '疾风双刃', bonus: '英雄攻击+30' },
    { id: 'bond-gold', name: '黄金搭档', bonus: '英雄防御+50' },
    { id: 'bond-sea', name: '深海盟约', bonus: '英雄生命+40' },
    { id: 'bond-flame', name: '烈焰同盟', bonus: '英雄暴击+15' },
    { id: 'bond-shadow', name: '暗影誓约', bonus: '英雄闪避+12' },
];

const defaultBondMembers: readonly HeroBondMember[] = [
    { id: 'm1', quality: 'purple', owned: true, level: 'Lv.99', name: '威尔', nameColor: '#6B38A6' },
    { id: 'm2', quality: 'blue', owned: true, level: 'Lv.76', name: '安娜', nameColor: '#40729E' },
    { id: 'm3', quality: 'yellow', owned: true, level: 'Lv.54', name: '杰克', nameColor: '#976422' },
    { id: 'm4', quality: 'green', owned: false, level: 'Lv.1', name: '莉娜', nameColor: '#298238' },
    { id: 'm5', quality: 'red', owned: false, level: 'Lv.1', name: '布鲁', nameColor: '#B83F3F' },
    { id: 'm6', quality: 'purple', owned: true, level: 'Lv.42', name: '艾拉', nameColor: '#6B38A6' },
    { id: 'm7', quality: 'blue', owned: false, level: 'Lv.1', name: '罗恩', nameColor: '#40729E' },
    { id: 'm8', quality: 'yellow', owned: true, level: 'Lv.21', name: '凯恩', nameColor: '#976422' },
    { id: 'm9', quality: 'green', owned: true, level: 'Lv.15', name: '米娅', nameColor: '#298238' },
];

export const HeroScreenRestored = defineView<HeroScreenRestoredParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    const cards = params.cards ?? defaultCards;
    const bonds = params.bonds ?? defaultBonds;
    const members = params.bondMembers ?? defaultBondMembers;
    const [tab, setTab] = useState<HeroScreenTab>('hero');
    const [nav, setNav] = useState<MainNavSlot>(params.nav ?? 'hero');
    const selectNav = (slot: MainNavSlot) => {
        setNav(slot);
        params.onNav?.(slot);
    };
    return (
        <view name="HeroScreenRestored" style={{ width: 750, height: 1334, backgroundColor: '#F3EFE9' }}>
            <image visible={tab === 'bonds'} source={imageRef('ui/hero/bond-bg')}
                style={{ position: 'absolute', left: 0, top: -144, width: 750, height: 1624 }} />
            <view visible={tab === 'bonds'}
                style={{ position: 'absolute', left: 0, top: -144, width: 750, height: 1624, backgroundColor: '#00000099' }} />
            <image source={imageRef('ui/mail/header')}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 90, sizeMode: 'sliced' }} />
            <text value={params.title ?? '英雄'}
                style={{ position: 'absolute', left: 20, top: 16, width: 200, height: 58,
                    font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                    outlineColor: '#593d84', outlineWidth: 2, verticalAlign: 'center' }} />
            <view interaction="press" onClick={() => params.onRecruit?.()}
                style={{ position: 'absolute', left: 518, top: 21, width: 217, height: 51 }}>
                <image source={imageRef('ui/hero/recruit')} style={{ width: 217, height: 51 }} />
            </view>

            <HeroListPanel visible={tab === 'hero'} cards={cards} onSelectCard={params.onSelectCard} />
            <HeroBondsPanel visible={tab === 'bonds'} bonds={bonds} members={members}
                onSelectBond={params.onSelectBond} onBondDetail={params.onBondDetail}
                onSelectMember={params.onSelectCard} />

            <image source={imageRef('ui/hero/tabs-base')}
                style={{ position: 'absolute', left: 34, top: 1122, width: 682, height: 80 }} />
            <image visible={tab === 'hero'} source={imageRef('ui/hero/tabs-selected')}
                style={{ position: 'absolute', left: 37, top: 1127, width: 222, height: 74 }} />
            <image visible={tab === 'team'} source={imageRef('ui/hero/tabs-selected')}
                style={{ position: 'absolute', left: 264, top: 1127, width: 222, height: 74 }} />
            <image visible={tab === 'bonds'} source={imageRef('ui/hero/tabs-selected')}
                style={{ position: 'absolute', left: 491, top: 1127, width: 222, height: 74 }} />
            <view interaction="press" onClick={() => setTab('hero')}
                style={{ position: 'absolute', left: 34, top: 1122, width: 227, height: 80 }}>
                <text value="英雄" style={{ width: 227, height: 80, font: fontRef('fonts/regular', 700), fontSize: 32,
                    color: '#584871', bold: true, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => setTab('team')}
                style={{ position: 'absolute', left: 261, top: 1122, width: 227, height: 80 }}>
                <text value="队伍" style={{ width: 227, height: 80, font: fontRef('fonts/regular', 700), fontSize: 32,
                    color: '#584871', bold: true, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => setTab('bonds')}
                style={{ position: 'absolute', left: 489, top: 1122, width: 227, height: 80 }}>
                <text value="羁绊" style={{ width: 227, height: 80, font: fontRef('fonts/regular', 700), fontSize: 32,
                    color: '#584871', bold: true, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <image visible={tab === 'hero'} source={imageRef('ui/mail/unread-dot')}
                style={{ position: 'absolute', left: 236, top: 1124, width: 24, height: 24 }} />
            <image visible={tab === 'bonds'} source={imageRef('ui/mail/unread-dot')}
                style={{ position: 'absolute', left: 690, top: 1124, width: 24, height: 24 }} />

            <MainNav selected={nav} noticeExplore onSelect={selectNav} />
        </view>
    );
});
