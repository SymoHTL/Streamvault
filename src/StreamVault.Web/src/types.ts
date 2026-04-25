// API response types matching the C# DTOs

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: UserResponse;
  profile: ProfileResponse | null;
  profiles: ProfileResponse[] | null;
}

export interface ProfileResponse {
  id: string;
  name: string;
  avatarUrl: string | null;
  hasPin: boolean;
  isDefault: boolean;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface SetupStatusResponse {
  isSetupRequired: boolean;
}

export interface LibraryResponse {
  id: string;
  name: string;
  type: string;
  s3Prefix: string;
  scanScheduleCron: string;
  scanStatus: string;
  lastScannedAt: string | null;
  s3ConnectionId: string;
  itemCount: number;
  createdAt: string;
}

export interface MediaItemResponse {
  id: string;
  title: string;
  sortTitle: string;
  year: number | null;
  overview: string | null;
  communityRating: number | null;
  runtimeMinutes: number | null;
  mediaType: string;
  addedAt: string;
  libraryId: string;
  genres: string[];
  mediaFiles: MediaFileResponse[];
  images: MediaImageResponse[];
  cast: PersonResponse[];
  externalIds: ExternalIdResponse[];
  isInWatchlist: boolean;
}

export interface MediaItemSummaryResponse {
  id: string;
  title: string;
  year: number | null;
  communityRating: number | null;
  mediaType: string;
  posterPath: string | null;
  addedAt: string;
  progress: WatchProgressResponse | null;
  episodeInfo: ContinueWatchingEpisodeInfo | null;
}

export interface ContinueWatchingEpisodeInfo {
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  mediaFileId: string;
}

export interface MediaFileResponse {
  id: string;
  s3Key: string;
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  resolution: string | null;
  durationSeconds: number | null;
  subtitles: SubtitleResponse[];
  audioTracks: AudioTrackInfo[];
}

export interface AudioTrackInfo {
  streamIndex: number;
  language: string;
  title: string | null;
  codec: string;
  channels: number;
}

export interface SubtitleResponse {
  id: string;
  language: string;
  format: string;
  isExternal: boolean;
  isForced: boolean;
}

export interface MediaImageResponse {
  id: string;
  type: string;
  url: string;
}

export interface PersonResponse {
  id: string;
  name: string;
  role: string;
  character: string | null;
  order: number;
  imageUrl: string | null;
}

export interface ExternalIdResponse {
  provider: string;
  externalKey: string;
}

export interface TvShowDetailResponse {
  id: string;
  title: string;
  year: number | null;
  overview: string | null;
  communityRating: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  seasons: SeasonResponse[];
  cast: PersonResponse[];
  isInWatchlist: boolean;
}

export interface SeasonResponse {
  id: string;
  seasonNumber: number;
  name: string | null;
  episodes: EpisodeResponse[];
}

export interface EpisodeResponse {
  id: string;
  episodeNumber: number;
  title: string;
  overview: string | null;
  runtimeMinutes: number | null;
  stillUrl: string | null;
  mediaFiles: MediaFileResponse[];
  progress: WatchProgressResponse | null;
}

export interface WatchProgressResponse {
  mediaFileId: string;
  positionTicks: number;
  completed: boolean;
  lastWatchedAt: string;
  durationSeconds: number | null;
}

export interface HomeResponse {
  continueWatching: MediaItemSummaryResponse[];
  recentlyAdded: MediaItemSummaryResponse[];
  recentlyWatched: MediaItemSummaryResponse[];
  featuredItem: MediaItemSummaryResponse | null;
}

export interface SearchResponse {
  movies: MediaItemSummaryResponse[];
  tvShows: MediaItemSummaryResponse[];
  totalResults: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface DashboardResponse {
  activeStreams: number;
  totalLibraries: number;
  totalMediaItems: number;
  totalUsers: number;
  recentActivity: ActivityLogEntry[];
}

export interface ActivityLogEntry {
  type: string;
  description: string;
  timestamp: string;
  userId: string | null;
}

export interface S3ConnectionResponse {
  id: string;
  name: string;
  endpoint: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
  createdAt: string;
}

export interface WatchlistResponse {
  items: MediaItemSummaryResponse[];
  totalCount: number;
}

export interface UserMediaListResponse {
  id: string;
  mediaItemId: string;
  status: string;
  rating: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserMediaListDetailResponse {
  id: string;
  status: string;
  rating: number | null;
  notes: string | null;
  createdAt: string;
  mediaItem: MediaItemSummaryResponse;
}

export type MediaListStatus = 'Watching' | 'Completed' | 'Dropped' | 'Planned' | 'OnHold';

export interface CollectionResponse {
  id: string;
  name: string;
  description: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  itemCount: number;
  createdAt: string;
  isAutoGenerated: boolean;
}

export interface CollectionDetailResponse {
  id: string;
  name: string;
  description: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  items: MediaItemSummaryResponse[];
  createdAt: string;
}

// === Multi-Account Sessions ===
export interface AccountSession {
  userId: string;
  username: string;
  email: string;
  role: string;
  accessToken: string;
  refreshToken: string;
  profiles: ProfileResponse[];
}

// === Device Code Auth ===
export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  qrUrl: string;
  expiresIn: number;
  pollInterval: number;
}

export interface DeviceCodePollResponse {
  status: 'pending' | 'authorized' | 'expired' | 'denied';
  auth: AuthResponse | null;
}

// === Profile Preferences ===
export interface ProfilePreferences {
  language: string | null;
  audioLanguage: string | null;
  subtitleLanguage: string | null;
  maxBitrate: number | null;
  subtitleSize: string | null;
  subtitleFont: string | null;
  subtitleColor: string | null;
  subtitleBackground: string | null;
}

// === Chapters ===
export interface ChapterResponse {
  id: string;
  title: string | null;
  startSeconds: number;
  endSeconds: number;
  chapterType: 'intro' | 'recap' | 'credits' | 'other';
}

// Episode context for player navigation
export interface EpisodeContextResponse {
  showTitle: string;
  showId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  previousEpisode: EpisodeNavResponse | null;
  nextEpisode: EpisodeNavResponse | null;
}

export interface EpisodeNavResponse {
  mediaFileId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}
