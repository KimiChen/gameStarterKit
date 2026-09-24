import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ActionButton } from '../../../components/button/ActionButton';
import { ReportDetailSummary } from './ReportDetailSummary';
import { ReportDetailShips } from './ReportDetailShips';
import { ReportDetailHeroes } from './ReportDetailHeroes';
import { ReportDetailEquipment } from './ReportDetailEquipment';
import { ReportDetailSoldiers } from './ReportDetailSoldiers';
import { ReportDetailAttributes } from './ReportDetailAttributes';
import { MailBattleLogPanel } from '../MailBattleLog/MailBattleLogPanel';

export interface MailReportDetailPanelProps {
    readonly visible?: boolean;
    readonly onClose?: () => void;
    readonly onAction?: (action: string) => void;
}
interface ReportDetailSection { readonly id: string; readonly height: number; }
const detailWindow = imageRef('ui/mail-report-detail/window');
const detailDelete = imageRef('ui/mail/popup-delete');
const detailShare = imageRef('ui/mail-report-detail/share');
const sections: readonly ReportDetailSection[] = [
    { id: 'summary', height: 721 }, { id: 'ships', height: 268 }, { id: 'heroes', height: 408 },
    { id: 'equipment', height: 727 }, { id: 'soldiers', height: 218 }, { id: 'attributes', height: 313 },
    { id: 'links', height: 130 },
];

/** All four reference captures are successive positions in one continuous report. */
export const MailReportDetailPanel = defineComponent<MailReportDetailPanelProps>((p) => {
    const source = useMemo(() => new ArrayVirtualListDataSource(sections), []);
    const list = useRef<VirtualCollectionController | null>(null);
    const [showLinks, setShowLinks] = useState(false);
    const [logOpen, setLogOpen] = useState(false);
    useEffect(() => { if (p.visible === false) setLogOpen(false); }, [p.visible]);
    const openLinkedPage = (action: string) => {
        if (action === 'battle-log') setLogOpen(true);
        p.onAction?.(action);
    };
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => { if (p.visible !== false) list.current?.scrollToIndex(0, 'start', 0); }, [p.visible]);
    useEffect(() => {
        if (p.visible === false) return;
        setShowLinks(false);
        const timer = setInterval(() => {
            const range = list.current?.getVisibleRange();
            setShowLinks(range !== undefined && range.lastVisible >= 5);
        }, 100);
        return () => clearInterval(timer);
    }, [p.visible]);
    return <view name="MailReportDetailPanel" visible={p.visible !== false} style={{ position: 'absolute', width: 750, height: 1624 }}>
        <PopupFrame title="战报详情" background={detailWindow}
            left={19} top={221} width={714} height={1186} titleTop={6} titleHeight={58}
            titleOutline="#754C2C" titleOutlineWidth={2} closeRight={3} closeTop={2} closeHit={50} closeIcon={50}
            maskColor="#00000099" onClose={p.onClose} />
        <image source={imageRef('ui/mail-report-detail/panel')} style={{ position: 'absolute', left: 40, top: 303, width: 673, height: 928 }} />
        <VirtualList source={source} key="id" sizeKey="height" direction="vertical" controller={list} inertia elastic overscan={1}
            style={{ position: 'absolute', left: 40, top: 307, width: 673, height: 924 }}>
            {(section) => <ReportDetailSectionItem section={section} onAction={p.onAction} />}
        </VirtualList>
        <ReportDetailLinks visible={showLinks} onAction={openLinkedPage} />
        <ActionButton source={detailDelete} label="删除" outlineColor="#6A2A28"
            left={77} top={1279} width={255} height={102} onClick={() => p.onAction?.('delete')} />
        <ActionButton source={detailShare} label="分享" outlineColor="#276275"
            left={419} top={1278} width={255} height={102} onClick={() => p.onAction?.('share')} />
        <MailBattleLogPanel visible={logOpen && p.visible !== false} onClose={() => setLogOpen(false)} onAction={p.onAction} />
    </view>;
});

export const ReportDetailSectionItem = defineComponent<{ readonly section: ReportDetailSection; readonly onAction?: (action: string) => void }>((p) => {
    const height = p.section.height;
    const id = p.section.id;
    return <view name="ReportDetailSection" style={{ position: 'relative', width: 673, height: height }}>
        <ReportDetailSummary visible={id === 'summary'} />
        <ReportDetailShips visible={id === 'ships'} />
        <ReportDetailHeroes visible={id === 'heroes'} />
        <ReportDetailEquipment visible={id === 'equipment'} />
        <ReportDetailSoldiers visible={id === 'soldiers'} onAction={p.onAction} />
        <ReportDetailAttributes visible={id === 'attributes'} onAction={p.onAction} />

    </view>;
});

/** Fixed lower-edge links appear only when the final comparison section enters. */
export const ReportDetailLinks = defineComponent<{ readonly visible: boolean; readonly onAction?: (action: string) => void }>((p) => (
        <view name="ReportDetail/Links" visible={p.visible} style={{ position: 'absolute', left: 40, top: 1101, width: 673, height: 143, backgroundColor: '#F1EEE8' }}>
            <view name="ReportDetail/BattleLog" interaction="press" onClick={() => p.onAction?.('battle-log')}
                style={{ position: 'absolute', left: 185, top: 13, width: 120, height: 117 }}>
                <image source={imageRef('ui/mail-report-detail/tab-circle')} style={{ position: 'absolute', left: 16, width: 86, height: 86 }} />
                <image source={imageRef('ui/mail-report-detail/icon-log')} style={{ position: 'absolute', left: 23, top: 3, width: 74, height: 84 }} />
                <text value="战斗日志" style={{ position: 'absolute', top: 88, width: 120, height: 34, font: fontRef('fonts/regular', 700), bold: true, fontSize: 30, color: '#3F3254', horizontalAlign: 'center' }} />
            </view>
            <view name="ReportDetail/TroopDetails" interaction="press" onClick={() => p.onAction?.('troop-details')}
                style={{ position: 'absolute', left: 366, top: 13, width: 120, height: 117 }}>
                <image source={imageRef('ui/mail-report-detail/tab-circle')} style={{ position: 'absolute', left: 16, width: 86, height: 86 }} />
                <image source={imageRef('ui/mail-report-detail/icon-troop')} style={{ position: 'absolute', left: 25, top: 5, width: 66, height: 76 }} />
                <text value="部队详情" style={{ position: 'absolute', top: 88, width: 120, height: 34, font: fontRef('fonts/regular', 700), bold: true, fontSize: 30, color: '#3F3254', horizontalAlign: 'center' }} />
            </view>
        </view>
));
