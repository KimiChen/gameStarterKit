import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';
import type { AllianceTechIconKind } from './allianceTech';

export interface TechIconProps {
    readonly left: number;
    readonly top: number;
    readonly level: string;
    readonly kind?: AllianceTechIconKind;
    readonly icon?: ImageRef;
    readonly plate?: ImageRef;
    readonly width?: number;
    readonly height?: number;
}

/** Native size of `alliance_tech_hex_heart.png`. */
export const TECH_ICON_WIDTH = 164;
export const TECH_ICON_HEIGHT = 190;

const BADGE_LEFT = 22;
const BADGE_TOP = 142;
const BADGE_WIDTH = 122;
const BADGE_HEIGHT = 35;
const LEVEL_SIZE = 26;

/** Hex plate + tech glyph + level badge + level caption. */
export const TechIcon = defineComponent<TechIconProps>((p) => {
    const left = p.left;
    const top = p.top;
    const level = p.level;
    const width = p.width ?? TECH_ICON_WIDTH;
    const height = p.height ?? TECH_ICON_HEIGHT;
    const sx = width / TECH_ICON_WIDTH;
    const sy = height / TECH_ICON_HEIGHT;
    const kind = p.kind ?? 'heart';
    const isShield = kind === 'shield';
    const isSwords = kind === 'swords';
    const isCrate = kind === 'crate';
    const plate = p.plate ?? imageRef('ui/alliance/tech-hex-heart');
    const iconHeart = imageRef('ui/alliance/tech-icon-heart');
    const iconShield = imageRef('ui/alliance/tech-icon-shield');
    const iconSwords = imageRef('ui/alliance/tech-icon-swords');
    const iconCrate = imageRef('ui/alliance/tech-icon-crate');
    const iconByKind = isShield ? iconShield : isSwords ? iconSwords : isCrate ? iconCrate : iconHeart;
    const icon = p.icon ?? iconByKind;
    const nativeIconLeft = isShield ? 7 : isSwords ? 16 : isCrate ? 18 : 19;
    const nativeIconTop = isShield ? 24 : isSwords ? 24 : isCrate ? 33 : 47;
    const nativeIconWidth = isShield ? 155 : isSwords ? 136 : isCrate ? 132 : 125;
    const nativeIconHeight = isShield ? 146 : isSwords ? 122 : isCrate ? 121 : 108;
    const iconLeft = Math.round(nativeIconLeft * sx);
    const iconTop = Math.round(nativeIconTop * sy);
    const iconWidth = Math.round(nativeIconWidth * sx);
    const iconHeight = Math.round(nativeIconHeight * sy);
    const badgeLeft = Math.round(BADGE_LEFT * sx);
    const badgeTop = Math.round(BADGE_TOP * sy);
    const badgeWidth = Math.round(BADGE_WIDTH * sx);
    const badgeHeight = Math.round(BADGE_HEIGHT * sy);
    const fontSize = Math.round(LEVEL_SIZE * sy);
    const badge = imageRef('ui/alliance/tech-badge');
    return (
        <view name="TechIcon"
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image name="TechIcon/Plate" source={plate}
                style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />
            <image name="TechIcon/Icon" source={icon}
                style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
            <image name="TechIcon/LevelBg" source={badge}
                style={{ position: 'absolute', left: badgeLeft, top: badgeTop, width: badgeWidth, height: badgeHeight,
                    sizeMode: 'sliced' }} />
            <text name="TechIcon/Level" value={level}
                style={{ position: 'absolute', left: badgeLeft, top: badgeTop, width: badgeWidth, height: badgeHeight,
                    font: fontRef('fonts/regular', 700), fontSize: fontSize, color: '#ffffff', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>
    );
});
