using System.ComponentModel.DataAnnotations;

namespace StreamVault.Core.DTOs;

// === Auth ===
public record LoginRequest(
    [Required] string Username,
    [Required] string Password
);

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    UserResponse User,
    ProfileResponse? Profile,
    IReadOnlyList<ProfileResponse>? Profiles
);

public record RefreshTokenRequest(
    [Required] string RefreshToken
);

// === Profiles ===
public record ProfileResponse(
    Guid Id,
    string Name,
    string? AvatarUrl,
    bool HasPin,
    bool IsDefault
);

public record CreateProfileRequest(
    [Required] string Name,
    string? AvatarUrl,
    string? Pin
);

public record UpdateProfileRequest(
    string? Name,
    string? AvatarUrl,
    string? Pin,
    bool? RemovePin
);

public record SelectProfileRequest(
    string? Pin
);

// === Device Code Auth ===
public record DeviceCodeResponse(
    string DeviceCode,
    string UserCode,
    string QrUrl,
    int ExpiresIn,
    int PollInterval
);

public record DeviceCodePollRequest(
    [Required] string DeviceCode
);

public record DeviceCodePollResponse(
    string Status,
    AuthResponse? Auth
);

public record DeviceCodeAuthorizeRequest(
    [Required] string UserCode
);

// === Setup ===
public record SetupStatusResponse(bool IsSetupRequired);

public record SetupRequest(
    [Required] string AdminUsername,
    [Required, EmailAddress] string AdminEmail,
    [Required, MinLength(8)] string AdminPassword,
    [Required] S3ConnectionRequest S3Connection,
    [Required] LibraryRequest InitialLibrary,
    string? TmdbApiKey,
    string? OpenSubtitlesApiKey
);

// === Users ===
public record UserResponse(
    Guid Id,
    string Username,
    string Email,
    string Role,
    DateTime CreatedAt
);

public record CreateUserRequest(
    [Required] string Username,
    [Required, EmailAddress] string Email,
    [Required, MinLength(8)] string Password,
    string Role = "User"
);

public record UpdateUserRequest(
    string? Username,
    string? Email,
    string? Password,
    string? Role
);

public record UpdateAccountRequest(
    string? Email,
    string? Password,
    string? PreferencesJson
);

// === S3 Connections ===
public record S3ConnectionRequest(
    [Required] string Name,
    [Required] string Endpoint,
    [Required] string Bucket,
    [Required] string AccessKey,
    [Required] string SecretKey,
    string Region = "us-east-1",
    bool ForcePathStyle = true
);

public record S3ConnectionResponse(
    Guid Id,
    string Name,
    string Endpoint,
    string Bucket,
    string Region,
    bool ForcePathStyle,
    DateTime CreatedAt
);

// === Libraries ===
public record LibraryRequest(
    [Required] string Name,
    [Required] string Type,
    [Required] Guid S3ConnectionId,
    string S3Prefix = "",
    string ScanScheduleCron = "0 */6 * * *"
);

public record LibraryResponse(
    Guid Id,
    string Name,
    string Type,
    string S3Prefix,
    string ScanScheduleCron,
    string ScanStatus,
    DateTime? LastScannedAt,
    Guid S3ConnectionId,
    int ItemCount,
    DateTime CreatedAt
);

// === Media Items ===
public record MediaItemResponse(
    Guid Id,
    string Title,
    string SortTitle,
    int? Year,
    string? Overview,
    double? CommunityRating,
    int? RuntimeMinutes,
    string MediaType,
    DateTime AddedAt,
    Guid LibraryId,
    IReadOnlyList<string> Genres,
    IReadOnlyList<MediaFileResponse> MediaFiles,
    IReadOnlyList<MediaImageResponse> Images,
    IReadOnlyList<PersonResponse> Cast,
    IReadOnlyList<ExternalIdResponse> ExternalIds,
    bool IsInWatchlist
);

public record MediaItemSummaryResponse(
    Guid Id,
    string Title,
    int? Year,
    double? CommunityRating,
    string MediaType,
    string? PosterPath,
    DateTime AddedAt,
    WatchProgressResponse? Progress,
    ContinueWatchingEpisodeInfo? EpisodeInfo = null
);

public record ContinueWatchingEpisodeInfo(
    int SeasonNumber,
    int EpisodeNumber,
    string EpisodeTitle,
    Guid MediaFileId
);

