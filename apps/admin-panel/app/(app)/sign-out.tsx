'use client';

import { useRouter } from 'next/navigation';

export function SignOut() {
  const router = useRouter();
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }
  return (
    <button className="btn btn-ghost" onClick={signOut}>
      Sign out
    </button>
  );
}
