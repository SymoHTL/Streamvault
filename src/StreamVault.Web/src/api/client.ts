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
      return retry.status === 204 ? (undefined as T) : retry.json();
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.status === 204 ? (undefined as T) : res.json();
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
    directUrl: (mediaFileId: string) => `/api/stream/${mediaFileId}/direct`,
    subtitleUrl: (mediaFileId: string, subtitleId: string) => `/api/stream/${mediaFileId}/subtitles/${subtitleId}`,
  },

  progress: {
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
