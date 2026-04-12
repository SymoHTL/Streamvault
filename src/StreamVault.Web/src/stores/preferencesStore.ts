import { create } from 'zustand';
import { api } from '../api/client';
import type { ProfilePreferences } from '../types';

const DEFAULT_PREFS: ProfilePreferences = {
  language: null,
  audioLanguage: null,
  subtitleLanguage: null,
  maxBitrate: null,
  subtitleSize: 'medium',
  subtitleFont: null,
  subtitleColor: '#ffffff',
  subtitleBackground: 'rgba(0,0,0,0.75)',
};

interface PreferencesState extends ProfilePreferences {
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<ProfilePreferences>) => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...DEFAULT_PREFS,
  loaded: false,

  load: async () => {
    try {
      const prefs = await api.profiles.getPreferences();
      set({ ...DEFAULT_PREFS, ...prefs, loaded: true });
    } catch {
      set({ ...DEFAULT_PREFS, loaded: true });
    }
  },

  update: async (partial) => {
    const current = get();
    const merged: ProfilePreferences = {
      language: partial.language !== undefined ? partial.language : current.language,
      audioLanguage: partial.audioLanguage !== undefined ? partial.audioLanguage : current.audioLanguage,
      subtitleLanguage: partial.subtitleLanguage !== undefined ? partial.subtitleLanguage : current.subtitleLanguage,
      maxBitrate: partial.maxBitrate !== undefined ? partial.maxBitrate : current.maxBitrate,
      subtitleSize: partial.subtitleSize !== undefined ? partial.subtitleSize : current.subtitleSize,
      subtitleFont: partial.subtitleFont !== undefined ? partial.subtitleFont : current.subtitleFont,
      subtitleColor: partial.subtitleColor !== undefined ? partial.subtitleColor : current.subtitleColor,
      subtitleBackground: partial.subtitleBackground !== undefined ? partial.subtitleBackground : current.subtitleBackground,
    };
    set(merged);
    try {
      await api.profiles.updatePreferences(merged);
    } catch { /* ignore */ }
  },
}));
