'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import {
  Home,
  Users,
  Calendar,
  CalendarDays,
  Puzzle,
  User,
  ClipboardList,
  LifeBuoy,
  Shield,
  CreditCard,
  Receipt,
  Layers,
  Moon,
  Sun,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface SidebarProps {
  role: 'THERAPIST' | 'CLIENT' | 'ADMIN' | null;
  profile: any;
  /** Mobile drawer open state (ignored at lg+ where the sidebar is always shown). */
  mobileOpen?: boolean;
  /** Called when the mobile drawer should close (nav tap / backdrop). */
  onClose?: () => void;
}

const therapistNav = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/sessions', label: 'Sessions', icon: ClipboardList },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/modules', label: 'Modules', icon: Puzzle },
  { href: '/plans', label: 'Plans', icon: CreditCard },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/help', label: 'Help & Support', icon: LifeBuoy },
];

const clientNav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/my-sessions', label: 'My Sessions', icon: Calendar },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/help', label: 'Help & Support', icon: LifeBuoy },
];

const adminNav = [
  { href: '/admin', label: 'Professionals', icon: Users },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: Receipt },
  { href: '/admin/plans', label: 'Plans', icon: Layers },
  { href: '/admin/admins', label: 'Admins', icon: Shield },
  { href: '/help', label: 'Help & Support', icon: LifeBuoy },
];

export default function Sidebar({ role, profile, mobileOpen = false, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();

  const navItems = role === 'ADMIN' ? adminNav : role === 'THERAPIST' ? therapistNav : clientNav;

  const initials = profile
    ? `${(profile.firstName || '')[0] ?? ''}${(profile.lastName || '')[0] ?? ''}`.toUpperCase()
    : '';

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth');
  };

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 z-40 flex flex-col lg:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{
        width: collapsed ? '64px' : '220px',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(8px)',
        borderRight: '1px solid var(--glass-border)',
        transition:
          'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Header — Logo + Avatar */}
      <div
        className="flex flex-col items-center gap-3 pt-5 pb-4"
        style={{
          borderBottom: '1px solid var(--glass-border)',
          paddingLeft: collapsed ? '0' : '16px',
          paddingRight: collapsed ? '0' : '16px',
        }}
      >
        {collapsed ? (
          <img
            src="/assests/staad-emblem.svg"
            alt="STAAD"
            style={{ height: 42, width: 'auto', display: 'block' }}
          />
        ) : (
          <div className="flex w-full items-center justify-center">
            <img
              src="/assests/staad-logo-horizontal.svg"
              alt="STAAD"
              style={{ height: 60, width: 'auto', display: 'block' }}
            />
          </div>
        )}

        {profile && (
          <div className="flex flex-col items-center gap-1.5 w-full">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, var(--sage), var(--sage-mid))',
              }}
            >
              {initials || '?'}
            </div>
            {!collapsed && (
              <>
                <span
                  className="text-xs font-semibold truncate max-w-full text-center"
                  style={{ color: 'var(--ink)' }}
                >
                  {profile.firstName} {profile.lastName}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: 'var(--sage-light)',
                    color: 'var(--sage)',
                  }}
                >
                  {role === 'ADMIN' ? 'Admin' : role === 'THERAPIST' ? 'Therapist' : 'Client'}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={() => onClose?.()}
              className="group relative flex items-center rounded-[10px] cursor-pointer no-underline"
              style={{
                padding: collapsed ? '9px 0' : '9px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? '0' : '10px',
                fontSize: '13px',
                color: isActive ? 'var(--sage)' : 'var(--ink-muted)',
                fontWeight: isActive ? 500 : 400,
                background: isActive ? 'var(--sage-light)' : 'transparent',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--sage-light)';
                  e.currentTarget.style.opacity = '0.5';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.opacity = '1';
                }
              }}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {/* Tooltip on hover when collapsed */}
              {collapsed && (
                <span
                  className="pointer-events-none absolute left-full ml-2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 z-50"
                  style={{
                    background: 'var(--glass-strong)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--ink)',
                    transition: 'opacity 0.15s',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  {item.label}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="flex flex-col gap-1 px-2 py-3"
        style={{
          borderTop: '1px solid var(--glass-border)',
          alignItems: collapsed ? 'center' : 'stretch',
        }}
      >
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="btn-press flex items-center justify-center rounded-[10px] cursor-pointer"
          style={{
            padding: collapsed ? '9px 0' : '9px 12px',
            gap: collapsed ? '0' : '10px',
            fontSize: '13px',
            color: 'var(--ink-muted)',
            background: 'transparent',
            border: 'none',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sage-light)'; e.currentTarget.style.opacity = '0.5'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '1'; }}
        >
          {theme === 'light' ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
          {!collapsed && <span>Theme</span>}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="btn-press flex items-center justify-center rounded-[10px] cursor-pointer"
          style={{
            padding: collapsed ? '9px 0' : '9px 12px',
            gap: collapsed ? '0' : '10px',
            fontSize: '13px',
            color: 'var(--ink-muted)',
            background: 'transparent',
            border: 'none',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sage-light)'; e.currentTarget.style.opacity = '0.5'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '1'; }}
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && <span>Logout</span>}
        </button>

        {/* Collapse Toggle — desktop only (mobile uses the drawer) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="btn-press hidden lg:flex items-center justify-center rounded-[10px] cursor-pointer mt-1"
          style={{
            padding: collapsed ? '9px 0' : '9px 12px',
            gap: collapsed ? '0' : '10px',
            fontSize: '13px',
            color: 'var(--ink-muted)',
            background: 'transparent',
            border: 'none',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sage-light)'; e.currentTarget.style.opacity = '0.5'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '1'; }}
        >
          {collapsed ? <ChevronRight className="h-[18px] w-[18px]" /> : <ChevronLeft className="h-[18px] w-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
