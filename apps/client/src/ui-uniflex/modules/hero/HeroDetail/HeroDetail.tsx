import { defineView, useState } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../../kits/uniflex/api/core/index';
import { SCREEN_FOOTER_HEIGHT, ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { TabBar, type TabBarItem } from '../../../components/tab/TabBar';
import { heroDetailTab } from '../../../components/tab/tabSkins';
import { HeroStarUpgradePanel } from '../HeroStarUpgrade/HeroStarUpgradePanel';
import { HeroDetailAttributes } from './HeroDetailAttributes';
import { HeroDetailSkills } from './HeroDetailSkills';

export type HeroDetailQuality = 'purple' | 'green' | 'red' | 'yellow' | 'blue';
export interface HeroPowerBreakdown {
    readonly label: string;
    readonly value: string;
}

export type HeroDetailTab = 'attributes' | 'skills' | 'equip';

const HERO_DETAIL_TABS: readonly TabBarItem[] = [
    { id: 'attributes', label: '属性', notice: true },
    { id: 'skills', label: '技能' },
    { id: 'equip', label: '装备' },
];

export interface HeroDetailParams {
    readonly name?: string;
    readonly portrait?: ImageRef;
    readonly skills?: readonly import('./HeroDetailSkills').HeroSkill[];
    readonly powerBreakdown?: readonly HeroPowerBreakdown[];
    readonly quality?: HeroDetailQuality;
    readonly power?: string;
    readonly level?: string;
    readonly stars?: number;
    readonly stats?: readonly string[];
    readonly cost?: string;
    readonly onBack?: () => void;
    readonly onPrev?: () => void;
    readonly onNext?: () => void;
    readonly onStarUp?: () => void;
    readonly onConfirmStarUpgrade?: () => void;
    readonly onObtainFragments?: () => void;
    readonly onExchange?: () => void;
    readonly onUpgrade?: () => void;
    readonly onSelectSkill?: (id: string) => void;
}

export const HeroDetail = defineView<HeroDetailParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const quality = params.quality ?? 'yellow';
    const bgYellow = imageRef('ui/hero-detail/bg-yellow');
    const bgPurple = imageRef('ui/hero-detail/bg-purple');
    const bgRed = imageRef('ui/hero-detail/bg-red');
    const bgBlue = imageRef('ui/hero-detail/bg-blue');
    const bgGreen = imageRef('ui/hero-detail/bg-green');
    const background = quality === 'purple' ? bgPurple
        : quality === 'red' ? bgRed
        : quality === 'blue' ? bgBlue
        : quality === 'green' ? bgGreen
        : bgYellow;
    const [tab, setTab] = useState<HeroDetailTab>('attributes');
    const [popup, setPopup] = useState<'none' | 'power' | 'star'>('none');
    const footerHeight = SCREEN_FOOTER_HEIGHT;
    const footerSource = imageRef('ui/hero-detail/nav-base');
    const selectDetailTab = (id: string) => {
        if (id === 'attributes' || id === 'skills' || id === 'equip') setTab(id);
    };
    return (
        <view name="HeroDetail" style={{ width: 750, height: 1334 }}>
            <image source={background}
                style={{ position: 'absolute', left: 0, top: -145, width: 750, height: 1624 }} />
            <image source={params.portrait ?? imageRef('ui/hero-detail/art')}
                style={{ position: 'absolute', left: 163, top: 114, width: 469, height: 650 }} />
            <image source={imageRef('ui/hero-detail/shadow')}
                style={{ position: 'absolute', left: 80, top: 644, width: 601, height: 186 }} />
            <text value={params.name ?? '凯伊'}
                style={{ position: 'absolute', left: 250, top: 40, width: 250, height: 70,
                    font: fontRef('fonts/regular', 700), fontSize: 56, color: '#ffffff', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
            <view visible={tab === 'attributes'} interaction="press" onClick={() => params.onPrev?.()}
                style={{ position: 'absolute', left: 25, top: 462, width: 58, height: 80 }}>
                <image source={imageRef('ui/hero-detail/arrow')} style={{ width: 58, height: 80 }} />
            </view>
            <view visible={tab === 'attributes'} interaction="press" onClick={() => params.onNext?.()}
                style={{ position: 'absolute', left: 667, top: 462, width: 58, height: 80 }}>
                <image source={imageRef('ui/hero-detail/arrow-right')} style={{ width: 58, height: 80 }} />
            </view>
            <HeroDetailAttributes visible={tab === 'attributes'} power={params.power} level={params.level}
                stars={params.stars ?? 0} stats={params.stats} cost={params.cost}
                onPowerInfo={() => setPopup('power')}
                onStarUp={() => { setPopup('star'); params.onStarUp?.(); }}
                onUpgrade={params.onUpgrade} />
            <HeroDetailSkills visible={tab === 'skills'} skills={params.skills} onSelectSkill={params.onSelectSkill} />
            <view style={{ position: 'absolute', left: 0, bottom: 0, width: 750, height: footerHeight }}>
                <ScreenFooter source={footerSource} onBack={params.onBack} />
                <TabBar skin={heroDetailTab} left={116} top={0} itemWidth={225} gap={-14} width={647}
                    selected={tab} items={HERO_DETAIL_TABS} onSelect={selectDetailTab} />
            </view>
            <view visible={popup === 'power'} interaction="press" onClick={() => setPopup('none')}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1334, backgroundColor: '#00000066' }}>
                <view style={{ position: 'absolute', left: 180, top: 458, width: 390, height: 290 }}>
                    <image source={imageRef('ui/hero-detail/popup-power')} style={{ width: 390, height: 290 }} />
                    <text value="英雄战力" style={{ position: 'absolute', left: 16, top: 10, width: 200, height: 40,
                        font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
                    <text value={params.power ?? ''} style={{ position: 'absolute', left: 220, top: 10, width: 154, height: 40,
                        font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true,
                        horizontalAlign: 'right', verticalAlign: 'center' }} />
                    <text visible={params.powerBreakdown?.[0] != null}
                        value={`${params.powerBreakdown?.[0]?.label ?? ''}          ${params.powerBreakdown?.[0]?.value ?? ''}`}
                        style={{ position: 'absolute', left: 18, top: 62, width: 354, height: 40,
                            font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true }} />
                    <text visible={params.powerBreakdown?.[1] != null}
                        value={`${params.powerBreakdown?.[1]?.label ?? ''}          ${params.powerBreakdown?.[1]?.value ?? ''}`}
                        style={{ position: 'absolute', left: 18, top: 110, width: 354, height: 40,
                            font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true }} />
                    <text visible={params.powerBreakdown?.[2] != null}
                        value={`${params.powerBreakdown?.[2]?.label ?? ''}          ${params.powerBreakdown?.[2]?.value ?? ''}`}
                        style={{ position: 'absolute', left: 18, top: 158, width: 354, height: 40,
                            font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true }} />
                </view>
            </view>
            <HeroStarUpgradePanel visible={popup === 'star'} stars={params.stars ?? 1}
                onClose={() => setPopup('none')}
                onUpgrade={() => params.onConfirmStarUpgrade?.()}
                onObtainFragments={() => params.onObtainFragments?.()}
                onExchange={() => params.onExchange?.()} />
        </view>
    );
});
