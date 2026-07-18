'use client';

import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  role: 'THERAPIST' | 'CLIENT' | 'ADMIN' | null;
  profile: any;
}

export default function DashboardLayout({ children, role, profile }: DashboardLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <Sidebar
        role={role}
        profile={profile}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Content column — offset by the fixed sidebar only on desktop */}
      <div className="flex min-h-screen w-full flex-col lg:ml-[220px]">
        {/* Mobile top bar */}
        <header
          className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 lg:hidden"
          style={{
            background: 'var(--nav-bg, var(--glass-bg))',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="btn-press flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{ color: 'var(--ink)', background: 'var(--sage-light)', border: 'none' }}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img
            src="/assests/staad-logo-horizontal.svg"
            alt="STAAD"
            style={{ height: 34, width: 'auto', display: 'block' }}
          />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
