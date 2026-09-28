import { Redirect } from 'expo-router';

import { ScorerScreen } from '@/scorer/ScorerScreen';
import { useScorer } from '@/scorer/store';

export default function Score() {
  const match = useScorer((s) => s.match);
  if (!match) return <Redirect href="/" />;
  return <ScorerScreen match={match} />;
}
