'use client';

import { LayoutDashboard, Building2, CalendarCheck, Users, LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { hasPermission } from '@schoolmate/shared';
import { NAV_ITEMS, type NavItem } from '@/lib/nav';
import type { SessionUser } from '@/lib/api';
import { cn } from '@/lib/cn';

const ICONS: Record<NavItem['icon'], typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  branches: Building2,
  students: Users,
  attendance: CalendarCheck,
  settings: Building2,
};

export function AppShell({
  session,
  children,
}: {
  session: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // PQC #5: only render nav the role can actually use.
  const visible = NAV_ITEMS.filter(
    (item) => item.permission === null || hasPermission(session.permissions, item.permission),
  );

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-card transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <span className="font-semibold text-brand">Schoolmate</span>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="space-y-1 px-3 py-2">
          {visible.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-brand text-brand-foreground' : 'hover:bg-muted',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-border bg-card px-4">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="flex flex-1 items-center justify-end gap-4">
            <span className="text-sm capitalize text-muted-foreground">
              {session.role.replace(/_/g, ' ')}
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-muted"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
