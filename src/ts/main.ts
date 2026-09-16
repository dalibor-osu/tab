import './boot';
import {
    applyBackground,
    backgroundImage,
    clearImage,
    handleImageFile,
    matchThemeToImage,
    peekBackground,
    releaseBackground,
    setBackgroundSource
} from './background';
import { imagePromise } from './boot';
import {
    closeCommandModal,
    findCommand,
    loadCommands,
    openCommandModal,
    renderCommandList,
    saveCommandForm,
    syncCommandForm,
    useCommandSuggestion
} from './commands';
import {
    closeImportModal,
    exportHistory,
    importHistory,
    openExportModal,
    readImportFile,
    runExport,
    runImport,
    syncImportForm
} from './data';
import {
    addCommandBtn,
    addShortcutBtn,
    addWidgetBtn,
    arrangeBtn,
    arrangeDoneBtn,
    bgUrlInput,
    cancelBtn,
    clearCssBtn,
    commandCancelBtn,
    commandOverlay,
    commandSaveBtn,
    commandType,
    commandUrls,
    confirmCancelBtn,
    confirmDeleteBtn,
    confirmOverlay,
    contextDeleteBtn,
    contextEditBtn,
    contextMenu,
    cssEditor,
    engineSelect,
    exportCancelBtn,
    exportConfirmBtn,
    exportOverlay,
    extensionGroup,
    fontSelect,
    gridCols,
    gridRows,
    historyImportInput,
    imageInput,
    importCancelBtn,
    importConfirmBtn,
    importInput,
    importModeApply,
    importModePreset,
    importOverlay,
    initDom,
    introTip,
    modalOverlay,
    presetCancelBtn,
    presetOverlay,
    presetSaveBtn,
    safeModeNote,
    saveBtn,
    savePresetBtn,
    searchForm,
    searchInput,
    searchSuggestions,
    settingsBtn,
    settingsClose,
    settingsZone,
    titleFontSelect,
    widgetCancelBtn,
    widgetCode,
    widgetFetchBtn,
    widgetFileBtn,
    widgetFileInput,
    widgetGrantBtn,
    widgetHosts,
    widgetLayer,
    widgetOverlay,
    widgetSaveBtn,
    widgetSource,
    widgetType
} from './dom';
import { extensionApi } from './extension';
import { applySettings, bindControls, buildPresets, buildSelect, resetAll, resetLook, syncControls } from './panel';
import {
    closePresetModal,
    loadPresetList,
    openPresetModal,
    presetLoadParts,
    renderPresetList,
    savePresetForm
} from './presets';
import {
    ENGINES,
    activeSuggestion,
    clearHistory,
    hideSuggestions,
    loadHistory,
    moveSuggestion,
    performSearch,
    renderSuggestions,
    useSuggestion
} from './search';
import { customCss, setCustomCss, settings } from './settings';
import {
    closeModal,
    contextTarget,
    deleteShortcut,
    hideContextMenu,
    loadIconCache,
    loadShortcuts,
    openModal,
    saveNewShortcut
} from './shortcuts';
import { CUSTOM_CSS_KEY, INTRO_KEY, readRaw, writeRaw } from './storage';
import { FONTS, applyCustomCss, safeMode } from './theme';
import type { PartKey } from './types';
import { closeConfirm, confirmDelete, hideIntroTip, hideModal, showIntroTip, showToast } from './ui';
import {
    arrangeDrag,
    arrangePointerMove,
    arrangePointerUp,
    arranging,
    changeGrid,
    previewGrid,
    startArranging,
    stopArranging,
    widgetPointerDown,
    widgetPointerHover
} from './widgets/arrange';
import {
    changeWidgetType,
    closeWidgetModal,
    fetchWidgetSource,
    loadWidgetFile,
    openWidgetModal,
    saveWidgetForm,
    syncWidgetManifest
} from './widgets/editor';
import {
    widgetDocs,
    grantDirectAccess,
    handleWidgetMessage,
    postToWidget,
    syncGrantRow,
    widgetForSource
} from './widgets/external';
import { WIDGET_TYPES, findWidget, loadWidgets } from './widgets/model';
import { renderWidgetList, renderWidgets, syncGridControls } from './widgets/render';

type Timer = ReturnType<typeof setTimeout> | undefined;

function byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
}

