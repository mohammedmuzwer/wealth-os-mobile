/**
 * tokens.ts
 * Single source of truth for all design tokens in Wealth OS.
 * Source: WealthOS_PRD_v9_Final — Section 15: Design System Final Reference
 *
 * NEVER hardcode hex values in components. Always import from here.
 * REJECTED colours (never use): lime green, cyan, neon pink.
 */

// ─── Brand & Structural ───────────────────────────────────────────────────────

export const NAVY        = '#1A1A2E';  // Sidebar, primary text, card headers
export const PURPLE      = '#6C63FF';  // Brand, buttons, FABs, Overshield arc, Fixed pills, CTAs
export const PURPLE_BG   = '#EEEDF8';  // Purple tinted backgrounds
export const PURPLE_DARK = '#5A52E0';  // Pressed/active state for purple buttons

// ─── Ring Colours (exact PRD spec) ───────────────────────────────────────────

export const SHIELD_RED   = '#E53E3E';  // Crimson  — Shield Ring (outer), danger, overspend
export const TRACK_BLUE   = '#3182CE';  // Electric Blue — Track Ring (middle), info states
export const BUILD_GREEN  = '#38A169';  // Emerald  — Build Ring (inner), success, Elite tier
export const OVERSHIELD   = '#6C63FF';  // Purple   — Overshield pre-fill arc (same as brand)

// ─── Semantic Colours ─────────────────────────────────────────────────────────

export const VAULT_GOLD   = '#D69E2E';  // Gold — Vault Sweep, Elite score, Grace Period banner
export const AMBER        = '#D97706';  // Warnings, 50–80% spend bar
export const SUCCESS      = BUILD_GREEN;
export const DANGER       = SHIELD_RED;
export const INFO         = TRACK_BLUE;

// ─── Backgrounds ─────────────────────────────────────────────────────────────

export const BG_PAGE      = '#F8F8FC';  // App background (light mode)
export const BG_CARD      = '#FFFFFF';  // Card surfaces
export const BG_DARK      = '#1A1A2E';  // Dark mode page background (= NAVY)
export const BG_CARD_DARK = '#222640';  // Dark mode card surface

// ─── Text ─────────────────────────────────────────────────────────────────────

export const TEXT_PRIMARY  = '#1A1A2E';  // Headings (= NAVY)
export const TEXT_BODY     = '#374151';  // Body text
export const TEXT_MUTED    = '#8888AA';  // Secondary labels (PRD spec)
export const TEXT_WHITE    = '#FFFFFF';

// ─── Borders ─────────────────────────────────────────────────────────────────

export const BORDER        = '#E4E2F5';  // Card borders (PRD spec)
export const BORDER_LIGHT  = '#F3F4F6';  // Subtle dividers

// ─── Spend Bar States ─────────────────────────────────────────────────────────

export const SPEND_LOW    = BUILD_GREEN;  // < 50%
export const SPEND_MID    = AMBER;        // 50–80%
export const SPEND_HIGH   = SHIELD_RED;   // > 80%

// ─── Score Tier Colours ───────────────────────────────────────────────────────

export const TIER_AT_RISK  = SHIELD_RED;  // 0–59
export const TIER_STABLE   = TEXT_MUTED;  // 60–74
export const TIER_GROWING  = TRACK_BLUE;  // 75–84
export const TIER_STRONG   = BUILD_GREEN; // 85–94
export const TIER_ELITE    = VAULT_GOLD;  // 95–100 + subtle glow

export const getTierColor = (score: number): string => {
  if (score >= 95) return TIER_ELITE;
  if (score >= 85) return TIER_STRONG;
  if (score >= 75) return TIER_GROWING;
  if (score >= 60) return TIER_STABLE;
  return TIER_AT_RISK;
};

export const getTierLabel = (score: number): string => {
  if (score >= 95) return 'ELITE';
  if (score >= 85) return 'STRONG';
  if (score >= 75) return 'GROWING';
  if (score >= 60) return 'STABLE';
  return 'AT RISK';
};

// ─── Typography ───────────────────────────────────────────────────────────────

import { Platform } from 'react-native';

/**
 * DM Mono — for all score numbers and rupee amounts.
 * Falls back to system monospace on devices without the font loaded.
 */
export const FONT_MONO = Platform.select({
  ios:     'DMMonoMedium',   // after loading via expo-font
  android: 'DMMonoMedium',
  default: 'monospace',
});

/**
 * DM Sans — for all UI text (headings, body, labels).
 */
export const FONT_UI = Platform.select({
  ios:     'DMSans-Regular',
  android: 'DMSans-Regular',
  default: 'System',
});

// ─── Spacing & Radius ─────────────────────────────────────────────────────────

export const RADIUS_SM  = 10;
export const RADIUS_MD  = 16;
export const RADIUS_LG  = 20;
export const RADIUS_XL  = 24;
export const RADIUS_PILL = 999;

export const SPACE_XS = 4;
export const SPACE_SM = 8;
export const SPACE_MD = 16;
export const SPACE_LG = 24;
export const SPACE_XL = 32;

// ─── Ring Geometry (PRD spec: 130×130px) ─────────────────────────────────────

export const RING_SIZE         = 130;   // PRD spec — hero rings diameter
export const RING_SIZE_MINI    = 32;    // Sticky nav mini-scoreboard
export const RING_STROKE       = 9;     // Ring stroke width
export const RING_STROKE_MINI  = 3;     // Mini ring stroke width
export const RING_GAP          = 5;     // Gap between concentric rings

// ─── Z-Index Layers ───────────────────────────────────────────────────────────

export const Z_BASE    = 0;
export const Z_CARD    = 1;
export const Z_MODAL   = 10;
export const Z_NAV     = 50;   // PRD spec: sticky nav Z-index 50
export const Z_TOAST   = 100;
