import { defineTheme, fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export const classicTheme = defineTheme({
    font: fontRef('fonts/regular', 400),
    text: '#3f3254',
    button: {
        label: '#ffffff',
        confirm: { image: imageRef('ui/button/confirm'), outline: '#643e14' },
        cancel: { image: imageRef('ui/button/cancel'), outline: '#4e783b' },
    },
    popup: {
        prompt: imageRef('ui/popup/prompt'), small: imageRef('ui/popup/small'),
        close: imageRef('ui/popup/close'),
        title: '#ffffff', outline: '#593d84', mask: '#00000099',
    },
});
