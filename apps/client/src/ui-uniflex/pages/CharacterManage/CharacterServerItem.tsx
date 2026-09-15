import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export type CharacterServerStatus = 'gray' | 'green' | 'yellow' | 'red';

export interface CharacterServerItemProps {
    readonly name: string;
    readonly status?: CharacterServerStatus;
    readonly onSelect?: () => void;
}

export const CharacterServerItem = defineComponent<CharacterServerItemProps>((p) => (
    <view name="CharacterServerItem" interaction="press" onClick={p.onSelect}
        style={{ position: 'relative', width: 306, height: 74 }}>
        <image source={imageRef('ui/character/server-bg')}
            style={{ position: 'absolute', width: 306, height: 74 }} />
        <image visible={p.status === 'green'} source={imageRef('ui/character/status-green')}
            style={{ position: 'absolute', left: 12, top: 24, width: 28, height: 28 }} />
        <image visible={p.status === 'yellow'} source={imageRef('ui/character/status-yellow')}
            style={{ position: 'absolute', left: 12, top: 24, width: 28, height: 28 }} />
        <image visible={p.status === 'red'} source={imageRef('ui/character/status-red')}
            style={{ position: 'absolute', left: 12, top: 24, width: 28, height: 28 }} />
        <image visible={p.status !== 'green' && p.status !== 'yellow' && p.status !== 'red'}
            source={imageRef('ui/character/status-gray')}
            style={{ position: 'absolute', left: 12, top: 24, width: 28, height: 28 }} />
        <text value={p.name} style={{ position: 'absolute', left: 52, top: 20, width: 236, height: 34,
            font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true,
            verticalAlign: 'center' }} />
    </view>
));
