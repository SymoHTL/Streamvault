import { create } from 'zustand';
import type { ProfileResponse, AccountSession, AuthResponse } from '../types';

interface AuthState {
  sessions: AccountSession[];
  activeUserId: string | null;
  profile: ProfileResponse | null;

  // Derived (recomputed on every set())
  accessToken: string | null;
  refreshToken: string | null;
  user: { id: string; username: string; email: string; role: string } | null;
  profiles: ProfileResponse[] | null;

  // Actions
  addSession: (auth: AuthResponse) => void;
  switchAccount: (userId: string) => void;
  removeAccount: (userId: string) => void;
  setProfile: (profile: ProfileResponse, accessToken?: string, refreshToken?: string) => void;
  updateActiveTokens: (accessToken: string, refreshToken: string) => void;
  updateSessionProfiles: (profiles: ProfileResponse[]) => void;
  logout: () => void;
  logoutAll: () => void;
}

function deriveFromSessions(sessions: AccountSession[], activeUserId: string | null) {
  const active = sessions.find(s => s.userId === activeUserId);
  return {
    accessToken: active?.accessToken ?? null,
    refreshToken: active?.refreshToken ?? null,
    user: active ? { id: active.userId, username: active.username, email: active.email ?? '', role: active.role } : null,
    profiles: active?.profiles ?? null,
  };
}

// Migrate legacy single-session localStorage to sessions array
function migrateFromLegacy(): { sessions: AccountSession[]; activeUserId: string | null; profile: ProfileResponse | null } {
  const existingSessions: AccountSession[] = JSON.parse(localStorage.getItem('sv_sessions') || '[]');
  const existingActive = localStorage.getItem('sv_activeUserId');
  const existingProfile: ProfileResponse | null = JSON.parse(localStorage.getItem('sv_profile') || 'null');

  if (existingSessions.length > 0) {
    return { sessions: existingSessions, activeUserId: existingActive, profile: existingProfile };
  }

  // Check for legacy single-session keys
  const token = localStorage.getItem('accessToken');
  const refresh = localStorage.getItem('refreshToken');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const profiles: ProfileResponse[] = JSON.parse(localStorage.getItem('profiles') || '[]');
  const profile: ProfileResponse | null = JSON.parse(localStorage.getItem('profile') || 'null');

  if (token && refresh && user) {
    const session: AccountSession = {
      userId: user.id,
      username: user.username,
      email: user.email ?? '',
      role: user.role,
      accessToken: token,
      refreshToken: refresh,
      profiles,
    };
    // Persist in new format
    localStorage.setItem('sv_sessions', JSON.stringify([session]));
    localStorage.setItem('sv_activeUserId', user.id);
    if (profile) localStorage.setItem('sv_profile', JSON.stringify(profile));
    // Clean legacy keys
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('profiles');
    localStorage.removeItem('profile');
    return { sessions: [session], activeUserId: user.id, profile };
  }

  return { sessions: [], activeUserId: null, profile: null };
}

function persistState(sessions: AccountSession[], activeUserId: string | null, profile: ProfileResponse | null) {
  localStorage.setItem('sv_sessions', JSON.stringify(sessions));
  if (activeUserId) localStorage.setItem('sv_activeUserId', activeUserId);
  else localStorage.removeItem('sv_activeUserId');
  if (profile) localStorage.setItem('sv_profile', JSON.stringify(profile));
  else localStorage.removeItem('sv_profile');

  // Keep active session tokens in top-level keys for client.ts compatibility
  const active = sessions.find(s => s.userId === activeUserId);
  if (active) {
    localStorage.setItem('accessToken', active.accessToken);
    localStorage.setItem('refreshToken', active.refreshToken);
  } else {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}

const initial = migrateFromLegacy();

export const useAuthStore = create<AuthState>()((set) => ({
  sessions: initial.sessions,
  activeUserId: initial.activeUserId,
  profile: initial.profile,
  ...deriveFromSessions(initial.sessions, initial.activeUserId),

  addSession: (auth) => {
    const session: AccountSession = {
      userId: auth.user.id,
      username: auth.user.username,
      email: auth.user.email,
      role: auth.user.role,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      profiles: auth.profiles ?? [],
    };
    set((state) => {
      const filtered = state.sessions.filter(s => s.userId !== session.userId);
      const sessions = [...filtered, session];
      const activeUserId = session.userId;
      persistState(sessions, activeUserId, null);
      return { sessions, activeUserId, profile: null, ...deriveFromSessions(sessions, activeUserId) };
    });
  },

  switchAccount: (userId) => {
    set((state) => {
      persistState(state.sessions, userId, null);
      return { activeUserId: userId, profile: null, ...deriveFromSessions(state.sessions, userId) };
    });
  },

  removeAccount: (userId) => {
    set((state) => {
      const sessions = state.sessions.filter(s => s.userId !== userId);
      const activeUserId = state.activeUserId === userId
        ? (sessions[0]?.userId ?? null)
        : state.activeUserId;
      const profile = state.activeUserId === userId ? null : state.profile;
      persistState(sessions, activeUserId, profile);
      return { sessions, activeUserId, profile, ...deriveFromSessions(sessions, activeUserId) };
    });
  },

  setProfile: (profile, accessToken, refreshToken) => {
    set((state) => {
      let sessions = state.sessions;
      if ((accessToken || refreshToken) && state.activeUserId) {
        sessions = sessions.map(s =>
          s.userId === state.activeUserId
            ? { ...s, ...(accessToken ? { accessToken } : {}), ...(refreshToken ? { refreshToken } : {}) }
            : s
        );
      }
      persistState(sessions, state.activeUserId, profile);
      return { sessions, profile, ...deriveFromSessions(sessions, state.activeUserId) };
    });
  },

  updateActiveTokens: (accessToken, refreshToken) => {
    set((state) => {
      const sessions = state.sessions.map(s =>
        s.userId === state.activeUserId
          ? { ...s, accessToken, refreshToken }
          : s
      );
      persistState(sessions, state.activeUserId, state.profile);
      return { sessions, ...deriveFromSessions(sessions, state.activeUserId) };
    });
  },

  updateSessionProfiles: (profiles) => {
    set((state) => {
      const sessions = state.sessions.map(s =>
        s.userId === state.activeUserId ? { ...s, profiles } : s
      );
      persistState(sessions, state.activeUserId, state.profile);
      return { sessions, ...deriveFromSessions(sessions, state.activeUserId) };
    });
  },

  logout: () => {
    set((state) => {
      const sessions = state.sessions.filter(s => s.userId !== state.activeUserId);
      const activeUserId = sessions[0]?.userId ?? null;
      persistState(sessions, activeUserId, null);
      return { sessions, activeUserId, profile: null, ...deriveFromSessions(sessions, activeUserId) };
    });
  },

  logoutAll: () => {
    localStorage.removeItem('sv_sessions');
    localStorage.removeItem('sv_activeUserId');
    localStorage.removeItem('sv_profile');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ sessions: [], activeUserId: null, profile: null, ...deriveFromSessions([], null) });
  },
}));
