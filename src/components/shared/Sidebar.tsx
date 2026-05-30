'use client';

// =============================================================================
// Sidebar — Navigation Drawer with Role-Based Links
// =============================================================================
//
// Responsive sidebar that renders as a fixed sidebar on desktop (md+) and a
// slide-in drawer on mobile with an overlay backdrop.
//
// Navigation items are filtered by the user's role so each user type only
// sees the routes they have access to.
//
// Props:
//   userName   — Display name from the participantes table
//   userRole   — Role string (prestatario, aval, prestamista, admin)
//   userEmail  — Email from Supabase Auth (optional, for display)
// =============================================================================

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import ThemeToggle from '@/components/shared/ThemeToggle';
import type { RolParticipante } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SidebarProps {
  userName: string;
  userRole: string;
  userEmail?: string | null;
  children: ReactNode;
}

interface NavItemDef {
  label: string;
  /** Label shown to admin users (e.g. "Todos los Créditos" vs "Mis Créditos") */
  adminLabel?: string;
  href: string;
  icon: ReactNode;
  roles: RolParticipante[];
}

// ---------------------------------------------------------------------------
// Role display helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  prestatario: 'Prestatario',
  aval: 'Aval',
  prestamista: 'Prestamista',
  admin: 'Administrador',
};

const ROLE_COLORS: Record<string, string> = {
  prestatario: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  aval: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
  prestamista: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
  admin: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
};

// ---------------------------------------------------------------------------
// Inline SVG Icons (no external dependencies)
// ---------------------------------------------------------------------------

const Icons = {
  user: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  ),
  list: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  ),
  plus: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  money: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  shield: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  ),
  chart: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  ),
  hamburger: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  close: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Navigation definition
// ---------------------------------------------------------------------------

const NAV_SECTIONS: { title: string; items: NavItemDef[] }[] = [
  {
    title: 'Créditos',
    items: [
      { label: 'Mis Créditos', adminLabel: 'Todos los Créditos', href: '/mis-creditos', icon: Icons.list, roles: ['prestatario', 'admin'] },
      { label: 'Solicitar', href: '/solicitar', icon: Icons.plus, roles: ['prestatario'] },
      { label: 'Pagos', href: '/pagos', icon: Icons.money, roles: ['prestatario', 'admin'] },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { label: 'Panel de Aprobación', href: '/aprobacion', icon: Icons.shield, roles: ['admin'] },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Dashboard', href: '/admin/dashboard', icon: Icons.chart, roles: ['admin'] },
      { label: 'Participantes', href: '/admin/participantes', icon: Icons.user, roles: ['admin'] },
      { label: 'Créditos', href: '/admin/creditos', icon: Icons.list, roles: ['admin'] },
      { label: 'Desembolsos', href: '/admin/desembolsos', icon: Icons.money, roles: ['admin'] },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { label: 'Mi Perfil', href: '/perfil', icon: Icons.user, roles: ['prestatario', 'admin'] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sidebar Component
// ---------------------------------------------------------------------------

export default function Sidebar({ userName, userRole, userEmail, children }: SidebarProps) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const role = userRole as RolParticipante;
  const roleLabel = ROLE_LABELS[userRole] ?? userRole;
  const roleColor = ROLE_COLORS[userRole] ?? 'bg-gray-100 text-gray-700';

  const closeMobile = () => setIsMobileOpen(false);

  // Filter visible sections based on role
  const visibleSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  // Determine if a path is active (exact match or sub-path)
  const isActive = (href: string) => {
    if (href === '/aprobacion') {
      return pathname === '/aprobacion';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  const renderNavLink = (item: NavItemDef) => {
    const active = isActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeMobile}
        className={`
          group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
          transition-all duration-150
          ${
            active
              ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-l-4 border-blue-600 dark:border-blue-400 pl-[10px]'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 border-l-4 border-transparent pl-3'
          }
        `}
        aria-current={active ? 'page' : undefined}
      >
        <span className={`shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}>
          {item.icon}
        </span>
        <span>{role === 'admin' && item.adminLabel ? item.adminLabel : item.label}</span>
      </Link>
    );
  };

  // -----------------------------------------------------------------------
  // Sidebar content (shared between mobile drawer and desktop sidebar)
  // -----------------------------------------------------------------------

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Logo / Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700">
        <Link href="/" className="flex items-center gap-2.5" onClick={closeMobile}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">BlockChain</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Micro-Créditos</p>
          </div>
        </Link>
      </div>

      {/* User Info */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate text-center">{userName}</p>
        <div className="flex flex-col items-center gap-2 mt-1">
          {userEmail && (
            <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">{userEmail}</span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${roleColor}`}>
            {roleLabel}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Navegación principal">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(renderNavLink)}
            </div>
          </div>
        ))}
      </nav>

      {/* Theme Toggle */}
      <div className="px-3">
        <ThemeToggle />
      </div>

      {/* Logout */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-colors duration-150 border-l-4 border-transparent"
        >
          <span className="shrink-0 text-gray-400 dark:text-gray-500">{Icons.logout}</span>
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-1.5 -ml-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Abrir menú de navegación"
        >
          {Icons.hamburger}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">BlockChain</span>
        </div>
      </div>

      {/* ── Mobile drawer overlay ── */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`
          md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-gray-900 shadow-2xl
          transform transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-label="Menú de navegación"
      >
        {/* Close button */}
        <div className="absolute top-3 right-3">
          <button
            onClick={closeMobile}
            className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Cerrar menú"
          >
            {Icons.close}
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 md:bg-white dark:md:bg-gray-900 md:border-r md:border-gray-200 dark:md:border-gray-700"
        aria-label="Navegación principal"
      >
        {sidebarContent}
      </aside>

      {/* ── Main content area ── */}
      <main className="md:ml-64 pt-14 md:pt-0 min-h-screen bg-gray-50 dark:bg-gray-950">
        {children}
      </main>
    </>
  );
}
