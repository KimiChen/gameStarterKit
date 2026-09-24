import { defineComponent, For } from '@uniflex/compiler';
import { fontRef } from '../../../../kits/uniflex/api/core/index';
import type { BattleLogTextRun } from './battleLogData';

export const BattleLogText = defineComponent<{
    readonly runs: readonly BattleLogTextRun[];
    readonly top: number;
    readonly height: number;
    readonly fontSize?: number;
}>((p) => {
    const top = p.top;
    const height = p.height;
    return <view name="BattleLog/Text" style={{ position: 'absolute', top: top, width: 652, height: height }}>
        <For each={p.runs} key="id">{(run) => <BattleLogTextSpan run={run} fontSize={p.fontSize} />}</For>
    </view>;
});

export const BattleLogTextSpan = defineComponent<{ readonly run: BattleLogTextRun; readonly fontSize?: number }>((p) => {
    const run = p.run;
    const left = run.x;
    const top = run.y;
    const width = run.width;
    const size = p.fontSize ?? 28;
    const color = run.color;
    return <text value={run.text} style={{ position: 'absolute', left: left, top: top, width: width, height: 36,
        font: fontRef('fonts/regular', 700), bold: true, fontSize: size, color: color, verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />;
});
