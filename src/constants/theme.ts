import '@/global.css';

import { Platform } from 'react-native';

// Semantic accent colors — one token per meaning (positive/negative/gold),
// reused everywhere instead of ad-hoc hex values. Before this, "loss red"
// alone existed as five near-identical hex values scattered across screens
// (#C94040, #C04040, #B83232, #E05252...) — same intent, no shared source of
// truth. Hues were chosen to sit comfortably with the warm cream background
// and the brand green: brick red (~hue 0°) and gold (~hue 42°) both read as
// warm-neutral-compatible, unlike a colder red or blue would.
export const Colors = {
  light: {
    text: '#1A1A14',
    background: '#F5F0E8',
    backgroundElement: '#EDE8DE',
    backgroundSelected: '#D8D2C4',
    textSecondary: '#9A9080',
    tint: '#1B4332',
    tintText: '#D4EDDA',

    negative: '#C94040',        // losses, destructive actions, declining trend
    negativeSoft: '#FCE8E8',    // badge/chip background
    negativeStrong: '#B83232',  // text/icon on negativeSoft, or extra emphasis
    negativeOnDark: '#FF8A8A',  // negative text/lines on a dark or tint background

    gold: '#C9A84C',            // tournaments, in-progress states, highlights
    goldSoft: '#F3E8C9',        // badge/chip background
    goldStrong: '#8A6A00',      // text/icon on goldSoft

    positiveSoft: '#E6F4EC',    // badge/chip background (pairs with tint)
    positiveOnDark: '#6FCF97',  // positive text/lines on a dark or tint background
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    tint: '#2ECC71',
    tintText: '#003018',

    negative: '#FF6B6B',
    negativeSoft: '#3A1616',
    negativeStrong: '#FF8A8A',
    negativeOnDark: '#FF9B9B',

    gold: '#E0BC6B',
    goldSoft: '#3A2E12',
    goldStrong: '#E0BC6B',

    positiveSoft: '#0E2A1B',
    positiveOnDark: '#6FE0A0',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
