import { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Home, Search, Settings, Shield, LogOut, Library, List, FolderOpen, UserCircle, Menu, X, Moon, Sun } from 'lucide-react';
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
    <div className="min-h-screen bg-surface text-text">
      <header className="prime-shell fixed top-0 inset-x-0 z-40 border-b border-white/5">
        <div className="h-16 2xl:h-20 px-4 md:px-8 2xl:px-12 flex items-center gap-5">
          <Link to="/" className="text-xl 2xl:text-3xl font-bold tracking-tight text-white">
            StreamVault
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm 2xl:text-base">
            <TopNavLink to="/" label={t('nav.home')} active={location.pathname === '/'} />
            <TopNavLink to="/search" label={t('nav.search')} active={location.pathname === '/search'} />
            <TopNavLink to="/lists" label={t('nav.lists', 'My Lists')} active={location.pathname === '/lists'} />
            <TopNavLink to="/collections" label={t('nav.collections')} active={location.pathname.startsWith('/collections')} />
            {libraries?.slice(0, 3).map((lib) => (
              <TopNavLink key={lib.id} to={`/library/${lib.id}`} label={lib.name} active={location.pathname === `/library/${lib.id}`} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user?.role === 'Admin' && (
              <IconButton title={t('nav.admin')} onClick={() => navigate('/admin')} active={location.pathname.startsWith('/admin')}>
                <Shield size={19} />
              </IconButton>
            )}
            <IconButton title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')} onClick={toggle}>
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </IconButton>
            <button
              onClick={() => navigate('/profiles')}
              className="hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 text-sm 2xl:text-base text-white/80 hover:bg-white/10 transition-colors"
            >
              <UserCircle size={20} />
              <span className="max-w-32 truncate">{profile?.name ?? user?.username}</span>
            </button>
            <IconButton title={t('nav.logout')} onClick={handleLogout}>
              <LogOut size={19} />
            </IconButton>
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="md:hidden p-2 rounded-full text-white/86 hover:bg-white/10"
              aria-label={t('nav.more', 'More')}
            >
              {moreOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      <main className="pt-16 2xl:pt-20 min-h-screen overflow-x-hidden">
        <div className="mx-auto max-w-[1920px] px-4 pb-24 md:px-8 md:pb-10 2xl:px-12">
          <Outlet />
        </div>
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 md:hidden bg-[#111a24]/95 backdrop-blur-xl border-t border-white/10">
        <MobileTab to="/" icon={<Home size={21} />} label={t('nav.home')} active={location.pathname === '/'} onClick={() => setMoreOpen(false)} />
        <MobileTab to="/search" icon={<Search size={21} />} label={t('nav.search')} active={location.pathname === '/search'} onClick={() => setMoreOpen(false)} />
        {firstLibId ? (
          <MobileTab to={`/library/${firstLibId}`} icon={<Library size={21} />} label={t('nav.libraries')} active={location.pathname.startsWith('/library')} onClick={() => setMoreOpen(false)} />
        ) : (
          <MobileTab to="/collections" icon={<FolderOpen size={21} />} label={t('nav.collections')} active={location.pathname.startsWith('/collections')} onClick={() => setMoreOpen(false)} />
        )}
        <MobileTab to="/lists" icon={<List size={21} />} label={t('nav.lists', 'Lists')} active={location.pathname === '/lists'} onClick={() => setMoreOpen(false)} />
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
            moreOpen ? 'text-primary' : 'text-white/60'
          }`}
        >
          {moreOpen ? <X size={21} /> : <Menu size={21} />}
          <span>{t('nav.more', 'More')}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/55" />
          <div
            className="absolute top-16 inset-x-3 rounded-lg glass-panel overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 space-y-0.5">
              {libraries?.map((lib) => (
                <MobileMenuItem key={lib.id} icon={<Library size={18} />} label={lib.name} onClick={() => { navigate(`/library/${lib.id}`); setMoreOpen(false); }} />
              ))}
              <MobileMenuItem icon={<FolderOpen size={18} />} label={t('nav.collections')} onClick={() => { navigate('/collections'); setMoreOpen(false); }} />
              <MobileMenuItem icon={<Settings size={18} />} label={t('nav.settings')} onClick={() => { navigate('/settings'); setMoreOpen(false); }} />
              {user?.role === 'Admin' && (
                <MobileMenuItem icon={<Shield size={18} />} label={t('nav.admin')} onClick={() => { navigate('/admin'); setMoreOpen(false); }} />
              )}
              <MobileMenuItem icon={<UserCircle size={18} />} label={profile?.name ?? user?.username ?? t('nav.profiles', 'Profiles')} onClick={() => { navigate('/profiles'); setMoreOpen(false); }} />
              <MobileMenuItem icon={theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} label={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')} onClick={() => { toggle(); setMoreOpen(false); }} />
              <div className="border-t border-white/10 my-1" />
              <MobileMenuItem icon={<LogOut size={18} />} label={t('nav.logout')} danger onClick={() => { handleLogout(); setMoreOpen(false); }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TopNavLink({ to, label, active }: { to: string; label: string; active?: boolean }) {
  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded-full transition-colors ${
        active ? 'text-white bg-white/15 font-semibold' : 'text-white/70 hover:text-white hover:bg-white/10'
      }`}
    >
      <span className="truncate max-w-36 inline-block align-bottom">{label}</span>
    </Link>
  );
}

function IconButton({ children, title, onClick, active }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-full transition-colors ${active ? 'text-primary bg-white/10' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
    >
      {children}
    </button>
  );
}

function MobileTab({ to, icon, label, active, onClick }: { to: string; icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
        active ? 'text-primary' : 'text-white/60'
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
          : 'text-white/80 hover:bg-white/10'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
