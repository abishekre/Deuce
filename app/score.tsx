import { Redirect } from 'expo-router';

import { RequireSignIn } from '@/auth/RequireSignIn';
import { ScorerScreen } from '@/scorer/ScorerScreen';
import { useScorer } from '@/scorer/store';

export default function Score() {
  const match = useScorer((s) => s.match);

  return <RequireSignIn>{match ? <ScorerScreen match={match} /> : <Redirect href="/" />}</RequireSignIn>;
}
