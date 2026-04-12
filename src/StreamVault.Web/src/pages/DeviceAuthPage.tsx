import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/client';
import { Monitor, Check } from 'lucide-react';

export default function DeviceAuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get('code') ?? '';
  const { sessions, activeUserId, addSession } = useAuthStore();

  const [userCode, setUserCode] = useState(codeFromUrl);
  const [status, setStatus] = useState<'input' | 'confirm' | 'login' | 'success' | 'error'>('input');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Login form state (if not logged in)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const isLoggedIn = sessions.length > 0 && activeUserId;

  useEffect(() => {
    if (codeFromUrl && isLoggedIn) {
      setStatus('confirm');
    } else if (codeFromUrl && !isLoggedIn) {
      setStatus('login');
    }
  }, [codeFromUrl, isLoggedIn]);

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCode.trim()) return;
    if (isLoggedIn) {
      setStatus('confirm');
    } else {
      setStatus('login');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.login(username, password);
      addSession(res);
      setStatus('confirm');
    } catch {
      setError(t('auth.loginError', 'Invalid username or password'));
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = async () => {
    setLoading(true);
    setError('');
    try {
      await api.auth.deviceCode.authorize(userCode.toUpperCase());
      setStatus('success');
    } catch {
      setError(t('auth.deviceCodeInvalid', 'Invalid or expired code'));
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = () => {
    navigate('/');
  };

  // Success screen
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark px-4">
        <div className="text-center space-y-6 2xl:space-y-8">
          <div className="mx-auto w-16 h-16 2xl:w-24 2xl:h-24 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check size={32} className="2xl:!w-12 2xl:!h-12 text-green-500" />
          </div>
          <h1 className="text-2xl 2xl:text-4xl font-bold text-text dark:text-text-dark">
            {t('auth.deviceAuthorized', 'Device Authorized!')}
          </h1>
          <p className="text-muted dark:text-muted-dark text-base 2xl:text-xl">
            {t('auth.deviceAuthorizedDesc', 'You can now close this page. Your TV will sign in automatically.')}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 2xl:px-8 2xl:py-3 bg-primary hover:bg-primary-hover text-white rounded-lg text-base 2xl:text-lg transition-colors"
          >
            {t('common.done', 'Done')}
          </button>
        </div>
      </div>
    );
  }

  // Login form (user not signed in on phone)
  if (status === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark px-4">
        <div className="w-full max-w-sm 2xl:max-w-md">
          <div className="flex items-center justify-center gap-2 mb-6 2xl:mb-8 text-text dark:text-text-dark">
            <Monitor size={24} />
            <h1 className="text-2xl 2xl:text-3xl font-bold">{t('auth.authorizeDevice', 'Authorize Device')}</h1>
          </div>

          <div className="bg-surface-secondary dark:bg-surface-secondary-dark p-4 2xl:p-6 rounded-lg border border-border dark:border-border-dark mb-6 2xl:mb-8 text-center">
            <p className="text-sm 2xl:text-base text-muted dark:text-muted-dark">{t('auth.codeLabel', 'Device Code')}</p>
            <p className="text-2xl 2xl:text-3xl font-mono font-bold tracking-[0.3em] text-text dark:text-text-dark">{userCode.toUpperCase()}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 2xl:space-y-6 bg-surface-secondary dark:bg-surface-secondary-dark p-6 2xl:p-10 rounded-xl border border-border dark:border-border-dark">
            <p className="text-sm 2xl:text-base text-muted dark:text-muted-dark">
              {t('auth.loginToAuthorize', 'Sign in to authorize this device')}
            </p>

            {error && <div className="text-sm 2xl:text-base text-danger bg-danger/10 px-3 py-2 rounded-lg">{error}</div>}

            <div>
              <label className="block text-sm 2xl:text-base font-medium mb-1 text-muted dark:text-muted-dark">{t('auth.username')}</label>
              <input
                type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-base 2xl:text-lg focus:ring-2 focus:ring-primary outline-none"
                required autoFocus
              />
            </div>

            <div>
              <label className="block text-sm 2xl:text-base font-medium mb-1 text-muted dark:text-muted-dark">{t('auth.password')}</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-base 2xl:text-lg focus:ring-2 focus:ring-primary outline-none"
                required
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 2xl:py-4 bg-primary hover:bg-primary-hover text-white font-medium text-base 2xl:text-lg rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? '...' : t('auth.signInAndAuthorize', 'Sign In & Authorize')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Confirmation screen (user is logged in)
  if (status === 'confirm') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark px-4">
        <div className="w-full max-w-sm 2xl:max-w-md text-center">
          <div className="flex items-center justify-center gap-2 mb-6 2xl:mb-8 text-text dark:text-text-dark">
            <Monitor size={24} />
            <h1 className="text-2xl 2xl:text-3xl font-bold">{t('auth.authorizeDevice', 'Authorize Device')}</h1>
          </div>

          <div className="bg-surface-secondary dark:bg-surface-secondary-dark p-6 2xl:p-10 rounded-xl border border-border dark:border-border-dark space-y-6 2xl:space-y-8">
            <p className="text-base 2xl:text-lg text-text dark:text-text-dark">
              {t('auth.confirmDevice', 'Do you want to sign in on this device?')}
            </p>

            <div className="bg-surface dark:bg-surface-dark p-4 2xl:p-6 rounded-lg">
              <p className="text-sm 2xl:text-base text-muted dark:text-muted-dark mb-1">{t('auth.codeLabel', 'Device Code')}</p>
              <p className="text-2xl 2xl:text-3xl font-mono font-bold tracking-[0.3em] text-text dark:text-text-dark">{userCode.toUpperCase()}</p>
            </div>

            {error && <div className="text-sm 2xl:text-base text-danger bg-danger/10 px-3 py-2 rounded-lg">{error}</div>}

            <div className="flex gap-3 2xl:gap-4">
              <button
                onClick={handleDeny}
                className="flex-1 py-2.5 2xl:py-4 border border-border dark:border-border-dark rounded-lg text-text dark:text-text-dark text-base 2xl:text-lg hover:bg-border dark:hover:bg-border-dark transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleAuthorize}
                disabled={loading}
                className="flex-1 py-2.5 2xl:py-4 bg-primary hover:bg-primary-hover text-white font-medium text-base 2xl:text-lg rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? '...' : t('auth.authorize', 'Authorize')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Initial: enter code manually
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark px-4">
      <div className="w-full max-w-sm 2xl:max-w-md text-center">
        <div className="flex items-center justify-center gap-2 mb-6 2xl:mb-8 text-text dark:text-text-dark">
          <Monitor size={24} />
          <h1 className="text-2xl 2xl:text-3xl font-bold">{t('auth.authorizeDevice', 'Authorize Device')}</h1>
        </div>

        <form onSubmit={handleCodeSubmit} className="bg-surface-secondary dark:bg-surface-secondary-dark p-6 2xl:p-10 rounded-xl border border-border dark:border-border-dark space-y-4 2xl:space-y-6">
          <p className="text-base 2xl:text-lg text-muted dark:text-muted-dark">
            {t('auth.enterDeviceCode', 'Enter the code shown on your TV')}
          </p>

          <input
            type="text"
            value={userCode}
            onChange={(e) => setUserCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={6}
            className="w-full text-center text-3xl 2xl:text-4xl font-mono font-bold tracking-[0.3em] px-3 py-4 2xl:px-4 2xl:py-6 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark focus:ring-2 focus:ring-primary outline-none"
            placeholder="ABC123"
            autoFocus
          />

          <button
            type="submit"
            disabled={userCode.length < 6}
            className="w-full py-2.5 2xl:py-4 bg-primary hover:bg-primary-hover text-white font-medium text-base 2xl:text-lg rounded-lg transition-colors disabled:opacity-50"
          >
            {t('common.continue', 'Continue')}
          </button>
        </form>
      </div>
    </div>
  );
}
