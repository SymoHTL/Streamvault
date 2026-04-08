import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.accessToken);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if setup is needed
    api.setup.status().then((s) => {
      if (s.isSetupRequired) navigate('/setup');
    }).catch(() => {});

    if (token) navigate('/');
  }, [navigate, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.login(username, password);
      setAuth(res.accessToken, res.refreshToken, res.user);
      navigate('/');
    } catch {
      setError(t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-8 text-primary">StreamVault</h1>
        <form onSubmit={handleSubmit} className="space-y-4 bg-surface-secondary dark:bg-surface-secondary-dark p-6 rounded-xl border border-border dark:border-border-dark">
          <h2 className="text-xl font-semibold text-text dark:text-text-dark">{t('auth.login')}</h2>

          {error && <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{error}</div>}

          <div>
            <label className="block text-sm font-medium mb-1 text-muted dark:text-muted-dark">{t('auth.username')}</label>
            <input
              type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark focus:ring-2 focus:ring-primary outline-none"
              required autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-muted dark:text-muted-dark">{t('auth.password')}</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark focus:ring-2 focus:ring-primary outline-none"
              required
            />
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? '...' : t('auth.loginButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
