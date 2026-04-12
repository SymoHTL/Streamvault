import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Home, Search, Settings, Shield, LogOut, Sun, Moon, Library, List, FolderOpen, UserCircle } from 'lucide-react';

export default function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, logout } = useAuthStore();
  const { theme, toggle } = useThemeStore();

  const { data: libraries } = useQuery({
    queryKey: ['libraries'],
    queryFn: api.libraries.list,
  });

  const handleLogout = () => {
    api.auth.logout().catch(() => {});
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-surface dark:bg-surface-dark">
      {/* Sidebar */}
      <aside className="w-56 2xl:w-72 shrink-0 border-r border-border dark:border-border-dark flex flex-col bg-surface-secondary dark:bg-surface-secondary-dark">
        <div className="p-4 2xl:p-6 border-b border-border dark:border-border-dark">
          <Link to="/" className="text-xl 2xl:text-2xl font-bold text-primary tracking-tight">StreamVault</Link>
        </div>

        <nav className="flex-1 p-2.5 2xl:p-4 space-y-0.5 2xl:space-y-1 overflow-y-auto">
          <NavLink to="/" icon={<Home size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.home')} active={location.pathname === '/'} />
          <NavLink to="/search" icon={<Search size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.search')} active={location.pathname === '/search'} />
          <NavLink to="/lists" icon={<List size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.lists', 'My Lists')} active={location.pathname === '/lists'} />
          <NavLink to="/collections" icon={<FolderOpen size={18} className="2xl:!w-6 2xl:!h-6" />} label="Collections" active={location.pathname === '/collections'} />

          {libraries && libraries.length > 0 && (
            <div className="pt-4 pb-1 px-2.5 text-[11px] 2xl:text-sm font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Libraries</div>
          )}
          {libraries?.map((lib) => (
            <NavLink key={lib.id} to={`/library/${lib.id}`} icon={<Library size={18} className="2xl:!w-6 2xl:!h-6" />} label={lib.name} active={location.pathname === `/library/${lib.id}`} />
          ))}

          <div className="pt-4 pb-1 px-2.5 text-[11px] 2xl:text-sm font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Account</div>
          <NavLink to="/settings" icon={<Settings size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.settings')} active={location.pathname === '/settings'} />
          {user?.role === 'Admin' && (
            <NavLink to="/admin" icon={<Shield size={18} className="2xl:!w-6 2xl:!h-6" />} label={t('nav.admin')} active={location.pathname.startsWith('/admin')} />
          )}
        </nav>

        <div className="p-2.5 2xl:p-4 border-t border-border dark:border-border-dark space-y-1 2xl:space-y-2">
          <button
            onClick={() => navigate('/profiles')}
            className="flex items-center gap-2.5 2xl:gap-4 w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg text-sm 2xl:text-base hover:bg-border dark:hover:bg-border-dark text-text dark:text-text-dark transition-colors"
          >
            <UserCircle size={18} />
            <span className="truncate">{profile?.name ?? user?.username}</span>
          </button>
          <button onClick={toggle} className="flex items-center gap-2.5 2xl:gap-4 w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg text-sm 2xl:text-base hover:bg-border dark:hover:bg-border-dark text-text dark:text-text-dark transition-colors">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? 'Light' : 'Dark'} Mode
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2.5 2xl:gap-4 w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg text-sm 2xl:text-base hover:bg-danger/10 text-danger transition-colors">
            <LogOut size={18} /> {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl 2xl:max-w-[1800px] mx-auto p-6 2xl:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavLink({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 2xl:gap-4 px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg text-sm 2xl:text-base transition-colors ${
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
