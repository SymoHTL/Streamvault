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
} from '../types';

const BASE = '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
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

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data: AuthResponse = await res.json();
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

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
    getDirectUrl: (mediaFileId: string) => request<{ url: string; container: string; durationSeconds: number | null; videoCodec: string | null; audioCodec: string | null; resolution: string | null }>(`/api/stream/${mediaFileId}/direct`),
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
      test: (id: string) => request<{ status: string }>(`/api/admin/s3-connections/${id}/test`, { method: 'POST' }),
      delete: (id: string) => request<void>(`/api/admin/s3-connections/${id}`, { method: 'DELETE' }),
    },
    users: {
      list: () => request<UserResponse[]>('/api/users'),
      create: (data: Record<string, unknown>) =>
        request<UserResponse>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
      delete: (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
    },
  },
};
