import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

export interface AllianceMenuButtonProps {
    readonly label: string;
    readonly icon: ImageRef;
    readonly iconWidth: number;
    readonly iconHeight: number;
    readonly left: number;
    readonly top: number;
    readonly onClick?: () => void;
}

export const AllianceMenuButton = defineComponent<AllianceMenuButtonProps>((p) => (
    <view name="AllianceMenuButton" interaction="press" onClick={() => p.onClick?.()}
        style={{ position: 'absolute', left: p.left, top: p.top, width: 326, height: 114 }}>
        <image source={imageRef('ui/alliance/button')}
            style={{ position: 'absolute', width: 326, height: 114, sizeMode: 'sliced' }} />
        <image source={p.icon}
            style={{ position: 'absolute', left: 60 - p.iconWidth / 2, top: (114 - p.iconHeight) / 2,
                width: p.iconWidth, height: p.iconHeight }} />
        <text value={p.label}
            style={{ position: 'absolute', left: 118, top: 28, width: 190, height: 58,
                font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true,
                horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
