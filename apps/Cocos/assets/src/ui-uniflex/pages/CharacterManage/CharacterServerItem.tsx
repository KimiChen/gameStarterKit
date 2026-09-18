import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export type CharacterServerStatus = 'gray' | 'green' | 'yellow' | 'red';

export interface CharacterServerItemProps {
    readonly name: string;
    readonly status?: CharacterServerStatus;
    readonly onSelect?: () => void;
}

export const CharacterServerItem = defineComponent<CharacterServerItemProps>((p) => {
    const status = p.status;
    const green = imageRef('ui/character/status-green');
    const yellow = imageRef('ui/character/status-yellow');
    const red = imageRef('ui/character/status-red');
    const gray = imageRef('ui/character/status-gray');
    const source = status === 'green' ? green
        : status === 'yellow' ? yellow
        : status === 'red' ? red
        : gray;
    return (
    <view name="CharacterServerItem" interaction="press" onClick={p.onSelect}
        style={{ position: 'relative', width: 306, height: 74 }}>
        <image source={imageRef('ui/character/server-bg')}
            style={{ position: 'absolute', width: 306, height: 74 }} />
        <image source={source}
            style={{ position: 'absolute', left: 12, top: 24, width: 28, height: 28 }} />
        <text value={p.name} style={{ position: 'absolute', left: 52, top: 20, width: 236, height: 34,
            font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true,
            verticalAlign: 'center' }} />
    </view>
    );
});
