import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { AllianceTerritoryFortCard, FORT_CARD_GAP, FORT_CARD_H } from './AllianceTerritoryFortCard';

export const FORT_HEADER_H = 64;
export const FORT_SECTION_GAP = 10;
export const FORT_CARD_LEAD = 14;

export interface AllianceTerritoryFortItemProps {
    readonly height: number;
    readonly isHeader: boolean;
    readonly headerName: string;
    readonly title: string;
    readonly expanded: boolean;
    readonly subtitle?: string;
    readonly level?: string;
    readonly coord?: string;
    readonly bonus?: string;
    readonly onToggle?: () => void;
    readonly onGo?: () => void;
}

export function fortHeaderHeight(cardCount: number, expanded: boolean): number {
    if (expanded && cardCount > 0) return FORT_HEADER_H + FORT_CARD_LEAD;
    return FORT_HEADER_H + FORT_SECTION_GAP;
}

export function fortCardHeight(isLast: boolean): number {
    return isLast ? FORT_CARD_H : FORT_CARD_H + FORT_CARD_GAP;
}

export const AllianceTerritoryFortItem = defineComponent<AllianceTerritoryFortItemProps>((p) => {
    const expanded = p.expanded;
    const arrowUp = imageRef('ui/alliance/flag-arrow');
    const arrowDown = imageRef('ui/alliance/flag-arrow-down');
    const arrow = expanded ? arrowUp : arrowDown;
    return (
    <view name="AllianceTerritoryFortItem" style={{ position: 'relative', width: 719, height: p.height }}>
        <view visible={p.isHeader} name={p.headerName} interaction="press" onClick={() => p.onToggle?.()}
            style={{ position: 'absolute', left: 0, top: 0, width: 719, height: FORT_HEADER_H }}>
            <image source={imageRef('ui/alliance/flag-section-header')} style={{ width: 719, height: FORT_HEADER_H }} />
            <text value={p.title}
                style={{ position: 'absolute', left: 0, top: 0, width: 719, height: FORT_HEADER_H,
                    font: fontRef('fonts/regular', 700), fontSize: 28, color: '#ffffff', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
            <image source={arrow}
                style={{ position: 'absolute', left: 653, top: 17, width: 44, height: 30 }} />
        </view>
        <view visible={!p.isHeader}>
            <AllianceTerritoryFortCard name={p.title} subtitle={p.subtitle} level={p.level}
                coord={p.coord} bonus={p.bonus} onGo={p.onGo} />
        </view>
    </view>
    );
});
