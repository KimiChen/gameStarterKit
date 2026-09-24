import { defineComponent, For } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../../kits/uniflex/api/core/index';
import { ReportDetailCard, ReportDetailSectionHeading } from './ReportDetailChrome';

interface Hero { readonly id: string; readonly x: number; readonly y: number; readonly image: ImageRef; readonly level: string; }
const heroes: readonly Hero[] = [
    { id: 'bandit', x: 22, y: 63, image: imageRef('ui/mail-report-detail/hero-bandit'), level: 'Lv.20' },
    { id: 'horn', x: 127, y: 120, image: imageRef('ui/mail-report-detail/hero-horn'), level: 'Lv.20' },
    { id: 'fox', x: 22, y: 167, image: imageRef('ui/mail-report-detail/hero-fox'), level: 'Lv.20' },
    { id: 'shark', x: 555, y: 63, image: imageRef('ui/mail-report-detail/hero-shark'), level: 'Lv.20' },
    { id: 'cat', x: 450, y: 120, image: imageRef('ui/mail-report-detail/hero-cat'), level: 'Lv.20' },
    { id: 'box', x: 555, y: 167, image: imageRef('ui/mail-report-detail/hero-box'), level: 'Lv.20' },
];
interface SkillSide { readonly id: string; readonly x: number; }
const skillSides: readonly SkillSide[] = [{ id: 'left', x: 227 }, { id: 'right', x: 395 }];

export const ReportDetailHeroes = defineComponent<{ readonly visible: boolean }>((p) => (
    <view name="ReportDetailHeroes" visible={p.visible} style={{ position: 'absolute', width: 673, height: 408 }}>
        <ReportDetailCard height={398} />
        <ReportDetailSectionHeading title="英雄对比" power="154K" />
        <For each={heroes} key="id">{(hero) => <ReportDetailHero hero={hero} />}</For>
        <image source={imageRef('ui/mail-report-detail/vs')} style={{ position: 'absolute', left: 299, top: 136, width: 76, height: 68 }} />
        <For each={skillSides} key="id">{(side) => <ReportDetailHeroSkill side={side} />}</For>
        <image source={imageRef('ui/mail-report-detail/hero-plate')} style={{ position: 'absolute', left: 22, top: 283, width: 91, height: 91 }} />
        <image source={imageRef('ui/mail-report-detail/placeholder-lg')} style={{ position: 'absolute', left: 36, top: 291, width: 64, height: 75 }} />
        <image source={imageRef('ui/mail-report-detail/hero-plate')} style={{ position: 'absolute', left: 559, top: 283, width: 91, height: 91 }} />
        <image source={imageRef('ui/mail-report-detail/placeholder')} style={{ position: 'absolute', left: 572, top: 291, width: 64, height: 74 }} />
        <text value="只提供属性" style={{ position: 'absolute', left: 119, top: 317, width: 225, height: 42, font: fontRef('fonts/regular', 700), bold: true, fontSize: 30, color: '#837A91' }} />
        <text value="只提供属性" style={{ position: 'absolute', left: 404, top: 317, width: 150, height: 42, font: fontRef('fonts/regular', 700), bold: true, fontSize: 30, color: '#837A91', horizontalAlign: 'right' }} />
    </view>
));

export const ReportDetailHero = defineComponent<{ readonly hero: Hero }>((p) => {
    const hero = p.hero;
    const left = hero.x;
    const top = hero.y;
    return <view name="ReportDetail/Hero" style={{ position: 'absolute', left: left, top: top, width: 95, height: 97 }}>
                <image source={hero.image} style={{ position: 'absolute', width: 95, height: 97 }} />
                <text value={hero.level} style={{ position: 'absolute', left: 6, top: 56, width: 88, height: 30,
                    font: fontRef('fonts/regular', 700), fontSize: 23, bold: true, color: '#FFFFFF', outlineColor: '#111111', outlineWidth: 2 }} />
            </view>;
});

export const ReportDetailHeroSkill = defineComponent<{ readonly side: SkillSide }>((p) => {
    const left = p.side.x;
    return <view style={{ position: 'absolute', left: left, top: 133, width: 49, height: 61 }}>
                <image source={imageRef('ui/mail-report-detail/skill-axe')} style={{ position: 'absolute', left: 8, width: 34, height: 42 }} />
                <image source={imageRef('ui/mail-report-detail/level-pill')} style={{ position: 'absolute', top: 41, width: 49, height: 19 }} />
                <text value="1" style={{ position: 'absolute', top: 36, width: 49, height: 29, font: fontRef('fonts/regular', 700), bold: true, fontSize: 26, color: '#FFFFFF', horizontalAlign: 'center' }} />
            </view>;
});
