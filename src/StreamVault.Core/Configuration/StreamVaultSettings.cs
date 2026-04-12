namespace StreamVault.Core.Configuration;

public class StreamVaultSettings
{
    public string DataDirectory { get; set; } = "/data";
    public JwtSettings Jwt { get; set; } = new();
    public TmdbSettings Tmdb { get; set; } = new();
    public OpenSubtitlesSettings OpenSubtitles { get; set; } = new();
    public TranscodingSettings Transcoding { get; set; } = new();
    public string[] CorsOrigins { get; set; } = ["http://localhost:5173"];
}

public class JwtSettings
{
    public string Secret { get; set; } = string.Empty;
    public string Issuer { get; set; } = "StreamVault";
    public string Audience { get; set; } = "StreamVaultApp";
    public int AccessTokenExpiryMinutes { get; set; } = 15;
    public int RefreshTokenExpiryDays { get; set; } = 90;
}

public class TmdbSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string Language { get; set; } = "en-US";
}

public class OpenSubtitlesSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string[] PreferredLanguages { get; set; } = ["en"];
}

public class TranscodingSettings
{
    public string FfmpegPath { get; set; } = "ffmpeg";
    public string FfprobePath { get; set; } = "ffprobe";
    public int SegmentDurationSeconds { get; set; } = 6;
    public int MaxConcurrentTranscodes { get; set; } = 2;
    public int IdleTimeoutMinutes { get; set; } = 120;
    public bool PersistToS3 { get; set; }
}