function start() {
    initDom();
    let cssApplyTimer: Timer;
    let grantTimer: Timer;
    let manifestTimer: Timer;

    searchForm.addEventListener('submit', e => {
        e.preventDefault();
        performSearch(searchInput.value, false);
    });

    searchInput.addEventListener('input', () => renderSuggestions(false));
    searchInput.addEventListener('blur', hideSuggestions);
    searchSuggestions.addEventListener('mousedown', e => e.preventDefault());

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const active = searchSuggestions.querySelector<HTMLElement>('.search-suggestion.active');
            const value = active && !active.dataset.command ? active.dataset.value || '' : searchInput.value;
            performSearch(value, true);
            return;
        }

        if (searchSuggestions.hidden) {
            if (e.key === 'ArrowDown') {
                renderSuggestions(true);
                if (!searchSuggestions.hidden) {
                    e.preventDefault();
                    moveSuggestion(1);
                }
            }
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            const items = searchSuggestions.querySelectorAll<HTMLElement>('.search-suggestion');
            if (items.length === 1 && items[0].dataset.command) {
                const command = findCommand(items[0].dataset.command);
                if (command) {
                    searchInput.value = `/${command.name}${command.type === 'search' ? ' ' : ''}`;
                }
                hideSuggestions();
                return;
            }
            moveSuggestion(e.shiftKey ? -1 : 1);
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveSuggestion(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveSuggestion(-1);
        } else if (e.key === 'Enter' && activeSuggestion >= 0) {
            e.preventDefault();
            const active = searchSuggestions.querySelector<HTMLElement>('.search-suggestion.active');
            if (!active) {
                return;
            }
            if (active.dataset.command) {
                const command = findCommand(active.dataset.command);
                if (command) {
                    useCommandSuggestion(command);
                }
            } else {
                useSuggestion(active.dataset.value || '');
            }
        }
    });

    byId('clearHistoryBtn').addEventListener('click', clearHistory);
    addShortcutBtn.addEventListener('click', () => openModal());
    cancelBtn.addEventListener('click', closeModal);
    saveBtn.addEventListener('click', saveNewShortcut);
    confirmCancelBtn.addEventListener('click', closeConfirm);
    confirmDeleteBtn.addEventListener('click', confirmDelete);

    confirmOverlay.addEventListener('click', e => {
        if (e.target === confirmOverlay) {
            closeConfirm();
        }
    });

    document.addEventListener('pointerdown', e => {
        if (!contextMenu.hidden && !contextMenu.contains(e.target as Node)) {
            hideContextMenu();
        }
    });

    document.addEventListener('contextmenu', e => {
        if (!(e.target as Element).closest('.shortcut-item')) {
            hideContextMenu();
        }
    });

    window.addEventListener('blur', hideContextMenu);
    window.addEventListener('resize', hideContextMenu);

    contextEditBtn.addEventListener('click', () => {
        const index = contextTarget;
        hideContextMenu();
        openModal(index);
    });

    contextDeleteBtn.addEventListener('click', () => {
        const index = contextTarget;
        hideContextMenu();
        deleteShortcut(index);
    });

    cssEditor.addEventListener('input', () => {
        setCustomCss(cssEditor.value);
        clearTimeout(cssApplyTimer);
        cssApplyTimer = setTimeout(() => {
            writeRaw(CUSTOM_CSS_KEY, customCss);
            applyCustomCss(settings.customCssEnabled ? customCss : '');
        }, 120);
    });

    cssEditor.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const { selectionStart, selectionEnd, value } = cssEditor;
            cssEditor.value = value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd);
            cssEditor.selectionStart = cssEditor.selectionEnd = selectionStart + 4;
            cssEditor.dispatchEvent(new Event('input'));
        }
    });

    clearCssBtn.addEventListener('click', () => {
        cssEditor.value = '';
        cssEditor.dispatchEvent(new Event('input'));
    });

    safeModeNote.hidden = !safeMode;
    extensionGroup.hidden = !extensionApi();

    if (safeMode && customCss) {
        setTimeout(() => showToast('Safe mode: your custom CSS is not applied on this load.'), 1200);
    }

    addCommandBtn.addEventListener('click', () => openCommandModal());
    commandType.addEventListener('change', syncCommandForm);
    commandCancelBtn.addEventListener('click', closeCommandModal);
    commandSaveBtn.addEventListener('click', saveCommandForm);

    commandOverlay.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target === commandOverlay) {
            closeCommandModal();
        }
    });

    modalOverlay.addEventListener('click', e => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    settingsBtn.addEventListener('click', () => {
        settingsZone.classList.toggle('open');
    });

    settingsClose.addEventListener('click', () => {
        settingsZone.classList.remove('open');
    });

    document.addEventListener('click', e => {
        if (!settingsZone.contains(e.target as Node)) {
            settingsZone.classList.remove('open');
        }
    });

    document.querySelectorAll<HTMLElement>('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.settings-page').forEach(el => el.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.settings-page[data-page="${tab.dataset.tab}"]`)?.classList.add('active');
        });
    });

    byId('pickImageBtn').addEventListener('click', () => imageInput.click());
    byId('clearImageBtn').addEventListener('click', clearImage);

    imageInput.addEventListener('change', () => {
        handleImageFile(imageInput.files?.[0]);
        imageInput.value = '';
    });

    byId('matchThemeBtn').addEventListener('click', matchThemeToImage);

    bgUrlInput.addEventListener('change', () => {
        if (settings.autoTheme && !backgroundImage && settings.bgUrl.trim()) {
            matchThemeToImage();
        }
    });

    document.querySelectorAll<HTMLInputElement>('[data-page="background"] input[type="range"]').forEach(slider => {
        slider.addEventListener('pointerdown', peekBackground);
        slider.addEventListener('input', () => {
            peekBackground();
            releaseBackground(900);
        });
        slider.addEventListener('blur', () => releaseBackground(0));
    });

    document.addEventListener('pointerup', () => {
        if (settingsZone.classList.contains('peeking')) {
            releaseBackground(400);
        }
    });

    byId('exportBtn').addEventListener('click', openExportModal);
    exportCancelBtn.addEventListener('click', () => hideModal(exportOverlay));
    exportConfirmBtn.addEventListener('click', runExport);

    exportOverlay.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target === exportOverlay) {
            hideModal(exportOverlay);
        }
    });

    byId('importBtn').addEventListener('click', () => importInput.click());

    importInput.addEventListener('change', () => {
        const file = importInput.files?.[0];
        if (file) {
            readImportFile(file);
        }
        importInput.value = '';
    });

    importModeApply.addEventListener('change', syncImportForm);
    importModePreset.addEventListener('change', syncImportForm);
    importCancelBtn.addEventListener('click', closeImportModal);
    importConfirmBtn.addEventListener('click', runImport);

    importOverlay.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target === importOverlay) {
            closeImportModal();
        }
    });

    byId('exportHistoryBtn').addEventListener('click', exportHistory);
    byId('importHistoryBtn').addEventListener('click', () => historyImportInput.click());

    historyImportInput.addEventListener('change', () => {
        const file = historyImportInput.files?.[0];
        if (file) {
            importHistory(file);
        }
        historyImportInput.value = '';
    });

    savePresetBtn.addEventListener('click', () => openPresetModal());
    presetCancelBtn.addEventListener('click', closePresetModal);
    presetSaveBtn.addEventListener('click', savePresetForm);

    presetOverlay.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target === presetOverlay) {
            closePresetModal();
        }
    });

    document.querySelectorAll<HTMLInputElement>('[data-preset-part]').forEach(el => {
        el.addEventListener('change', () => {
            presetLoadParts[el.dataset.presetPart as PartKey] = el.checked;
        });
    });

    buildSelect(
        widgetType,
        Object.entries(WIDGET_TYPES).map(([id, type]) => ({ id, label: type.label }))
    );

    widgetType.addEventListener('change', changeWidgetType);
    widgetFetchBtn.addEventListener('click', fetchWidgetSource);
    widgetGrantBtn.addEventListener('click', grantDirectAccess);

    widgetHosts.addEventListener('input', () => {
        clearTimeout(grantTimer);
        grantTimer = setTimeout(syncGrantRow, 300);
    });

    widgetFileBtn.addEventListener('click', () => widgetFileInput.click());

    widgetFileInput.addEventListener('change', () => {
        loadWidgetFile(widgetFileInput.files?.[0]);
        widgetFileInput.value = '';
    });

    widgetSource.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            fetchWidgetSource();
        }
    });

    widgetCode.addEventListener('input', () => {
        clearTimeout(manifestTimer);
        manifestTimer = setTimeout(() => syncWidgetManifest(), 300);
    });

    addWidgetBtn.addEventListener('click', () => openWidgetModal());
    widgetCancelBtn.addEventListener('click', closeWidgetModal);
    widgetSaveBtn.addEventListener('click', saveWidgetForm);

    widgetOverlay.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target === widgetOverlay) {
            closeWidgetModal();
        }
    });

    arrangeBtn.addEventListener('click', startArranging);
    arrangeDoneBtn.addEventListener('click', stopArranging);
    widgetLayer.addEventListener('pointerdown', widgetPointerDown);
    widgetLayer.addEventListener('pointermove', widgetPointerHover);

    widgetLayer.addEventListener('contextmenu', e => {
        if (arranging) {
            e.preventDefault();
        }
    });

    widgetLayer.addEventListener(
        'touchmove',
        e => {
            if (arrangeDrag) {
                e.preventDefault();
            }
        },
        { passive: false }
    );

    widgetLayer.addEventListener('pointermove', arrangePointerMove);
    widgetLayer.addEventListener('pointerup', arrangePointerUp);
    widgetLayer.addEventListener('pointercancel', arrangePointerUp);

    gridCols.addEventListener('input', () => changeGrid('cols', gridCols.value));
    gridRows.addEventListener('input', () => changeGrid('rows', gridRows.value));
    [gridCols, gridRows].forEach(slider => slider.addEventListener('pointerdown', previewGrid));

    window.addEventListener('message', e => {
        const message = e.data as Record<string, unknown> | null;
        if (!message || typeof message !== 'object') {
            return;
        }
        const target = widgetForSource(e.source);
        const item = target ? findWidget(target.id) : null;
        if (!target || !item) {
            return;
        }
        if (message.source === 'tab-sandbox' && message.type === 'sandbox-ready') {
            postToWidget(target.frame, { type: 'load', html: widgetDocs.get(item.id) || '' });
        } else if (message.source === 'tab-widget') {
            handleWidgetMessage(target, item, message);
        }
    });

    byId('resetLookBtn').addEventListener('click', resetLook);
    byId('resetAllBtn').addEventListener('click', resetAll);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (arranging) {
                stopArranging();
            } else if (!contextMenu.hidden) {
                hideContextMenu();
            } else if (commandOverlay.classList.contains('active')) {
                closeCommandModal();
            } else if (widgetOverlay.classList.contains('active')) {
                closeWidgetModal();
            } else if (presetOverlay.classList.contains('active')) {
                closePresetModal();
            } else if (exportOverlay.classList.contains('active')) {
                hideModal(exportOverlay);
            } else if (importOverlay.classList.contains('active')) {
                closeImportModal();
            } else if (confirmOverlay.classList.contains('active')) {
                closeConfirm();
            } else if (modalOverlay.classList.contains('active')) {
                closeModal();
            } else if (settingsZone.classList.contains('open')) {
                settingsZone.classList.remove('open');
            } else if (!introTip.hidden) {
                hideIntroTip();
            } else if (!searchSuggestions.hidden) {
                hideSuggestions();
            } else if (document.activeElement === searchInput) {
                searchInput.blur();
            }
        }

        if (e.key === '/' && document.activeElement !== searchInput && !settingsZone.contains(document.activeElement)) {
            e.preventDefault();
            searchInput.focus();
            if (!searchInput.value) {
                searchInput.value = '/';
                renderSuggestions(false);
            }
        }

        if (e.key === 'Enter' && modalOverlay.classList.contains('active')) {
            saveNewShortcut();
        }

        if (e.key === 'Enter' && commandOverlay.classList.contains('active') && e.target !== commandUrls) {
            saveCommandForm();
        }

        if (e.key === 'Enter' && presetOverlay.classList.contains('active')) {
            savePresetForm();
        }

        if (e.key === 'Enter' && exportOverlay.classList.contains('active')) {
            runExport();
        }

        if (e.key === 'Enter' && importOverlay.classList.contains('active')) {
            runImport();
        }

        if (
            e.key === 'Enter' &&
            widgetOverlay.classList.contains('active') &&
            (e.target as HTMLElement).tagName !== 'TEXTAREA'
        ) {
            saveWidgetForm();
        }
    });

    buildSelect(fontSelect, FONTS);
    buildSelect(titleFontSelect, [{ id: 'inherit', label: 'Same as text' }, ...FONTS]);
    buildSelect(engineSelect, ENGINES);
    buildPresets();

    applySettings();
    bindControls();
    loadIconCache();
    loadShortcuts();
    loadHistory();
    loadCommands();
    renderCommandList();
    loadPresetList();
    renderPresetList();
    loadWidgets();
    renderWidgets();
    renderWidgetList();
    syncGridControls();

    imagePromise.then(stored => {
        setBackgroundSource(stored);
        applyBackground();
        syncControls();
    });

    syncControls();

    setTimeout(() => searchInput.focus(), 300);
    setTimeout(() => document.body.classList.remove('intro'), 1000);

    byId('introTipBtn').addEventListener('click', hideIntroTip);
    byId('showIntroBtn').addEventListener('click', () => {
        settingsZone.classList.remove('open');
        showIntroTip();
    });

    document.querySelectorAll('.corner-btn').forEach(button => {
        button.addEventListener('click', () => {
            if (!introTip.hidden) {
                hideIntroTip();
            }
        });
    });

    if (!readRaw(INTRO_KEY)) {
        setTimeout(showIntroTip, 1200);
    }

    if (
        BUILD_TARGET === 'web' &&
        'serviceWorker' in navigator &&
        (location.protocol === 'https:' || location.hostname === 'localhost')
    ) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
