import { ProfileScreen } from '@/auth/ProfileScreen';
import { RequireSignIn } from '@/auth/RequireSignIn';

export default function Profile() {
  return (
    <RequireSignIn>
      <ProfileScreen />
    </RequireSignIn>
  );
}
