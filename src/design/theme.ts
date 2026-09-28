import { useColorScheme } from 'react-native';

import type { Side } from '@/rules';

/**
 * Side colours carry identity through every change of ends: side A stays
 * vermilion wherever it lands on screen, so the referee follows the players
 * rather than the half of the phone. Both hold white text above 4.5:1, and the
 * pair stays distinct under the common red-green colour-vision deficiencies.
 */
export const SIDE_COLOR: Record<Side, string> = {
  A: '#C4412A',
  B: '#2D6CDF',
};

const light = {
  background: '#F3F1EB',
  surface: '#FFFFFF',
  text: '#16181B',
  muted: '#5D626A',
  line: '#DDD9CF',
  /** Game point, match point, anything the umpire says out loud. */
  callout: '#F2C230',
  calloutText: '#16181B',
};

const dark: Theme = {
  background: '#0E1012',
  surface: '#1A1D21',
  text: '#F2F3F5',
  muted: '#9BA1A9',
  line: '#2B2F35',
  callout: '#F2C230',
  calloutText: '#16181B',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
