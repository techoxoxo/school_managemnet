import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOut } from './sign-out';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header className="topbar">
        <Link href="/tenants" className="brand">
          Schoolmate · Platform
        </Link>
        <SignOut />
      </header>
      {children}
    </div>
  );
}
