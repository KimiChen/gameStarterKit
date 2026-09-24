import { defineComponent, For } from '@uniflex/compiler';
import { fontRef } from '../../../../kits/uniflex/api/core/index';
import type { MailContentParagraph as Paragraph, MailContentRun } from './mailContentTypes';

export const MailContentParagraph = defineComponent<{ readonly item: Paragraph }>((p) => {
    const height = p.item.height;
    return <view name="MailContent/Paragraph" style={{ position: 'relative', width: 636, height: height }}>
        <For each={p.item.runs} key="id">{(run) => <MailContentSpan run={run} />}</For>
    </view>;
});
export const MailContentSpan = defineComponent<{ readonly run: MailContentRun }>((p) => {
    const run = p.run;
    const left = run.x;
    const top = run.y;
    const width = run.width;
    const color = run.color;
    return <text value={run.text} style={{ position: 'absolute', left: left, top: top, width: width, height: 34,
        font: fontRef('fonts/regular', 700), bold: true, fontSize: 26, color: color, verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />;
});
