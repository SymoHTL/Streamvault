import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { Sun, Moon } from 'lucide-react';
import { useEffect } from 'react';
import i18n from '../i18n';

const LANGUAGES = [
  { code: '', labelKey: 'settings.systemDefault' },
  { code: 'eng', labelKey: 'lang.eng' },
  { code: 'deu', labelKey: 'lang.deu' },
  { code: 'fra', labelKey: 'lang.fra' },
  { code: 'spa', labelKey: 'lang.spa' },
  { code: 'ita', labelKey: 'lang.ita' },
  { code: 'por', labelKey: 'lang.por' },
  { code: 'rus', labelKey: 'lang.rus' },
  { code: 'jpn', labelKey: 'lang.jpn' },
  { code: 'kor', labelKey: 'lang.kor' },
  { code: 'zho', labelKey: 'lang.zho' },
  { code: 'hin', labelKey: 'lang.hin' },
  { code: 'ara', labelKey: 'lang.ara' },
  { code: 'tur', labelKey: 'lang.tur' },
  { code: 'pol', labelKey: 'lang.pol' },
  { code: 'nld', labelKey: 'lang.nld' },
  { code: 'swe', labelKey: 'lang.swe' },
];

const BITRATE_OPTIONS = [
  { value: 0, labelKey: 'bitrateOptions.auto' },
  { value: 8000, labelKey: 'bitrateOptions.1080p' },
  { value: 4000, labelKey: 'bitrateOptions.720p' },
  { value: 2000, labelKey: 'bitrateOptions.480p' },
  { value: 1000, labelKey: 'bitrateOptions.360p' },
];

const SUBTITLE_SIZES = [
  { value: 'small', labelKey: 'subtitleSizes.small' },
  { value: 'medium', labelKey: 'subtitleSizes.medium' },
  { value: 'large', labelKey: 'subtitleSizes.large' },
  { value: 'xlarge', labelKey: 'subtitleSizes.xlarge' },
];

const SUBTITLE_COLORS = [
  { value: '#ffffff', labelKey: 'subtitleColors.white' },
  { value: '#ffff00', labelKey: 'subtitleColors.yellow' },
  { value: '#00ff00', labelKey: 'subtitleColors.green' },
  { value: '#00ffff', labelKey: 'subtitleColors.cyan' },
];

const SUBTITLE_BACKGROUNDS = [
  { value: 'rgba(0,0,0,0.75)', labelKey: 'subtitleBackgrounds.semiTransparent' },
  { value: 'rgba(0,0,0,1)', labelKey: 'subtitleBackgrounds.solidBlack' },
  { value: 'transparent', labelKey: 'subtitleBackgrounds.none' },
];

