import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/client';
import { Plus, Trash2 } from 'lucide-react';
import type { ProfileResponse } from '../types';

export default function ProfilePickerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profiles, setProfile, sessions, user, updateSessionProfiles } = useAuthStore();

  const [pinFor, setPinFor] = useState<ProfileResponse | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Create profile state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSelect = async (profile: ProfileResponse) => {
    if (profile.hasPin) {
      setPinFor(profile);
      setPin('');
      setError('');
      return;
    }
    await selectProfile(profile.id);
  };

  const selectProfile = async (profileId: string, pinCode?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.profiles.select(profileId, pinCode);
      const selected = res.profiles?.find(p => p.id === profileId) ?? res.profile;
      if (selected) {
        setProfile(selected, res.accessToken, res.refreshToken);
      }
      navigate('/');
    } catch {
      setError(t('profiles.wrongPin', 'Wrong PIN'));
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinFor) return;
    await selectProfile(pinFor.id, pin);
  };

  const handlePinDigit = (digit: string) => {
    if (pin.length < 6) {
      const next = pin + digit;
      setPin(next);
    }
  };

  const handlePinBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.profiles.create(newName, undefined, newPin || undefined);
      // Refresh profiles
      const updated = await api.profiles.list();
      updateSessionProfiles(updated);
      setShowCreate(false);
      setNewName('');
      setNewPin('');
    } catch {
      setError(t('profiles.createError', 'Failed to create profile'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.profiles.delete(id);
      const updated = await api.profiles.list();
      updateSessionProfiles(updated);
    } catch {
      setError(t('profiles.deleteError', 'Cannot delete this profile'));
    }
  };

  // PIN entry screen
  if (pinFor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface dark:bg-surface-dark px-4">
        <h1 className="text-2xl 2xl:text-4xl font-bold text-text dark:text-text-dark mb-2 2xl:mb-4">
          {pinFor.name}
        </h1>
        <p className="text-muted dark:text-muted-dark mb-8 2xl:mb-12 text-base 2xl:text-xl">
          {t('profiles.enterPin', 'Enter your PIN')}
        </p>

        {error && <div className="text-danger mb-4 text-sm 2xl:text-base">{error}</div>}

        {/* PIN dots */}
        <div className="flex gap-3 2xl:gap-4 mb-8 2xl:mb-12">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 2xl:w-6 2xl:h-6 rounded-full border-2 transition-colors ${
                i < pin.length
                  ? 'bg-primary border-primary'
                  : 'border-border dark:border-border-dark'
              }`}
            />
          ))}
        </div>

        {/* Number pad — TV-friendly large buttons */}
        <form onSubmit={handlePinSubmit}>
          <div className="grid grid-cols-3 gap-3 2xl:gap-4 mb-4 2xl:mb-6">
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => handlePinDigit(d)}
                className="w-16 h-16 2xl:w-24 2xl:h-24 rounded-xl text-2xl 2xl:text-4xl font-bold bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark border border-border dark:border-border-dark hover:bg-primary/20 focus:ring-2 focus:ring-primary transition-colors"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={handlePinBackspace}
              className="w-16 h-16 2xl:w-24 2xl:h-24 rounded-xl text-lg 2xl:text-2xl bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark border border-border dark:border-border-dark hover:bg-danger/20 transition-colors"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => handlePinDigit('0')}
              className="w-16 h-16 2xl:w-24 2xl:h-24 rounded-xl text-2xl 2xl:text-4xl font-bold bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark border border-border dark:border-border-dark hover:bg-primary/20 focus:ring-2 focus:ring-primary transition-colors"
            >
              0
            </button>
            <button
              type="submit"
              disabled={loading || pin.length === 0}
              className="w-16 h-16 2xl:w-24 2xl:h-24 rounded-xl text-lg 2xl:text-2xl font-bold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              ✓
            </button>
          </div>
        </form>

        <button
          onClick={() => setPinFor(null)}
          className="text-muted dark:text-muted-dark hover:text-text dark:hover:text-text-dark text-sm 2xl:text-base transition-colors"
        >
          {t('common.back', 'Back')}
        </button>
      </div>
    );
  }

  // Create profile modal
  if (showCreate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark px-4">
        <div className="w-full max-w-sm 2xl:max-w-md bg-surface-secondary dark:bg-surface-secondary-dark p-6 2xl:p-10 rounded-xl border border-border dark:border-border-dark">
          <h2 className="text-xl 2xl:text-2xl font-semibold text-text dark:text-text-dark mb-6 2xl:mb-8">
            {t('profiles.create', 'Create Profile')}
          </h2>
          <form onSubmit={handleCreate} className="space-y-4 2xl:space-y-6">
            <div>
              <label className="block text-sm 2xl:text-base font-medium mb-1 2xl:mb-2 text-muted dark:text-muted-dark">
                {t('profiles.name', 'Name')}
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-base 2xl:text-lg focus:ring-2 focus:ring-primary outline-none"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm 2xl:text-base font-medium mb-1 2xl:mb-2 text-muted dark:text-muted-dark">
                {t('profiles.pin', 'PIN (optional)')}
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 2xl:px-4 2xl:py-3 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-base 2xl:text-lg focus:ring-2 focus:ring-primary outline-none"
                placeholder="4-6 digits"
              />
            </div>
            <div className="flex gap-3 2xl:gap-4">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 2xl:py-4 border border-border dark:border-border-dark rounded-lg text-text dark:text-text-dark text-base 2xl:text-lg hover:bg-border dark:hover:bg-border-dark transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="flex-1 py-2.5 2xl:py-4 bg-primary hover:bg-primary-hover text-white font-medium text-base 2xl:text-lg rounded-lg transition-colors disabled:opacity-50"
              >
                {creating ? '...' : t('common.create', 'Create')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Profile picker grid
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface dark:bg-surface-dark px-4">
      <h1 className="text-3xl 2xl:text-5xl font-bold text-text dark:text-text-dark mb-2 2xl:mb-4">
        {t('profiles.whosWatching', "Who's watching?")}
      </h1>
      <p className="text-muted dark:text-muted-dark mb-10 2xl:mb-16 text-base 2xl:text-xl">
        {t('profiles.selectProfile', 'Select your profile')}
      </p>

      {error && <div className="text-danger mb-4 text-sm 2xl:text-base">{error}</div>}

      <div className="flex flex-wrap justify-center gap-6 2xl:gap-10 mb-10 2xl:mb-16">
        {profiles?.map((profile) => (
          <div key={profile.id} className="group relative">
            <button
              onClick={() => handleSelect(profile)}
              className="flex flex-col items-center gap-3 2xl:gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl p-3 2xl:p-4 hover:bg-surface-secondary dark:hover:bg-surface-secondary-dark transition-colors"
            >
              <div className="w-24 h-24 2xl:w-36 2xl:h-36 rounded-xl bg-primary/20 flex items-center justify-center text-3xl 2xl:text-5xl font-bold text-primary border-2 border-transparent group-hover:border-primary transition-colors overflow-hidden">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
                ) : (
                  profile.name.charAt(0).toUpperCase()
                )}
              </div>
              <span className="text-base 2xl:text-xl text-text dark:text-text-dark font-medium">
                {profile.name}
              </span>
              {profile.hasPin && (
                <span className="text-xs 2xl:text-sm text-muted dark:text-muted-dark">🔒</span>
              )}
            </button>
            {!profile.isDefault && (
              <button
                onClick={() => handleDelete(profile.id)}
                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1.5 rounded-full bg-danger/90 text-white hover:bg-danger transition-all"
                title={t('common.delete', 'Delete')}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}

        {/* Add profile button */}
        {(profiles?.length ?? 0) < 5 && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex flex-col items-center gap-3 2xl:gap-4 p-3 2xl:p-4 rounded-xl hover:bg-surface-secondary dark:hover:bg-surface-secondary-dark transition-colors"
          >
            <div className="w-24 h-24 2xl:w-36 2xl:h-36 rounded-xl border-2 border-dashed border-border dark:border-border-dark flex items-center justify-center hover:border-primary transition-colors">
              <Plus size={32} className="2xl:!w-12 2xl:!h-12 text-muted dark:text-muted-dark" />
            </div>
            <span className="text-base 2xl:text-xl text-muted dark:text-muted-dark">
              {t('profiles.addProfile', 'Add Profile')}
            </span>
          </button>
        )}
      </div>

      {sessions.length > 1 && (
        <button
          onClick={() => navigate('/accounts')}
          className="text-muted dark:text-muted-dark hover:text-text dark:hover:text-text-dark text-sm 2xl:text-base transition-colors"
        >
          {t('profiles.switchAccount', 'Switch Account')}
        </button>
      )}
      {user && (
        <p className="text-xs 2xl:text-sm text-muted dark:text-muted-dark mt-1">
          {user.username}
        </p>
      )}
    </div>
  );
}
