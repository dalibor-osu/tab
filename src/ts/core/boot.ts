import { extensionApi, isNewTabPage, openFreshTab } from './extension';
import { customCss, settings } from './settings';
import { readImage } from './storage';
import { applyCustomCss, applyEarlyBackground, applyFont, applyThemeVars, themeStyle, userStyle } from '../theme/theme';

themeStyle.id = 'themeVars';
document.head.appendChild(themeStyle);
userStyle.id = 'userCss';
document.head.appendChild(userStyle);

const api = extensionApi();
if (api && settings.newTabFocus && isNewTabPage()) {
    document.documentElement.style.visibility = 'hidden';
    openFreshTab(api);
    window.stop();
}

export const imagePromise: Promise<Blob | string> = readImage().catch(() => '');

applyThemeVars(settings);
applyFont(settings);
applyEarlyBackground(settings);
applyCustomCss(settings.customCssEnabled ? customCss : '');
