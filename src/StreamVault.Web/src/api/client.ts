import type {
  AuthResponse,
  SetupStatusResponse,
  HomeResponse,
  LibraryResponse,
  MediaItemResponse,
  TvShowDetailResponse,
  SearchResponse,
  PaginatedResponse,
  MediaItemSummaryResponse,
  DashboardResponse,
  S3ConnectionResponse,
  UserResponse,
  WatchlistResponse,
  UserMediaListDetailResponse,
  UserMediaListResponse,
  CollectionResponse,
  CollectionDetailResponse,
  AudioTrackInfo,
  WatchProgressResponse,
  ProfileResponse,
  DeviceCodeResponse,
  DeviceCodePollResponse,
  ProfilePreferences,
  ChapterResponse,
  SubtitleResponse,
  EpisodeContextResponse,
} from '../types';

const BASE = '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // If a refresh is already in flight, wait for it before sending the request.
  // Without this, multiple concurrent calls during a refresh window can each ride
  // a stale token, hit 401, and stampede the refresh endpoint in parallel.
  if (pendingRefresh) {
    try { await pendingRefresh; } catch { /* fall through; the request will 401 if needed */ }
  }
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;
      const retry = await fetch(`${BASE}${path}`, { ...options, headers });
      if (!retry.ok) throw new ApiError(retry.status, await retry.text());
      return hasNoBody(retry) ? (undefined as T) : retry.json();
    }
    // Remove failed session from sessions array
    const sessions = JSON.parse(localStorage.getItem('sv_sessions') || '[]');
    const activeUserId = localStorage.getItem('sv_activeUserId');
    const remaining = sessions.filter((s: { userId: string }) => s.userId !== activeUserId);
    localStorage.setItem('sv_sessions', JSON.stringify(remaining));
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    if (remaining.length > 0) {
      window.location.href = '/accounts';
    } else {
      localStorage.removeItem('sv_activeUserId');
      localStorage.removeItem('sv_profile');
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) throw new ApiError(res.status, await res.text());
  return hasNoBody(res) ? (undefined as T) : res.json();
}

function hasNoBody(res: Response): boolean {
  if (res.status === 204 || res.status === 201 || res.status === 202) {
    const ct = res.headers.get('content-type');
    if (!ct || !ct.includes('application/json')) return true;
  }
  return false;
}

// Single in-flight refresh promise so multiple concurrent 401s share one /refresh call.
let pendingRefresh: Promise<boolean> | null = null;

function tryRefreshToken(): Promise<boolean> {
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = (async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;
    try {
      // Send profileId so the backend can preserve the profile in the new token
      // even when the expired JWT can't be parsed
      const profileData = localStorage.getItem('sv_profile');
      const profileId = profileData ? JSON.parse(profileData)?.id : undefined;
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, profileId }),
      });
      if (!res.ok) return false;
      const data: AuthResponse = await res.json();
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      // Update sessions array
      const activeUserId = localStorage.getItem('sv_activeUserId');
      if (activeUserId) {
        const sessions = JSON.parse(localStorage.getItem('sv_sessions') || '[]');
        const updated = sessions.map((s: { userId: string }) =>
          s.userId === activeUserId ? { ...s, accessToken: data.accessToken, refreshToken: data.refreshToken } : s
        );
        localStorage.setItem('sv_sessions', JSON.stringify(updated));
      }
      return true;
    } catch {
      return false;
    } finally {
      // Cleared on next tick so any awaiter gets the result before we drop the promise.
      setTimeout(() => { pendingRefresh = null; }, 0);
    }
  })();
  return pendingRefresh;
}

// Proactive token refresh: refresh the token before it expires
// so long-running sessions (watching a movie) don't lose auth mid-stream
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function scheduleTokenRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const token = localStorage.getItem('accessToken');
  if (!token) return;
  const expiry = getTokenExpiry(token);
  if (!expiry) return;
  // Refresh roughly halfway through the token's remaining life, with a minimum
  // 5-minute lead so we don't try to use an almost-expired token mid-stream.
  // Previously this was a fixed 2-minute window — too tight for active usage,
  // and any concurrent request stampede during the window would hit 401.
  const remaining = expiry - Date.now();
  const lead = Math.max(5 * 60 * 1000, Math.floor(remaining / 2));
  const delay = Math.max(remaining - lead, 5000);
  refreshTimer = setTimeout(async () => {
    await tryRefreshToken();
    scheduleTokenRefresh();
  }, delay);
}