public record MediaFileResponse(
    Guid Id,
    string S3Key,
    string Container,
    string? VideoCodec,
    string? AudioCodec,
    string? Resolution,
    double? DurationSeconds,
    IReadOnlyList<SubtitleResponse> Subtitles,
    IReadOnlyList<AudioTrackResponse> AudioTracks
);

public record AudioTrackResponse(
    int StreamIndex,
    string Language,
    string? Title,
    string Codec,
    int Channels
);

public record SubtitleResponse(
    Guid Id,
    string Language,
    string Format,
    bool IsExternal,
    bool IsForced
);

public record MediaImageResponse(
    Guid Id,
    string Type,
    string Url
);

public record PersonResponse(
    Guid Id,
    string Name,
    string Role,
    string? Character,
    int Order,
    string? ImageUrl = null
);

public record ExternalIdResponse(
    string Provider,
    string ExternalKey
);

// === TV Shows ===
public record TvShowDetailResponse(
    Guid Id,
    string Title,
    int? Year,
    string? Overview,
    double? CommunityRating,
    string? PosterPath,
    string? BackdropPath,
    IReadOnlyList<string> Genres,
    IReadOnlyList<SeasonResponse> Seasons,
    IReadOnlyList<PersonResponse> Cast,
    bool IsInWatchlist
);

public record SeasonResponse(
    Guid Id,
    int SeasonNumber,
    string? Name,
    IReadOnlyList<EpisodeResponse> Episodes
);

public record EpisodeResponse(
    Guid Id,
    int EpisodeNumber,
    string Title,
    string? Overview,
    int? RuntimeMinutes,
    IReadOnlyList<MediaFileResponse> MediaFiles,
    WatchProgressResponse? Progress
);

// === Progress ===
public record UpdateProgressRequest(
    long PositionTicks,
    bool Completed
);

public record WatchProgressResponse(
    Guid MediaFileId,
    long PositionTicks,
    bool Completed,
    DateTime LastWatchedAt,
    double? DurationSeconds
);

// === Watchlist ===
public record WatchlistResponse(
    IReadOnlyList<MediaItemSummaryResponse> Items,
    int TotalCount
);

// === User Media Lists ===
public record UserMediaListRequest(
    [Required] string Status,
    int? Rating = null,
    string? Notes = null
);

public record UserMediaListResponse(
    Guid Id,
    Guid MediaItemId,
    string Status,
    int? Rating,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record UserMediaListDetailResponse(
    Guid Id,
    string Status,
    int? Rating,
    string? Notes,
    DateTime CreatedAt,
    MediaItemSummaryResponse MediaItem
);

// === Home ===
public record HomeResponse(
    IReadOnlyList<MediaItemSummaryResponse> ContinueWatching,
    IReadOnlyList<MediaItemSummaryResponse> RecentlyAdded,
    IReadOnlyList<MediaItemSummaryResponse> RecentlyWatched,
    MediaItemSummaryResponse? FeaturedItem
);

// === Admin ===
public record DashboardResponse(
    int ActiveStreams,
    int TotalLibraries,
    int TotalMediaItems,
    int TotalUsers,
    IReadOnlyList<ActivityLogEntry> RecentActivity
);

public record ActivityLogEntry(
    string Type,
    string Description,
    DateTime Timestamp,
    string? UserId
);

// === Collections ===
public record CreateCollectionRequest(
    [Required] string Name,
    string? Description
);

public record UpdateCollectionRequest(
    string? Name,
    string? Description
);

public record CollectionResponse(
    Guid Id,
    string Name,
    string? Description,
    string? PosterUrl,
    string? BackdropUrl,
    int ItemCount,
    DateTime CreatedAt,
    bool IsAutoGenerated = false
);

public record CollectionDetailResponse(
    Guid Id,
    string Name,
    string? Description,
    string? PosterUrl,
    string? BackdropUrl,
    IReadOnlyList<MediaItemSummaryResponse> Items,
    DateTime CreatedAt
);

// === Search ===
public record SearchResponse(
    IReadOnlyList<MediaItemSummaryResponse> Movies,
    IReadOnlyList<MediaItemSummaryResponse> TvShows,
    int TotalResults
);

// === Pagination ===
public record PaginatedResponse<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Page,
    int PageSize
);

// === Metadata Identify ===
public record IdentifyRequest(
    int TmdbId,
    bool IsMovie
);

public record IdentifySearchRequest(
    [Required] string Query,
    int? Year
);
