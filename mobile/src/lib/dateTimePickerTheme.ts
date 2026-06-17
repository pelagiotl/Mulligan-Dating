import { connectionLimitsPanelColors, type ConnectShellMode } from './connectShellTheme';

export type DateTimePickerTheme = {
  sheetGradient: readonly [string, string, string];
  sheetBorder: string;
  backdrop: string;
  title: string;
  closeBg: string;
  closeBorder: string;
  closeText: string;
  handle: string;
  summaryGradient: readonly [string, string];
  summaryBorder: string;
  summaryEyebrow: string;
  summaryDate: string;
  summaryTime: string;
  sectionBg: string;
  sectionBorder: string;
  sectionLabel: string;
  chipBg: string;
  chipBorder: string;
  chipPrimary: string;
  chipSecondary: string;
  chipActiveGradient: readonly [string, string, ...string[]];
  chipShadow: string;
  cancelBg: string;
  cancelBorder: string;
  cancelText: string;
  doneGradient: readonly [string, string, ...string[]];
  triggerBg: string;
  triggerBorder: string;
  triggerShadow: string;
  triggerIconGradient: readonly [string, string];
  triggerIconBorder: string;
  triggerDate: string;
  triggerTime: string;
  triggerChevronBg: string;
  triggerChevron: string;
  proposePanelBg: string;
  proposePanelBorder: string;
  proposePanelShadow: string;
  proposeHeading: string;
  fieldLabel: string;
};

