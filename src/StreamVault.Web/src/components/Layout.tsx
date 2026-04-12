import { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Home, Search, Settings, Shield, LogOut, Sun, Moon, Library, List, FolderOpen, UserCircle, Menu, X } from 'lucide-react';
import { useSpatialNav } from '../hooks/useSpatialNav';

export default function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, logout } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const { data: libraries } = useQuery({
    queryKey: ['libraries'],
    queryFn: api.libraries.list,
  });

  useSpatialNav();

  const handleLogout = () => {
    api.auth.logout().catch(() => {});
    logout();
    navigate('/login');
  };

  const firstLibId = libraries?.[0]?.id;

  return (
    <div className="flex h-screen bg-surface dark:bg-surface-dark">
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-56 2xl:w-72 shrink-0 border-r border-border dark:border-border-dark flex-col bg-surface-secondary dark:bg-surface-secondary-dark">
        <div className="p-4 2xl:p-6 border-b border-border dark:border-border-dark">
          <Link to="/" className="text-xl 2xl:text-2xl font-bold text-primary tracking-tight">StreamVault</Link>
        </div>

        <nav className="flex-1 p-2.5 2xl:p-4 space-y-0.5 2xl:space-y-1 overflow-y-auto">
          <NavLink to="/" icon={<Home size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.home')} active={location.pathname === '/'} />
          <NavLink to="/search" icon={<Search size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.search')} active={location.pathname === '/search'} />
          <NavLink to="/lists" icon={<List size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.lists', 'My Lists')} active={location.pathname === '/lists'} />
          <NavLink to="/collections" icon={<FolderOpen size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.collections')} active={location.pathname === '/collections'} />

          {libraries && libraries.length > 0 && (
            <div className="pt-4 pb-1 px-2.5 text-[11px] 2xl:text-sm font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{t('nav.libraries')}</div>
          )}
          {libraries?.map((lib) => (
            <NavLink key={lib.id} to={`/library/${lib.id}`} icon={<Library size={18} className="2xl:!w-6 2xl:!h-6" />} label={lib.name} active={location.pathname === `/library/${lib.id}`} />
          ))}

          <div className="pt-4 pb-1 px-2.5 text-[11px] 2xl:text-sm font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{t('nav.account')}</div>
          <NavLink to="/settings" icon={<Settings size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.settings')} active={location.pathname === '/settings'} />
          {user?.role === 'Admin' && (
            <NavLink to="/admin" icon={<Shield size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.admin')} active={location.pathname.startsWith('/admin')} />
          )}
        </nav>

        <div className="p-2.5 2xl:p-4 border-t border-border dark:border-border-dark space-y-1 2xl:space-y-2">
          <button
            onClick={() => navigate('/profiles')}
            className="flex items-center gap-2.5 2xl:gap-4 w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg text-sm 2xl:text-base hover:bg-border dark:hover:bg-border-dark text-text dark:text-text-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <UserCircle size={18} />
            <span className="truncate">{profile?.name ?? user?.username}</span>
          </button>
          <button onClick={toggle} className="flex items-center gap-2.5 2xl:gap-4 w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg text-sm 2xl:text-base hover:bg-border dark:hover:bg-border-dark text-text dark:text-text-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? t('common.lightMode') : t('common.darkMode')} {t('common.mode')}
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2.5 2xl:gap-4 w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg text-sm 2xl:text-base hover:bg-danger/10 text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <LogOut size={18} /> {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl 2xl:max-w-[1800px] mx-auto p-4 pb-20 md:p-6 md:pb-6 2xl:p-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-50 flex md:hidden bg-surface-secondary dark:bg-surface-secondary-dark border-t border-border dark:border-border-dark">
        <MobileTab to="/" icon={<Home size={22} />} label={t('nav.home')} active={location.pathname === '/'} onClick={() => setMoreOpen(false)} />
        <MobileTab to="/search" icon={<Search size={22} />} label={t('nav.search')} active={location.pathname === '/search'} onClick={() => setMoreOpen(false)} />
        {firstLibId ? (
          <MobileTab to={`/library/${firstLibId}`} icon={<Library size={22} />} label={t('nav.libraries')} active={location.pathname.startsWith('/library')} onClick={() => setMoreOpen(false)} />
        ) : (
          <MobileTab to="/collections" icon={<FolderOpen size={22} />} label={t('nav.collections')} active={location.pathname === '/collections'} onClick={() => setMoreOpen(false)} />
        )}
        <MobileTab to="/lists" icon={<List size={22} />} label={t('nav.lists', 'Lists')} active={location.pathname === '/lists'} onClick={() => setMoreOpen(false)} />
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
            moreOpen ? 'text-primary' : 'text-muted dark:text-muted-dark'
          }`}
        >
          {moreOpen ? <X size={22} /> : <Menu size={22} />}
          <span>{t('nav.more', 'More')}</span>
        </button>
      </nav>

      {/* Mobile "More" menu overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-16 inset-x-0 mx-2 mb-1 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 space-y-0.5">
              {firstLibId && (
                <MobileMenuItem icon={<FolderOpen size={18} />} label={t('nav.collections')} onClick={() => { navigate('/collections'); setMoreOpen(false); }} />
              )}
              {libraries && libraries.length > 1 && libraries.slice(1).map((lib) => (
                <MobileMenuItem key={lib.id} icon={<Library size={18} />} label={lib.name} onClick={() => { navigate(`/library/${lib.id}`); setMoreOpen(false); }} />
              ))}
              <MobileMenuItem icon={<Settings size={18} />} label={t('nav.settings')} onClick={() => { navigate('/settings'); setMoreOpen(false); }} />
              {user?.role === 'Admin' && (
                <MobileMenuItem icon={<Shield size={18} />} label={t('nav.admin')} onClick={() => { navigate('/admin'); setMoreOpen(false); }} />
              )}
              <MobileMenuItem icon={<UserCircle size={18} />} label={profile?.name ?? user?.username ?? t('nav.profiles', 'Profiles')} onClick={() => { navigate('/profiles'); setMoreOpen(false); }} />
              <MobileMenuItem icon={theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} label={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')} onClick={() => { toggle(); setMoreOpen(false); }} />
              <div className="border-t border-border dark:border-border-dark my-1" />
              <MobileMenuItem icon={<LogOut size={18} />} label={t('nav.logout')} danger onClick={() => { handleLogout(); setMoreOpen(false); }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 2xl:gap-4 px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg text-sm 2xl:text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function MobileTab({ to, icon, label, active, onClick }: { to: string; icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
        active ? 'text-primary' : 'text-muted dark:text-muted-dark'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function MobileMenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm transition-colors ${
        danger
          ? 'text-danger hover:bg-danger/10'
          : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
