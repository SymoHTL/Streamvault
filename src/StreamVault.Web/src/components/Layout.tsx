import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Home, Search, Settings, Shield, LogOut, Sun, Moon, Library } from 'lucide-react';

export default function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
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
      <aside className="w-60 shrink-0 border-r border-border dark:border-border-dark flex flex-col bg-surface-secondary dark:bg-surface-secondary-dark">
        <div className="p-4 border-b border-border dark:border-border-dark">
          <Link to="/" className="text-xl font-bold text-primary">{t('app.name')}</Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLink to="/" icon={<Home size={18} />} label={t('nav.home')} />
          <NavLink to="/search" icon={<Search size={18} />} label={t('nav.search')} />

          {libraries && libraries.length > 0 && (
            <div className="pt-3 pb-1 px-2 text-xs font-semibold uppercase text-muted dark:text-muted-dark">Libraries</div>
          )}
          {libraries?.map((lib) => (
            <NavLink key={lib.id} to={`/library/${lib.id}`} icon={<Library size={18} />} label={lib.name} />
          ))}

          <div className="pt-3 pb-1 px-2 text-xs font-semibold uppercase text-muted dark:text-muted-dark">Account</div>
          <NavLink to="/settings" icon={<Settings size={18} />} label={t('nav.settings')} />
          {user?.role === 'Admin' && (
            <NavLink to="/admin" icon={<Shield size={18} />} label={t('nav.admin')} />
          )}
        </nav>

        <div className="p-3 border-t border-border dark:border-border-dark space-y-2">
          <button onClick={toggle} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-border dark:hover:bg-border-dark text-text dark:text-text-dark transition-colors">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? 'Light' : 'Dark'} Mode
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-danger/10 text-danger transition-colors">
            <LogOut size={18} /> {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-border dark:hover:bg-border-dark text-text dark:text-text-dark transition-colors">
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