export function dateTimePickerTheme(mode: ConnectShellMode): DateTimePickerTheme {
  const panel = connectionLimitsPanelColors(mode);

  if (mode === 'midnight') {
    return {
      sheetGradient: panel.shellGradient,
      sheetBorder: panel.shellBorder,
      backdrop: 'rgba(8, 6, 14, 0.72)',
      title: '#f1f5f9',
      closeBg: 'rgba(38, 32, 52, 0.95)',
      closeBorder: 'rgba(167, 139, 250, 0.22)',
      closeText: '#c4b5fd',
      handle: 'rgba(167, 139, 250, 0.35)',
      summaryGradient: ['rgba(76, 29, 149, 0.42)', 'rgba(52, 32, 48, 0.55)'],
      summaryBorder: 'rgba(167, 139, 250, 0.28)',
      summaryEyebrow: '#c4b5fd',
      summaryDate: '#f1f5f9',
      summaryTime: '#f9a8d4',
      sectionBg: 'rgba(30, 27, 46, 0.88)',
      sectionBorder: 'rgba(167, 139, 250, 0.16)',
      sectionLabel: '#e2e8f0',
      chipBg: 'rgba(38, 32, 52, 0.95)',
      chipBorder: 'rgba(167, 139, 250, 0.22)',
      chipPrimary: '#f1f5f9',
      chipSecondary: '#94a3b8',
      chipActiveGradient: panel.accentGradient,
      chipShadow: '#a78bfa',
      cancelBg: 'rgba(38, 32, 52, 0.95)',
      cancelBorder: 'rgba(167, 139, 250, 0.18)',
      cancelText: '#94a3b8',
      doneGradient: ['#7c3aed', '#a855f7', '#f472b6'],
      triggerBg: 'rgba(30, 27, 46, 0.96)',
      triggerBorder: 'rgba(167, 139, 250, 0.32)',
      triggerShadow: '#7c3aed',
      triggerIconGradient: ['rgba(124, 58, 237, 0.35)', 'rgba(244, 114, 182, 0.22)'],
      triggerIconBorder: 'rgba(167, 139, 250, 0.2)',
      triggerDate: '#f1f5f9',
      triggerTime: '#f9a8d4',
      triggerChevronBg: 'rgba(124, 58, 237, 0.28)',
      triggerChevron: '#e9d5ff',
      proposePanelBg: 'rgba(30, 27, 46, 0.92)',
      proposePanelBorder: 'rgba(167, 139, 250, 0.28)',
      proposePanelShadow: '#4c1d95',
      proposeHeading: '#f1f5f9',
      fieldLabel: '#c4b5fd',
    };
  }

  if (mode === 'sunny') {
    return {
      sheetGradient: ['#fffbeb', '#fff7ed', '#ffffff'],
      sheetBorder: 'rgba(251, 191, 36, 0.28)',
      backdrop: 'rgba(67, 20, 7, 0.45)',
      title: '#431407',
      closeBg: '#fff7ed',
      closeBorder: 'rgba(251, 191, 36, 0.35)',
      closeText: '#9a3412',
      handle: 'rgba(251, 191, 36, 0.4)',
      summaryGradient: ['rgba(251, 191, 36, 0.16)', 'rgba(254, 215, 170, 0.2)'],
      summaryBorder: 'rgba(234, 88, 12, 0.2)',
      summaryEyebrow: '#c2410c',
      summaryDate: '#431407',
      summaryTime: '#ea580c',
      sectionBg: 'rgba(255, 255, 255, 0.9)',
      sectionBorder: 'rgba(251, 191, 36, 0.22)',
      sectionLabel: '#78350f',
      chipBg: '#fff',
      chipBorder: '#fed7aa',
      chipPrimary: '#431407',
      chipSecondary: '#78716c',
      chipActiveGradient: ['#ea580c', '#f97316', '#fb923c'],
      chipShadow: '#ea580c',
      cancelBg: '#fff7ed',
      cancelBorder: '#fed7aa',
      cancelText: '#78716c',
      doneGradient: ['#ea580c', '#f97316', '#fb923c'],
      triggerBg: '#fff',
      triggerBorder: 'rgba(251, 191, 36, 0.45)',
      triggerShadow: '#ea580c',
      triggerIconGradient: ['rgba(251, 191, 36, 0.2)', 'rgba(254, 215, 170, 0.35)'],
      triggerIconBorder: 'rgba(251, 191, 36, 0.3)',
      triggerDate: '#431407',
      triggerTime: '#ea580c',
      triggerChevronBg: 'rgba(234, 88, 12, 0.12)',
      triggerChevron: '#ea580c',
      proposePanelBg: 'rgba(255, 255, 255, 0.94)',
      proposePanelBorder: 'rgba(251, 191, 36, 0.35)',
      proposePanelShadow: '#ea580c',
      proposeHeading: '#431407',
      fieldLabel: '#c2410c',
    };
  }

  return {
    sheetGradient: ['#fdf2f8', '#f5f3ff', '#ffffff'],
    sheetBorder: 'rgba(167, 139, 250, 0.22)',
    backdrop: 'rgba(15, 10, 30, 0.52)',
    title: '#1e1b4b',
    closeBg: 'rgba(255,255,255,0.85)',
    closeBorder: 'rgba(167, 139, 250, 0.25)',
    closeText: '#64748b',
    handle: 'rgba(124, 58, 237, 0.22)',
    summaryGradient: ['rgba(124, 58, 237, 0.14)', 'rgba(167, 139, 250, 0.1)'],
    summaryBorder: 'rgba(124, 58, 237, 0.16)',
    summaryEyebrow: '#7c3aed',
    summaryDate: '#1e1b4b',
    summaryTime: '#5b21b6',
    sectionBg: 'rgba(255,255,255,0.72)',
    sectionBorder: 'rgba(167, 139, 250, 0.18)',
    sectionLabel: '#334155',
    chipBg: '#fff',
    chipBorder: '#e9d5ff',
    chipPrimary: '#1e1b4b',
    chipSecondary: '#64748b',
    chipActiveGradient: ['#7c3aed', '#a855f7'],
    chipShadow: '#7c3aed',
    cancelBg: 'rgba(255,255,255,0.9)',
    cancelBorder: '#e2e8f0',
    cancelText: '#64748b',
    doneGradient: ['#7c3aed', '#a855f7', '#c084fc'],
    triggerBg: '#fff',
    triggerBorder: 'rgba(167, 139, 250, 0.45)',
    triggerShadow: '#7c3aed',
    triggerIconGradient: ['rgba(124, 58, 237, 0.16)', 'rgba(167, 139, 250, 0.22)'],
    triggerIconBorder: 'rgba(124, 58, 237, 0.12)',
    triggerDate: '#1e1b4b',
    triggerTime: '#7c3aed',
    triggerChevronBg: 'rgba(124, 58, 237, 0.1)',
    triggerChevron: '#7c3aed',
    proposePanelBg: 'rgba(255,255,255,0.92)',
    proposePanelBorder: 'rgba(167,139,250,0.35)',
    proposePanelShadow: '#7c3aed',
    proposeHeading: '#1e1b4b',
    fieldLabel: '#7c3aed',
  };
}