const selectClass = 'w-full px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-sm focus:outline-none focus:ring-2 focus:ring-primary';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { theme, toggle } = useThemeStore();
  const user = useAuthStore((s) => s.user);
  const prefs = usePreferencesStore();

  useEffect(() => {
    if (!prefs.loaded) prefs.load();
  }, []);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6 text-text dark:text-text-dark">{t('nav.settings')}</h1>

      {/* Profile */}
      <section className="mb-6 p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
        <h2 className="text-md font-semibold mb-3 text-text dark:text-text-dark">{t('settings.profile')}</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted dark:text-muted-dark">{t('settings.username')}</span>
            <span className="text-text dark:text-text-dark">{user?.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted dark:text-muted-dark">{t('settings.email')}</span>
            <span className="text-text dark:text-text-dark">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted dark:text-muted-dark">{t('settings.role')}</span>
            <span className="text-text dark:text-text-dark">{user?.role}</span>
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="mb-6 p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
        <h2 className="text-md font-semibold mb-3 text-text dark:text-text-dark">{t('settings.appearance')}</h2>
        <button
          onClick={toggle}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border dark:border-border-dark hover:bg-border dark:hover:bg-border-dark transition-colors text-sm text-text dark:text-text-dark"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? t('settings.switchToLight') : t('settings.switchToDark')}
        </button>
      </section>

      {/* Language */}
      <section className="mb-6 p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
        <h2 className="text-md font-semibold mb-3 text-text dark:text-text-dark">{t('settings.language')}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-muted dark:text-muted-dark mb-1">{t('settings.uiLanguage')}</label>
            <select
              value={i18n.language}
              onChange={(e) => { i18n.changeLanguage(e.target.value); localStorage.setItem('ui-language', e.target.value); }}
              className={selectClass}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted dark:text-muted-dark mb-1">{t('settings.preferredAudio')}</label>
            <select
              value={prefs.audioLanguage || ''}
              onChange={(e) => prefs.update({ audioLanguage: e.target.value || null })}
              className={selectClass}
            >
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{t(l.labelKey)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted dark:text-muted-dark mb-1">{t('settings.preferredSubtitle')}</label>
            <select
              value={prefs.subtitleLanguage || ''}
              onChange={(e) => prefs.update({ subtitleLanguage: e.target.value || null })}
              className={selectClass}
            >
              <option value="">{t('media.off')}</option>
              {LANGUAGES.filter(l => l.code).map((l) => <option key={l.code} value={l.code}>{t(l.labelKey)}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Playback */}
      <section className="mb-6 p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
        <h2 className="text-md font-semibold mb-3 text-text dark:text-text-dark">{t('settings.playback')}</h2>
        <div>
          <label className="block text-sm text-muted dark:text-muted-dark mb-1">{t('settings.maxQuality')}</label>
          <select
            value={prefs.maxBitrate ?? 0}
            onChange={(e) => prefs.update({ maxBitrate: Number(e.target.value) || null })}
            className={selectClass}
          >
            {BITRATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
          </select>
          <p className="text-xs text-muted dark:text-muted-dark mt-1">
            {t('settings.maxQualityHint')}
          </p>
        </div>
      </section>

      {/* Subtitle Appearance */}
      <section className="mb-6 p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
        <h2 className="text-md font-semibold mb-3 text-text dark:text-text-dark">{t('settings.subtitleAppearance')}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-muted dark:text-muted-dark mb-1">{t('settings.subtitleSize')}</label>
            <select
              value={prefs.subtitleSize || 'medium'}
              onChange={(e) => prefs.update({ subtitleSize: e.target.value })}
              className={selectClass}
            >
              {SUBTITLE_SIZES.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted dark:text-muted-dark mb-1">{t('settings.subtitleColor')}</label>
            <select
              value={prefs.subtitleColor || '#ffffff'}
              onChange={(e) => prefs.update({ subtitleColor: e.target.value })}
              className={selectClass}
            >
              {SUBTITLE_COLORS.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted dark:text-muted-dark mb-1">{t('settings.subtitleBackground')}</label>
            <select
              value={prefs.subtitleBackground || 'rgba(0,0,0,0.75)'}
              onChange={(e) => prefs.update({ subtitleBackground: e.target.value })}
              className={selectClass}
            >
              {SUBTITLE_BACKGROUNDS.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
            </select>
          </div>
        </div>

        {/* Subtitle Preview */}
        <div className="mt-4 p-4 rounded-lg bg-black flex items-center justify-center">
          <span
            style={{
              fontSize: prefs.subtitleSize === 'small' ? '14px' : prefs.subtitleSize === 'large' ? '22px' : prefs.subtitleSize === 'xlarge' ? '28px' : '18px',
              color: prefs.subtitleColor || '#ffffff',
              backgroundColor: prefs.subtitleBackground || 'rgba(0,0,0,0.75)',
              padding: '4px 12px',
              borderRadius: '4px',
              fontFamily: prefs.subtitleFont || 'inherit',
            }}
          >
            {t('settings.subtitlePreview')}
          </span>
        </div>
      </section>
    </div>
  );
}
