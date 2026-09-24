import { defineComponent, useEffect, useMemo, useRef, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { MailShareOption } from './MailShareOption';
import type { MailShareDestination } from './mailShareTypes';

export interface MailSharePanelProps {
    readonly visible?: boolean;
    readonly destinations?: readonly MailShareDestination[];
    readonly onClose?: () => void;
    readonly onSelect?: (destinationId: string) => void;
}
const popupImage = imageRef('ui/mail-share/popup');
const closeImage = imageRef('ui/popup/close');
const exampleDestinations: readonly MailShareDestination[] = [
    { id: 'sea', label: '海域', icon: imageRef('ui/mail-share/ship'), iconLeft: 43, iconTop: 19, iconWidth: 105, iconHeight: 117 },
    { id: 'alliance', label: '[FTB]斧头帮', icon: imageRef('ui/mail-share/horn'), iconLeft: 41, iconTop: 22, iconWidth: 102, iconHeight: 112 },
];

export const MailSharePanel = defineComponent<MailSharePanelProps>((p) => {
    const destinations = p.destinations ?? exampleDestinations;
    const source = useMemo(() => new ArrayVirtualListDataSource(destinations), [destinations]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => { if (p.visible !== false) list.current?.scrollToIndex(0, 'start', 0); }, [p.visible]);
    const select = (item: MailShareDestination) => {
        p.onSelect?.(item.id);
        p.onClose?.();
    };
    return <view name="MailSharePanel" visible={p.visible !== false} style={{ position: 'absolute', width: 750, height: 1624 }}>
        <PopupFrame title="分享" background={popupImage} closeSource={closeImage}
            left={21} top={377} width={708} height={650} titleTop={12} titleHeight={62}
            closeRight={25} closeTop={17} closeHit={50} closeIcon={50} maskColor="#00000099" onClose={p.onClose} />
        <image source={imageRef('ui/mail-share/list')} style={{ position: 'absolute', left: 33, top: 483, width: 683, height: 518 }} />
        <VirtualList source={source} key="id" itemSize={173} direction="vertical" controller={list} overscan={1} inertia elastic
            style={{ position: 'absolute', left: 44, top: 497, width: 661, height: 490 }}>
            {(item) => <MailShareOption item={item} onSelect={() => select(item)} />}
        </VirtualList>
    </view>;
});
