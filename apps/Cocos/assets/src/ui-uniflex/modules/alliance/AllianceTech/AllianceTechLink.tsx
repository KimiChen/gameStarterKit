import { defineComponent } from '@uniflex/compiler';

export interface AllianceTechLinkData {
    readonly id: string;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly color: string;
}

export interface AllianceTechLinkProps {
    readonly link: AllianceTechLinkData;
}

export const AllianceTechLink = defineComponent<AllianceTechLinkProps>((p) => {
    const link = p.link;
    const left = link.left;
    const top = link.top;
    const width = link.width;
    const height = link.height;
    const color = link.color;
    return (
        <view name="AllianceTechLink"
            style={{ position: 'absolute', left: left, top: top, width: width, height: height, backgroundColor: color }} />
    );
});
