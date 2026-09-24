import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ActionButton } from '../../../components/button/ActionButton';
import { iconCaptionButton } from '../../../components/button/buttonSkins';
import { ReportDetailSummary } from './ReportDetailSummary';
import { ReportDetailShips } from './ReportDetailShips';
import { ReportDetailHeroes } from './ReportDetailHeroes';
import { ReportDetailEquipment } from './ReportDetailEquipment';
import { ReportDetailSoldiers } from './ReportDetailSoldiers';
import { ReportDetailAttributes } from './ReportDetailAttributes';
import { MailBattleLogPanel } from '../MailBattleLog/MailBattleLogPanel';
import { MailSoldierDetailsPanel } from '../MailSoldierDetails/MailSoldierDetailsPanel';
import { MailSharePanel } from '../MailShare/MailSharePanel';
import { MailTroopDetailsPanel } from '../MailTroopDetails/MailTroopDetailsPanel';

export interface MailReportDetailPanelProps {
    readonly visible?: boolean;
    readonly onClose?: () => void;
    readonly onAction?: (action: string) => void;
}
interface ReportDetailSection { readonly id: string; readonly height: number; }
const detailWindow = imageRef('ui/mail-report-detail/window');
const detailDelete = imageRef('ui/mail/popup-delete');
const detailShare = imageRef('ui/mail-report-detail/share');
const battleLogIcon = imageRef('ui/mail-report-detail/icon-log');
const troopDetailsIcon = imageRef('ui/mail-report-detail/icon-troop');
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
    const [linkedPage, setLinkedPage] = useState<'battle-log' | 'troop-details' | 'soldier-details' | 'share' | null>(null);
    useEffect(() => { if (p.visible === false) setLinkedPage(null); }, [p.visible]);
    const openLinkedPage = (action: string) => {
        if (action === 'battle-log' || action === 'troop-details' || action === 'share') setLinkedPage(action);
        if (action === 'soldier-info' || action === 'soldier:player' || action === 'soldier:enemy') setLinkedPage('soldier-details');
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
            {(section) => <ReportDetailSectionItem section={section} onAction={openLinkedPage} />}
        </VirtualList>
        <ReportDetailLinks visible={showLinks} onAction={openLinkedPage} />
        <ActionButton source={detailDelete} label="删除" outlineColor="#6A2A28"
            left={77} top={1279} width={255} height={102} onClick={() => p.onAction?.('delete')} />
        <ActionButton source={detailShare} label="分享" outlineColor="#276275"
            left={419} top={1278} width={255} height={102} onClick={() => openLinkedPage('share')} />
        <MailBattleLogPanel visible={linkedPage === 'battle-log' && p.visible !== false} onClose={() => setLinkedPage(null)} onAction={p.onAction} />
        <MailSoldierDetailsPanel visible={linkedPage === 'soldier-details' && p.visible !== false} onClose={() => setLinkedPage(null)} onAction={p.onAction} />
        <MailSharePanel visible={linkedPage === 'share' && p.visible !== false} onClose={() => setLinkedPage(null)} onSelect={(id) => p.onAction?.(`share:${id}`)} />
        <MailTroopDetailsPanel visible={linkedPage === 'troop-details' && p.visible !== false} onClose={() => setLinkedPage(null)} onAction={p.onAction} />
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
            <ActionButton accessibilityLabel="战斗日志" skin={iconCaptionButton} icon={battleLogIcon} label="战斗日志"
                left={185} top={13} iconLeft={23} iconTop={3} iconWidth={74} iconHeight={84}
                onClick={() => p.onAction?.('battle-log')} />
            <ActionButton accessibilityLabel="部队详情" skin={iconCaptionButton} icon={troopDetailsIcon} label="部队详情"
                left={366} top={13} iconLeft={25} iconTop={5} iconWidth={66} iconHeight={76}
                onClick={() => p.onAction?.('troop-details')} />
        </view>
));
