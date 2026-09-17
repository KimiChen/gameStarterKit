import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

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
    const isShield = kind === 'shield';
    const isHeart = kind === 'heart';
    const isSwords = kind === 'swords';
    const isCrate = kind === 'crate';
    const showHeartHex = locked !== true && isHeart;
    const showUnlockedHex = locked !== true && isHeart !== true;
    const level = `${node.level}/${node.maxLevel}`;
    return (
        <view name="AllianceTechNode" interaction="press" onClick={() => p.onClick?.()}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image visible={showUnlockedHex} source={imageRef('ui/alliance/tech-hex-unlocked')}
                style={{ width: width, height: height }} />
            <image visible={showHeartHex} source={imageRef('ui/alliance/tech-hex-heart')}
                style={{ width: width, height: height }} />
            <image visible={locked} source={imageRef('ui/alliance/tech-hex-locked')}
                style={{ width: width, height: height }} />
            <image visible={isShield} source={imageRef('ui/alliance/tech-icon-shield')}
                style={{ position: 'absolute', left: 7, top: 24, width: 155, height: 146 }} />
            <image visible={isHeart} source={imageRef('ui/alliance/tech-icon-heart')}
                style={{ position: 'absolute', left: 19, top: 47, width: 125, height: 108 }} />
            <image visible={isSwords} source={imageRef('ui/alliance/tech-icon-swords')}
                style={{ position: 'absolute', left: 16, top: 24, width: 136, height: 122 }} />
            <image visible={isCrate} source={imageRef('ui/alliance/tech-icon-crate')}
                style={{ position: 'absolute', left: 18, top: 33, width: 132, height: 121 }} />
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
