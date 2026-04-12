import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { QRCodeSVG } from 'qrcode.react';
import { Tv, Keyboard } from 'lucide-react';
import type { DeviceCodeResponse } from '../types';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAddMode = searchParams.get('add') === 'true';
  const { addSession, sessions } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // QR Code state
  const [showQr, setShowQr] = useState(false);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [qrStatus, setQrStatus] = useState<'loading' | 'pending' | 'expired' | 'authorized'>('loading');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Check if setup is needed
    api.setup.status().then((s) => {
      if (s.isSetupRequired) navigate('/setup');
    }).catch(() => {});

    // If not adding a new account, redirect if already signed in
    if (!isAddMode && sessions.length > 0) {
      navigate(sessions.length === 1 ? '/profiles' : '/accounts');
    }
  }, [navigate, sessions.length, isAddMode]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.login(username, password);
      addSession(res);
      navigate('/profiles');
    } catch {
      setError(t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  const startQrLogin = useCallback(async () => {
    setShowQr(true);
    setQrStatus('loading');
    try {
      const dc = await api.auth.deviceCode.create();
      setDeviceCode(dc);
      setQrStatus('pending');

      // Start polling
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const result = await api.auth.deviceCode.poll(dc.deviceCode);
          if (result.status === 'authorized' && result.auth) {
            if (pollRef.current) clearInterval(pollRef.current);
            setQrStatus('authorized');
            addSession(result.auth);
            navigate('/profiles');
          } else if (result.status === 'expired' || result.status === 'denied') {
            if (pollRef.current) clearInterval(pollRef.current);
            setQrStatus('expired');
          }
        } catch {
          // Ignore poll errors, keep trying
        }
      }, (dc.pollInterval || 5) * 1000);
    } catch {
      setError(t('auth.qrError', 'Failed to generate QR code'));
      setShowQr(false);
    }
  }, [addSession, navigate, t]);

  const cancelQr = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setShowQr(false);
    setDeviceCode(null);
    setQrStatus('loading');
  };

  // QR Code view
  if (showQr) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark px-4">
        <div className="w-full max-w-sm 2xl:max-w-md text-center">
          <h1 className="text-3xl 2xl:text-4xl font-bold mb-8 2xl:mb-12 text-primary">StreamVault</h1>

          <div className="bg-surface-secondary dark:bg-surface-secondary-dark p-6 2xl:p-10 rounded-xl border border-border dark:border-border-dark space-y-6 2xl:space-y-8">
            <div className="flex items-center justify-center gap-2 text-text dark:text-text-dark">
              <Tv size={20} />
              <h2 className="text-xl 2xl:text-2xl font-semibold">{t('auth.scanQr', 'Scan to Sign In')}</h2>
            </div>

            {qrStatus === 'loading' && (
              <div className="text-muted dark:text-muted-dark py-12 2xl:py-16">{t('common.loading')}</div>
            )}

            {qrStatus === 'pending' && deviceCode && (
              <>
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg">
                    <QRCodeSVG value={deviceCode.qrUrl} size={200} level="M" />
                  </div>
                </div>
                <div>
                  <p className="text-sm 2xl:text-base text-muted dark:text-muted-dark mb-2">
                    {t('auth.orEnterCode', 'Or enter this code manually:')}
                  </p>
                  <p className="text-3xl 2xl:text-4xl font-mono font-bold tracking-[0.3em] text-text dark:text-text-dark">
                    {deviceCode.userCode}
                  </p>
                </div>
                <p className="text-xs 2xl:text-sm text-muted dark:text-muted-dark">
                  {t('auth.qrWaiting', 'Waiting for authorization...')}
                </p>
              </>
            )}

            {qrStatus === 'expired' && (
              <div className="py-8 2xl:py-12 space-y-4">
                <p className="text-danger">{t('auth.qrExpired', 'Code expired')}</p>
                <button
                  onClick={startQrLogin}
                  className="px-6 py-2 2xl:px-8 2xl:py-3 bg-primary hover:bg-primary-hover text-white rounded-lg text-base 2xl:text-lg transition-colors"
                >
                  {t('auth.tryAgain', 'Try Again')}
                </button>
              </div>
            )}

            <button
              onClick={cancelQr}
              className="text-sm 2xl:text-base text-muted dark:text-muted-dark hover:text-text dark:hover:text-text-dark transition-colors"
            >
              {t('auth.usePassword', 'Sign in with password instead')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard login form
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark px-4">
      <div className="w-full max-w-sm 2xl:max-w-md">
        <h1 className="text-3xl 2xl:text-4xl font-bold text-center mb-8 2xl:mb-12 text-primary">StreamVault</h1>
        <form onSubmit={handleSubmit} className="space-y-4 2xl:space-y-6 bg-surface-secondary dark:bg-surface-secondary-dark p-6 2xl:p-10 rounded-xl border border-border dark:border-border-dark">
          <h2 className="text-xl 2xl:text-2xl font-semibold text-text dark:text-text-dark">{t('auth.login')}</h2>

          {error && <div className="text-sm 2xl:text-base text-danger bg-danger/10 px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg">{error}</div>}

          <div>
            <label className="block text-sm 2xl:text-base font-medium mb-1 2xl:mb-2 text-muted dark:text-muted-dark">{t('auth.username')}</label>
            <input
              type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-base 2xl:text-lg focus:ring-2 focus:ring-primary outline-none"
              required autoFocus
            />
          </div>

          <div>
            <label className="block text-sm 2xl:text-base font-medium mb-1 2xl:mb-2 text-muted dark:text-muted-dark">{t('auth.password')}</label>
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
            {loading ? '...' : t('auth.loginButton')}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border dark:border-border-dark" />
            </div>
            <div className="relative flex justify-center text-xs 2xl:text-sm">
              <span className="px-2 bg-surface-secondary dark:bg-surface-secondary-dark text-muted dark:text-muted-dark">
                {t('auth.or', 'or')}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={startQrLogin}
            className="w-full flex items-center justify-center gap-2 py-2.5 2xl:py-4 border border-border dark:border-border-dark rounded-lg text-text dark:text-text-dark text-base 2xl:text-lg hover:bg-border dark:hover:bg-border-dark transition-colors"
          >
            <Tv size={18} />
            {t('auth.signInQr', 'Sign in with QR Code')}
          </button>
        </form>

        {isAddMode && sessions.length > 0 && (
          <button
            onClick={() => navigate('/accounts')}
            className="w-full mt-4 text-center text-sm 2xl:text-base text-muted dark:text-muted-dark hover:text-text dark:hover:text-text-dark transition-colors"
          >
            {t('common.back', 'Back')}
          </button>
        )}
      </div>
    </div>
  );
}
