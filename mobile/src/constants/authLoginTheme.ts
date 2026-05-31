/**
 * Phone login midnight backdrop — dark wine-plum (web), no lilac/mauve lifts.
 */

/** Web stops, anchored on black — no bright mid bump */
export const AUTH_PAGE_GRADIENT = {
  colors: [
    '#0c0a12',
    '#100e16',
    '#15102a',
    '#1a1528',
    '#221a32',
    '#1a1528',
    '#141018',
    '#100e16',
    '#0c0a12',
  ] as const,
  locations: [0, 0.08, 0.22, 0.38, 0.5, 0.68, 0.82, 0.92, 1] as const,
  start: { x: 0.213, y: 0.09 },
  end: { x: 0.787, y: 0.91 },
};

export const AUTH_PAGE_GRADIENT_FALLBACK = '#0c0a12';

/** Deep shadow bands — depth without pastel glow */
export const AUTH_GLOW_BANDS = [
  {
    colors: [
      'transparent',
      'rgba(14, 10, 20, 0.5)',
      'rgba(22, 16, 30, 0.35)',
      'transparent',
    ] as const,
    locations: [0, 0.4, 0.62, 1] as const,
    start: { x: 0.1, y: 0 },
    end: { x: 0.9, y: 1 },
  },
] as const;

/** Dark wine radials — low chroma, no lilac */
export const AUTH_GLOW_WASHES = [
  {
    id: 'authShadowTL',
    cxRatio: 0.2,
    cyRatio: 0.18,
    rxRatio: 0.55,
    ryRatio: 0.42,
    inner: 'rgba(26, 16, 32, 0.28)',
    outer: 'rgba(26, 16, 32, 0)',
    fadeStop: '48%',
  },
  {
    id: 'authShadowBR',
    cxRatio: 0.82,
    cyRatio: 0.78,
    rxRatio: 0.5,
    ryRatio: 0.4,
    inner: 'rgba(20, 12, 26, 0.22)',
    outer: 'rgba(20, 12, 26, 0)',
    fadeStop: '46%',
  },
] as const;

/** Subtle crush for a tougher, darker frame */
export const AUTH_VIGNETTE = {
  colors: [
    'rgba(6, 4, 10, 0.5)',
    'rgba(8, 6, 12, 0.08)',
    'rgba(4, 3, 8, 0.45)',
  ] as const,
  locations: [0, 0.45, 1] as const,
  start: { x: 0.5, y: 0 },
  end: { x: 0.5, y: 1 },
};

export const AUTH_STAR_COUNT = 20;
