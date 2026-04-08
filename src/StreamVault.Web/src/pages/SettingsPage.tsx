import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { Sun, Moon } from 'lucide-react';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { theme, toggle } = useThemeStore();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6 text-text dark:text-text-dark">{t('nav.settings')}</h1>

      {/* Profile */}
      <section className="mb-8 p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
        <h2 className="text-md font-semibold mb-3 text-text dark:text-text-dark">Profile</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted dark:text-muted-dark">Username</span>
            <span className="text-text dark:text-text-dark">{user?.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted dark:text-muted-dark">Email</span>
            <span className="text-text dark:text-text-dark">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted dark:text-muted-dark">Role</span>
            <span className="text-text dark:text-text-dark">{user?.role}</span>
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="mb-8 p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
        <h2 className="text-md font-semibold mb-3 text-text dark:text-text-dark">Appearance</h2>
        <button
          onClick={toggle}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border dark:border-border-dark hover:bg-border dark:hover:bg-border-dark transition-colors text-sm text-text dark:text-text-dark"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        </button>
      </section>
    </div>
  );
}
