import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

type MailCollapseHeaderVariant = 'comparison' | 'log';

const comparisonBackground = imageRef('ui/mail-troop-details/row');
const logBackground = imageRef('ui/mail-battle-log/section-header');
const arrowImage = imageRef('ui/mail-battle-log/section-arrow');

/** Keep the background below page-owned text and the controls above it. */
export const MailCollapseHeaderBackground = defineComponent<{
    readonly variant?: MailCollapseHeaderVariant;
    readonly visible?: boolean;
}>((p) => {
    const log = p.variant === 'log';
    const background = log ? logBackground : comparisonBackground;
    const width = log ? 652 : 656;
    const height = log ? 52 : 62;
    return <image visible={p.visible !== false} source={background}
        style={{ position: 'absolute', width: width, height: height }} />;
});

export const MailCollapseHeaderControls = defineComponent<{
    readonly variant?: MailCollapseHeaderVariant;
    readonly expanded: boolean;
    readonly expandable?: boolean;
    readonly hitMaskName: string;
    readonly accessibilityLabel: string;
    readonly onToggle: () => void;
}>((p) => {
    const log = p.variant === 'log';
    const arrowLeft = log ? 608 : 610;
    const arrowTop = log ? 15 : 18;
    const arrowRotation = p.expanded ? 'rot:180' : 'rot:0';
    const expandable = p.expandable !== false;
    return <view style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <image name={arrowRotation} visible={expandable} source={arrowImage}
            style={{ position: 'absolute', left: arrowLeft, top: arrowTop, width: 34, height: 22 }} />
        {/* The empty transparent press target preserves the host's no-feedback path. */}
        <view name={p.hitMaskName} interaction="press" interactable={expandable}
            accessibilityLabel={p.accessibilityLabel} onClick={p.onToggle}
            style={{ position: 'absolute', width: '100%', height: '100%' }} />
    </view>;
});
