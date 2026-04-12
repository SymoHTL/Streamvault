import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/client';
import { Plus, X } from 'lucide-react';

export default function AccountPickerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessions, switchAccount, removeAccount, logoutAll } = useAuthStore();

  const handleSelect = (userId: string) => {
    switchAccount(userId);
    navigate('/profiles');
  };

  const handleRemove = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    // Logout the session on the server
    const session = sessions.find(s => s.userId === userId);
    if (session) {
      const origToken = localStorage.getItem('accessToken');
      const origRefresh = localStorage.getItem('refreshToken');
      localStorage.setItem('accessToken', session.accessToken);
      localStorage.setItem('refreshToken', session.refreshToken);
      api.auth.logout().catch(() => {});
      if (origToken) localStorage.setItem('accessToken', origToken);
      if (origRefresh) localStorage.setItem('refreshToken', origRefresh);
    }
    removeAccount(userId);
    if (sessions.length <= 1) {
      navigate('/login');
    }
  };

  const handleLogoutAll = () => {
    sessions.forEach(s => {
      localStorage.setItem('refreshToken', s.refreshToken);
      api.auth.logout().catch(() => {});
    });
    logoutAll();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface dark:bg-surface-dark px-4">
      <h1 className="text-3xl 2xl:text-5xl font-bold text-text dark:text-text-dark mb-2 2xl:mb-4">
        {t('accounts.selectAccount', 'Select Account')}
      </h1>
      <p className="text-muted dark:text-muted-dark mb-10 2xl:mb-16 text-base 2xl:text-xl">
        {t('accounts.chooseAccount', 'Choose an account to continue')}
      </p>

      <div className="flex flex-wrap justify-center gap-6 2xl:gap-10 mb-10 2xl:mb-16">
        {sessions.map((session) => (
          <div key={session.userId} className="group relative">
            <button
              onClick={() => handleSelect(session.userId)}
              className="flex flex-col items-center gap-3 2xl:gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl p-3 2xl:p-4 hover:bg-surface-secondary dark:hover:bg-surface-secondary-dark transition-colors"
            >
              <div className="w-24 h-24 2xl:w-36 2xl:h-36 rounded-xl bg-primary/20 flex items-center justify-center text-3xl 2xl:text-5xl font-bold text-primary border-2 border-transparent group-hover:border-primary transition-colors">
                {session.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-base 2xl:text-xl text-text dark:text-text-dark font-medium">
                {session.username}
              </span>
              {session.role === 'Admin' && (
                <span className="text-xs 2xl:text-sm px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                  Admin
                </span>
              )}
            </button>
            <button
              onClick={(e) => handleRemove(e, session.userId)}
              className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1.5 rounded-full bg-danger/90 text-white hover:bg-danger transition-all"
              title={t('accounts.removeAccount', 'Remove Account')}
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {/* Add account button */}
        <button
          onClick={() => navigate('/login?add=true')}
          className="flex flex-col items-center gap-3 2xl:gap-4 p-3 2xl:p-4 rounded-xl hover:bg-surface-secondary dark:hover:bg-surface-secondary-dark transition-colors"
        >
          <div className="w-24 h-24 2xl:w-36 2xl:h-36 rounded-xl border-2 border-dashed border-border dark:border-border-dark flex items-center justify-center hover:border-primary transition-colors">
            <Plus size={32} className="2xl:!w-12 2xl:!h-12 text-muted dark:text-muted-dark" />
          </div>
          <span className="text-base 2xl:text-xl text-muted dark:text-muted-dark">
            {t('accounts.addAccount', 'Add Account')}
          </span>
        </button>
      </div>

      <button
        onClick={handleLogoutAll}
        className="text-danger hover:text-danger/80 text-sm 2xl:text-base transition-colors"
      >
        {t('accounts.logoutAll', 'Log Out All Accounts')}
      </button>
    </div>
  );
}
