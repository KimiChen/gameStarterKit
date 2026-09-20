import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export type AllianceTechKind = 'shield' | 'heart' | 'swords' | 'crate';

export interface AllianceTechNodeData {
    readonly id: string;
    readonly kind: AllianceTechKind;
    readonly left: number;
    readonly top: number;
    readonly parentIds?: readonly string[];
    readonly locked?: boolean;
    readonly level: number;
    readonly maxLevel: number;
}

export interface AllianceTechNodeProps {
    readonly node: AllianceTechNodeData;
    readonly onClick?: () => void;
}

export function allianceTechNodeSize(kind: AllianceTechKind): { readonly width: number; readonly height: number } {
    if (kind === 'heart') return { width: 164, height: 190 };
    return { width: 165, height: 192 };
}

export const AllianceTechNode = defineComponent<AllianceTechNodeProps>((p) => {
    const node = p.node;
    const kind = node.kind;
    const locked = node.locked === true;
    const left = node.left;
    const top = node.top;
    const size = allianceTechNodeSize(kind);
    const width = size.width;
    const height = size.height;
    const isHeart = kind === 'heart';
    const isSwords = kind === 'swords';
    const isCrate = kind === 'crate';
    const hexUnlocked = imageRef('ui/alliance/tech-hex-unlocked');
    const hexHeart = imageRef('ui/alliance/tech-hex-heart');
    const hexLocked = imageRef('ui/alliance/tech-hex-locked');
    const hex = locked ? hexLocked : isHeart ? hexHeart : hexUnlocked;
    const iconShield = imageRef('ui/alliance/tech-icon-shield');
    const iconHeart = imageRef('ui/alliance/tech-icon-heart');
    const iconSwords = imageRef('ui/alliance/tech-icon-swords');
    const iconCrate = imageRef('ui/alliance/tech-icon-crate');
    const icon = isHeart ? iconHeart : isSwords ? iconSwords : isCrate ? iconCrate : iconShield;
    const iconLeft = isHeart ? 19 : isSwords ? 16 : isCrate ? 18 : 7;
    const iconTop = isHeart ? 47 : isSwords ? 24 : isCrate ? 33 : 24;
    const iconWidth = isHeart ? 125 : isSwords ? 136 : isCrate ? 132 : 155;
    const iconHeight = isHeart ? 108 : isSwords ? 122 : isCrate ? 121 : 146;
    const level = `${node.level}/${node.maxLevel}`;
    return (
        <view name="AllianceTechNode" interaction="press" onClick={() => p.onClick?.()}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image source={hex}
                style={{ width: width, height: height }} />
            <image source={icon}
                style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
            <image visible={locked} source={imageRef('ui/alliance/tech-lock')}
                style={{ position: 'absolute', left: 3, top: 3, width: 159, height: 186 }} />
            <image source={imageRef('ui/alliance/tech-badge')}
                style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35, sizeMode: 'sliced' }} />
            <text value={level}
                style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: '#ffffff', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>
    );
});
