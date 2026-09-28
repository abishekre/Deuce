import { Redirect } from 'expo-router';

import { SetupScreen } from '@/scorer/SetupScreen';
import { useScorer } from '@/scorer/store';

/**
 * The route follows the stored match rather than a navigation call, so a
 * referee reopening the app mid-game lands on the scorer, not on setup.
 */
export default function Index() {
  const match = useScorer((s) => s.match);
  if (match) return <Redirect href="/score" />;
  return <SetupScreen />;
}
