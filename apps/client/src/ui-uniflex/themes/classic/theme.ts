import { defineTheme, fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export const classicTheme = defineTheme({
    font: fontRef('fonts/regular', 400),
    text: '#3f3254',
    button: {
        label: '#ffffff',
        confirm: { image: imageRef('ui/button/confirm'), outline: '#643e14' },
        cancel: { image: imageRef('ui/button/cancel'), outline: '#4e783b' },
        cyan: { image: imageRef('ui/button/cyan'), outline: '#2e5a68' },
    },
    popup: {
        prompt: imageRef('ui/popup/prompt'), small: imageRef('ui/popup/small'),
        close: imageRef('ui/popup/close'),
        title: '#ffffff', outline: '#593d84', mask: '#00000099',
    },
    checkbox: {
        on: imageRef('ui/character/check-on'),
        off: imageRef('ui/character/check-off'),
    },
});
