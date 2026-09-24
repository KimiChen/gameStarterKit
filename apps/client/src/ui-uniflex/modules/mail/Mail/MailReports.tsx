import { defineComponent, useEffect, useMemo, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { NotificationBadge } from '../../../components/badge/NotificationBadge';

const unreadDot = imageRef('ui/mail/unread-dot');

interface ReportRow {
    readonly id: string;
    readonly folder: string;
    readonly header: boolean;
    readonly height: number;
    readonly read: boolean;
    readonly victory: boolean;
}

const reportFolders = ['folder-1', 'folder-2'];
const reportsPerFolder = 3;
export const mailReportCount = reportFolders.length * reportsPerFolder;

/** Flatten folders and result cards into one variable-height list; never nest VirtualLists. */
function reportRows(expanded: Readonly<Record<string, boolean>>, read: Readonly<Record<string, boolean>>): ReportRow[] {
    const rows: ReportRow[] = [];
    for (const folder of reportFolders) {
        rows.push({ id: folder, folder, header: true, height: 170, read: read[folder] === true, victory: false });
        if (expanded[folder]) {
            for (let index = 0; index < reportsPerFolder; index += 1) {
                rows.push({ id: `${folder}-${index}`, folder, header: false, height: index === 0 ? 126 : index === 1 ? 125 : 132, read: false, victory: index !== 1 });
            }
        }
    }
    return rows;
}

export const MailReports = defineComponent<{
    readonly visible: boolean;
    readonly onAction?: (action: string) => void;
}>((p) => {
    const [expanded, setExpanded] = useState<Readonly<Record<string, boolean>>>({ 'folder-1': true });
    // The assembled reference shows the second folder with its read overlay and stamp.
    const [read, setRead] = useState<Readonly<Record<string, boolean>>>({ 'folder-2': true });
    const rows = useMemo(() => reportRows(expanded, read), [expanded, read]);
    const source = useMemo(() => new ArrayVirtualListDataSource(rows), [rows]);
    useEffect(() => () => source.dispose(), [source]);
    const toggle = (folder: string) => {
        setExpanded((current) => ({ ...current, [folder]: !current[folder] }));
        setRead((current) => ({ ...current, [folder]: true }));
        p.onAction?.(`toggle:${folder}`);
    };
    return <view name="MailReports" visible={p.visible} style={{ position: 'absolute', left: 30, top: 349, width: 690, height: 862 }}>
        <VirtualList source={source} key="id" sizeKey="height" direction="vertical" inertia elastic overscan={1}
            style={{ width: 690, height: 862 }}>
            {(item) => <MailReportItem row={item} onClick={() => item.header ? toggle(item.folder) : p.onAction?.(`report:${item.id}`)} />}
        </VirtualList>
    </view>;
});

export const MailReportItem = defineComponent<{ readonly row: ReportRow; readonly onClick?: () => void }>((p) => {
    const row = p.row;
    const height = row.height;
    const resultColor = row.victory ? '#A2671C' : '#837A91';
    return <view name="MailReportItem" style={{ position: 'relative', width: 690, height: height }}>
        <view name="Mail/Folder" visible={row.header} interaction="press" onClick={p.onClick}
            style={{ position: 'absolute', width: 690, height: 163 }}>
            <image source={imageRef('ui/mail/popup-row')} style={{ position: 'absolute', width: 690, height: 163 }} />
            <image source={imageRef('ui/mail/icon-bg')} style={{ position: 'absolute', left: 23, top: 28, width: 110, height: 110, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/mail/battle-icon')} style={{ position: 'absolute', left: 33, top: 43, width: 91, height: 82 }} />
            <text value="文件夹" style={{ position: 'absolute', left: 145, top: 24, width: 480, height: 38, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254' }} />
            <text value="野怪报告" style={{ position: 'absolute', left: 145, top: 65, width: 480, height: 28, font: fontRef('fonts/regular', 700), bold: true, fontSize: 24, color: '#837A91' }} />
            <text value="2026-9-8 11:14" style={{ position: 'absolute', left: 145, top: 89, width: 480, height: 28, font: fontRef('fonts/regular', 700), bold: true, fontSize: 24, color: '#3F3254' }} />
            <text value="UTC2026-11-7 11:14过期" style={{ position: 'absolute', left: 145, top: 113, width: 480, height: 28, font: fontRef('fonts/regular', 700), bold: true, fontSize: 24, color: '#837A91' }} />
            <NotificationBadge mode="dot" source={unreadDot} visible={!row.read} left={660} top={9} width={24} height={24} />
            <image source={imageRef('ui/mail/read-stamp')} visible={row.read} style={{ position: 'absolute', left: 515, top: 77, width: 125, height: 78 }} />
            <image source={imageRef('ui/mail/read-overlay')} visible={row.read} style={{ position: 'absolute', width: 690, height: 163, sizeMode: 'sliced' }} />
        </view>
        <view name="Mail/Result" visible={!row.header} interaction="press" onClick={p.onClick}
            style={{ position: 'absolute', left: 7, top: 0, width: 677, height: 122 }}>
            <image source={imageRef('ui/mail/popup-battle-card')} style={{ position: 'absolute', width: 677, height: 122 }} />
            <image source={imageRef('ui/mail/popup-battle-line')} style={{ position: 'absolute', left: 5, top: 48, width: 665, height: 2 }} />
            <text value="与Lv.2堕落海灵发生了战斗！" style={{ position: 'absolute', left: 13, top: 8, width: 650, height: 35, font: fontRef('fonts/regular', 700), bold: true, fontSize: 26, color: '#3F3254' }} />
            <text value={row.victory ? '战斗胜利' : '战斗失败'} style={{ position: 'absolute', left: 13, top: 61, width: 260, height: 45, font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: resultColor }} />
            <text value="2026-05-29" style={{ position: 'absolute', right: 10, top: 66, width: 240, height: 36, font: fontRef('fonts/regular', 700), bold: true, fontSize: 26, color: '#837A91', horizontalAlign: 'right' }} />
        </view>
    </view>;
});