// Start proactive refresh on load
scheduleTokenRefresh();

// Re-schedule whenever tokens change
const origSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key: string, value: string) {
  origSetItem(key, value);
  if (key === 'accessToken') scheduleTokenRefresh();
};

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`API Error ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

// Auth
export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () =>
      request<void>('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: localStorage.getItem('refreshToken') }) }),
    deviceCode: {
      create: () => request<DeviceCodeResponse>('/api/auth/device-code', { method: 'POST' }),
      poll: (deviceCode: string) =>
        request<DeviceCodePollResponse>('/api/auth/device-code/poll', {
          method: 'POST',
          body: JSON.stringify({ deviceCode }),
        }),
      authorize: (userCode: string) =>
        request<{ status: string }>('/api/auth/device-code/authorize', {
          method: 'POST',
          body: JSON.stringify({ userCode }),
        }),
    },
  },

  profiles: {
    list: () => request<ProfileResponse[]>('/api/profiles'),
    create: (name: string, avatarUrl?: string, pin?: string) =>
      request<ProfileResponse>('/api/profiles', { method: 'POST', body: JSON.stringify({ name, avatarUrl, pin }) }),
    update: (id: string, data: { name?: string; avatarUrl?: string; pin?: string; removePin?: boolean }) =>
      request<ProfileResponse>(`/api/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/profiles/${id}`, { method: 'DELETE' }),
    select: (profileId: string, pin?: string) =>
      request<AuthResponse>(`/api/profiles/${profileId}/select`, { method: 'POST', body: JSON.stringify({ pin }) }),
    getPreferences: () => request<ProfilePreferences>('/api/profiles/preferences'),
    updatePreferences: (prefs: Partial<ProfilePreferences>) =>
      request<ProfilePreferences>('/api/profiles/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  },

  setup: {
    status: () => request<SetupStatusResponse>('/api/setup/status'),
    complete: (data: Record<string, unknown>) =>
      request<AuthResponse>('/api/setup/complete', { method: 'POST', body: JSON.stringify(data) }),
  },

  home: () => request<HomeResponse>('/api/home'),

  libraries: {
    list: () => request<LibraryResponse[]>('/api/libraries'),
    get: (id: string) => request<LibraryResponse>(`/api/libraries/${id}`),
    items: (id: string, params: Record<string, string | number>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
      return request<PaginatedResponse<MediaItemSummaryResponse>>(`/api/libraries/${id}/items?${qs}`);
    },
    scan: (id: string) => request<void>(`/api/libraries/${id}/scan`, { method: 'POST' }),
    create: (data: Record<string, unknown>) =>
      request<LibraryResponse>('/api/libraries', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/libraries/${id}`, { method: 'DELETE' }),
  },

  media: {
    get: (id: string) => request<MediaItemResponse>(`/api/media/${id}`),
    tvshow: (id: string) => request<TvShowDetailResponse>(`/api/media/${id}/tvshow`),
    search: (q: string) => request<SearchResponse>(`/api/media/search?q=${encodeURIComponent(q)}`),
    identify: (id: string, tmdbId: number, isMovie: boolean) =>
      request<void>(`/api/media/${id}/identify`, { method: 'POST', body: JSON.stringify({ tmdbId, isMovie }) }),
  },

  stream: {
    getDirectUrl: (mediaFileId: string) => request<{ url: string; title: string | null; container: string; durationSeconds: number | null; videoCodec: string | null; audioCodec: string | null; resolution: string | null; subtitles?: SubtitleResponse[] }>(`/api/stream/${mediaFileId}/direct`),
    proxyUrl: (mediaFileId: string) => `/api/stream/${mediaFileId}/proxy`,
    remuxUrl: (mediaFileId: string, start?: number, audioTrack?: number) => {
      const params = new URLSearchParams();
      if (start) params.set('start', String(start));
      if (audioTrack !== undefined) params.set('audioTrack', String(audioTrack));
      const qs = params.toString();
      return `/api/stream/${mediaFileId}/remux${qs ? `?${qs}` : ''}`;
    },
    subtitleUrl: (mediaFileId: string, subtitleId: string) => `/api/stream/${mediaFileId}/subtitles/${subtitleId}`,
    audioTracks: (mediaFileId: string) => request<AudioTrackInfo[]>(`/api/stream/${mediaFileId}/audio-tracks`),
    chapters: (mediaFileId: string) => request<ChapterResponse[]>(`/api/stream/${mediaFileId}/chapters`),
    episodeContext: (mediaFileId: string) => request<EpisodeContextResponse>(`/api/stream/${mediaFileId}/episode-context`),
  },

  progress: {
    get: (mediaFileId: string) =>
      request<WatchProgressResponse>(`/api/progress/${mediaFileId}`),
    update: (mediaFileId: string, positionTicks: number, completed: boolean) =>
      request<void>(`/api/progress/${mediaFileId}`, {
        method: 'PUT',
        body: JSON.stringify({ positionTicks, completed }),
      }),
    delete: (mediaFileId: string) =>
      request<void>(`/api/progress/${mediaFileId}`, { method: 'DELETE' }),
  },

  watchlist: {
    list: () => request<WatchlistResponse>('/api/watchlist'),
    add: (mediaItemId: string) => request<void>(`/api/watchlist/${mediaItemId}`, { method: 'POST' }),
    remove: (mediaItemId: string) => request<void>(`/api/watchlist/${mediaItemId}`, { method: 'DELETE' }),
  },

  lists: {
    getAll: (status?: string) => request<UserMediaListDetailResponse[]>(`/api/lists${status ? `?status=${status}` : ''}`),
    get: (mediaItemId: string) => request<UserMediaListResponse>(`/api/lists/${mediaItemId}`),
    upsert: (mediaItemId: string, status: string, rating?: number | null, notes?: string | null) =>
      request<UserMediaListResponse>(`/api/lists/${mediaItemId}`, {
        method: 'PUT',
        body: JSON.stringify({ status, rating, notes }),
      }),
    remove: (mediaItemId: string) => request<void>(`/api/lists/${mediaItemId}`, { method: 'DELETE' }),
    counts: () => request<Record<string, number>>('/api/lists/counts'),
  },

  collections: {
    list: () => request<CollectionResponse[]>('/api/collections'),
    get: (id: string) => request<CollectionDetailResponse>(`/api/collections/${id}`),
    forMedia: (mediaItemId: string) => request<CollectionResponse[]>(`/api/collections/for-media/${mediaItemId}`),
    create: (name: string, description?: string) =>
      request<CollectionResponse>('/api/collections', { method: 'POST', body: JSON.stringify({ name, description }) }),
    update: (id: string, data: { name?: string; description?: string }) =>
      request<CollectionResponse>(`/api/collections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/collections/${id}`, { method: 'DELETE' }),
    addItem: (id: string, mediaItemId: string) =>
      request<void>(`/api/collections/${id}/items/${mediaItemId}`, { method: 'POST' }),
    removeItem: (id: string, mediaItemId: string) =>
      request<void>(`/api/collections/${id}/items/${mediaItemId}`, { method: 'DELETE' }),
  },

  admin: {
    dashboard: () => request<DashboardResponse>('/api/admin/dashboard'),
    s3Connections: {
      list: () => request<S3ConnectionResponse[]>('/api/admin/s3-connections'),
      create: (data: Record<string, unknown>) =>
        request<S3ConnectionResponse>('/api/admin/s3-connections', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Record<string, unknown>) =>
        request<S3ConnectionResponse>(`/api/admin/s3-connections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      test: (id: string) => request<{ status: string }>(`/api/admin/s3-connections/${id}/test`, { method: 'POST' }),
      delete: (id: string, force = false) => request<void>(`/api/admin/s3-connections/${id}?force=${force}`, { method: 'DELETE' }),
    },
    users: {
      list: () => request<UserResponse[]>('/api/users'),
      create: (data: Record<string, unknown>) =>
        request<UserResponse>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Record<string, unknown>) =>
        request<UserResponse>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
    },
    libraries: {
      update: (id: string, data: Record<string, unknown>) =>
        request<LibraryResponse>(`/api/libraries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    },
  },
};
