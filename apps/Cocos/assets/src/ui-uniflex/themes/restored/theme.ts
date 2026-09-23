import { defineTheme, fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { classicTheme } from '../classic/theme';

/** Settings PSD look. Other sections stay classic until those screens get their own art. */
export const restoredTheme = defineTheme({
    ...classicTheme,
    settings: {
        ...classicTheme.settings,
        panel: imageRef('ui/settings/panel-dragon'),
        panelLeft: 18, panelTop: 136, panelWidth: 714, panelHeight: 1027,
        titleFont: fontRef('SettingsRestored-font-9386e356e761e6dd', 700),
        titleColor: '#e1e8c7', titleOutline: '#000000', titleOutlineWidth: 0,
        titleLeft: 93, titleRight: 93, titleTop: 34, titleHeight: 80,
        close: imageRef('ui/settings/close-circle'),
        closeRight: 12, closeTop: 31, closeHit: 65, closeIcon: 65,
        menuBackground: imageRef('ui/settings/button-gold'),
        menuIcon: imageRef('ui/settings/gear-gold'),
        menuColor: '#844b00',
    },
});
