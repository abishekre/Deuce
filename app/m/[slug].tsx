import { useLocalSearchParams } from 'expo-router';

import { LiveScreen } from '@/live/LiveScreen';

/** A spectator link: /m/K7QX2P9MAB. No account, no install, nothing to tap. */
export default function LiveRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <LiveScreen slug={slug ?? ''} />;
}
