import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export default function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    adminUsername: '',
    adminEmail: '',
    adminPassword: '',
    s3Name: '',
    s3Endpoint: '',
    s3Bucket: '',
    s3AccessKey: '',
    s3SecretKey: '',
    s3Region: 'us-east-1',
    s3ForcePathStyle: true,
    libraryName: '',
    libraryType: 'Movie',
    tmdbApiKey: '',
  });

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleComplete = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.setup.complete({
        adminUsername: form.adminUsername,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        s3Connection: {
          name: form.s3Name,
          endpoint: form.s3Endpoint,
          bucket: form.s3Bucket,
          accessKey: form.s3AccessKey,
          secretKey: form.s3SecretKey,
          region: form.s3Region,
          forcePathStyle: form.s3ForcePathStyle,
        },
        initialLibrary: {
          name: form.libraryName,
          type: form.libraryType,
          s3ConnectionId: '00000000-0000-0000-0000-000000000000', // will be set server-side
          s3Prefix: '',
        },
        tmdbApiKey: form.tmdbApiKey || null,
      });
      setAuth(res.accessToken, res.refreshToken, res.user);
      navigate('/');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    // Step 0: Admin account
    <div key="admin" className="space-y-4">
      <h3 className="text-lg font-semibold text-text dark:text-text-dark">{t('setup.adminAccount')}</h3>
      <Input label="Username" value={form.adminUsername} onChange={(v) => update('adminUsername', v)} />
      <Input label="Email" type="email" value={form.adminEmail} onChange={(v) => update('adminEmail', v)} />
      <Input label="Password" type="password" value={form.adminPassword} onChange={(v) => update('adminPassword', v)} />
    </div>,
    // Step 1: S3 connection
    <div key="s3" className="space-y-4">
      <h3 className="text-lg font-semibold text-text dark:text-text-dark">{t('setup.s3Connection')}</h3>
      <Input label="Connection Name" value={form.s3Name} onChange={(v) => update('s3Name', v)} placeholder="My S3" />
      <Input label="Endpoint" value={form.s3Endpoint} onChange={(v) => update('s3Endpoint', v)} placeholder="https://s3.amazonaws.com" />
      <Input label="Bucket" value={form.s3Bucket} onChange={(v) => update('s3Bucket', v)} />
      <Input label="Access Key" value={form.s3AccessKey} onChange={(v) => update('s3AccessKey', v)} />
      <Input label="Secret Key" type="password" value={form.s3SecretKey} onChange={(v) => update('s3SecretKey', v)} />
      <Input label="Region" value={form.s3Region} onChange={(v) => update('s3Region', v)} />
      <label className="flex items-center gap-2 text-sm text-text dark:text-text-dark">
        <input type="checkbox" checked={form.s3ForcePathStyle} onChange={(e) => update('s3ForcePathStyle', e.target.checked)} />
        Force Path Style
      </label>
    </div>,
    // Step 2: Library
    <div key="library" className="space-y-4">
      <h3 className="text-lg font-semibold text-text dark:text-text-dark">{t('setup.library')}</h3>
      <Input label="Library Name" value={form.libraryName} onChange={(v) => update('libraryName', v)} placeholder="Movies" />
      <div>
        <label className="block text-sm font-medium mb-1 text-muted dark:text-muted-dark">Type</label>
        <select
          value={form.libraryType}
          onChange={(e) => update('libraryType', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark"
        >
          <option value="Movie">Movies</option>
          <option value="TvShow">TV Shows</option>
        </select>
      </div>
      <Input label="TMDB API Key (optional)" value={form.tmdbApiKey} onChange={(v) => update('tmdbApiKey', v)} />
    </div>,
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark px-4">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-bold text-center mb-2 text-primary">StreamVault</h1>
        <p className="text-center text-muted dark:text-muted-dark mb-8">{t('setup.subtitle')}</p>

        <div className="bg-surface-secondary dark:bg-surface-secondary-dark p-6 rounded-xl border border-border dark:border-border-dark">
          {/* Step indicators */}
          <div className="flex gap-2 mb-6">
            {steps.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-border dark:bg-border-dark'}`} />
            ))}
          </div>

          {error && <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg mb-4">{error}</div>}

          {steps[step]}

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-text dark:hover:text-text-dark disabled:opacity-30"
            >
              Back
            </button>
            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={loading}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? '...' : t('setup.complete')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-muted dark:text-muted-dark">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark focus:ring-2 focus:ring-primary outline-none"
      />
    </div>
  );
}
