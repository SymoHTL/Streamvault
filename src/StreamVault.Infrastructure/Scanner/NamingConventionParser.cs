using System.Text.RegularExpressions;

namespace StreamVault.Infrastructure.Scanner;

public static partial class NamingConventionParser
{
    // Supported video extensions
    private static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts", ".mpg", ".mpeg"
    };

    private static readonly HashSet<string> SubtitleExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".srt", ".ass", ".ssa", ".vtt", ".sub"
    };

    public static bool IsVideoFile(string key) =>
        VideoExtensions.Contains(Path.GetExtension(key));

    public static bool IsSubtitleFile(string key) =>
        SubtitleExtensions.Contains(Path.GetExtension(key));

    /// <summary>
    /// Parse a Radarr-style movie path:
    ///   Movies/Movie Title (2024)/Movie Title (2024) [Quality].ext
    ///   Movies/Movie Title (2024)/Movie.Title.2024.1080p.BluRay.mkv
    /// </summary>
    public static MovieParseResult? ParseMoviePath(string s3Key, string prefix)
    {
        var relativePath = s3Key;
        if (!string.IsNullOrEmpty(prefix))
        {
            relativePath = s3Key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
                ? s3Key[prefix.Length..].TrimStart('/')
                : s3Key;
        }

        var parts = relativePath.Split('/');
        if (parts.Length < 1) return null;

        // Try: FolderName/filename.ext or just filename.ext
        var folderName = parts.Length >= 2 ? parts[0] : null;
        var fileName = parts[^1];

        if (!IsVideoFile(fileName)) return null;

        // Try to extract title and year from folder name first (more reliable)
        string? title = null;
        int? year = null;

        if (folderName != null)
        {
            var folderMatch = MovieFolderRegex().Match(folderName);
            if (folderMatch.Success)
            {
                title = folderMatch.Groups["title"].Value.Trim();
                if (int.TryParse(folderMatch.Groups["year"].Value, out var y))
                    year = y;
            }
        }

        // Fallback: parse from filename
        if (title == null)
        {
            var fileMatch = MovieFileRegex().Match(Path.GetFileNameWithoutExtension(fileName));
            if (fileMatch.Success)
            {
                title = fileMatch.Groups["title"].Value.Replace('.', ' ').Replace('_', ' ').Trim();
                if (int.TryParse(fileMatch.Groups["year"].Value, out var y))
                    year = y;
            }
            else
            {
                title = CleanTitle(Path.GetFileNameWithoutExtension(fileName));
            }
        }

        return new MovieParseResult(title, year, s3Key);
    }

    /// <summary>
    /// Parse a Sonarr-style TV show path:
    ///   TV Shows/Show Title/Season 01/Show Title - S01E01 - Episode Title.ext
    ///   TV Shows/Show Title (2024)/Season 01/Show.Title.S01E01.Episode.Title.720p.mkv
    /// </summary>
    public static TvShowParseResult? ParseTvShowPath(string s3Key, string prefix)
    {
        var relativePath = s3Key;
        if (!string.IsNullOrEmpty(prefix))
        {
            relativePath = s3Key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
                ? s3Key[prefix.Length..].TrimStart('/')
                : s3Key;
        }

        var parts = relativePath.Split('/');
        var fileName = parts[^1];

        if (!IsVideoFile(fileName)) return null;

        // Extract show title from folder structure
        string? showTitle = null;
        int? showYear = null;
        int? seasonNumber = null;

        // Look for show folder (first non-season folder)
        for (int i = 0; i < parts.Length - 1; i++)
        {
            var seasonMatch = SeasonFolderRegex().Match(parts[i]);
            if (seasonMatch.Success)
            {
                seasonNumber = seasonMatch.Groups["num"].Success
                    ? int.Parse(seasonMatch.Groups["num"].Value)
                    : 0; // "Specials" folder = Season 0
            }
            else if (showTitle == null)
            {
                var folderMatch = MovieFolderRegex().Match(parts[i]);
                if (folderMatch.Success)
                {
                    showTitle = folderMatch.Groups["title"].Value.Trim();
                    if (int.TryParse(folderMatch.Groups["year"].Value, out var y))
                        showYear = y;
                }
                else
                {
                    showTitle = parts[i];
                }
            }
        }

        // Parse episode info from filename
        var fileNameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
        var epMatch = EpisodeRegex().Match(fileNameWithoutExt);
        if (!epMatch.Success)
        {
            // Fallback: try simpler pattern for files that only have SxxExx without quality tags
            var simpleMatch = SimpleEpisodeRegex().Match(fileNameWithoutExt);
            if (!simpleMatch.Success) return null;

            var sSeason = int.Parse(simpleMatch.Groups["season"].Value);
            var sEpisode = int.Parse(simpleMatch.Groups["episode"].Value);
            seasonNumber ??= sSeason;

            showTitle ??= simpleMatch.Groups["title"].Success
                ? simpleMatch.Groups["title"].Value.Replace('.', ' ').Replace('_', ' ').Trim()
                : "Unknown Show";

            return new TvShowParseResult(showTitle, showYear, seasonNumber.Value, sEpisode, null, s3Key);
        }

        var season = int.Parse(epMatch.Groups["season"].Value);
        var episode = int.Parse(epMatch.Groups["episode"].Value);
        seasonNumber ??= season;

        // Episode title from filename if present
        string? episodeTitle = null;
        if (epMatch.Groups["eptitle"].Success)
        {
            var rawTitle = epMatch.Groups["eptitle"].Value.Replace('.', ' ').Replace('_', ' ').Trim(' ', '-');
            if (!string.IsNullOrWhiteSpace(rawTitle) && !IsOnlyQualityTags(rawTitle))
                episodeTitle = rawTitle;
        }

        showTitle ??= epMatch.Groups["title"].Success
            ? epMatch.Groups["title"].Value.Replace('.', ' ').Replace('_', ' ').Trim()
            : "Unknown Show";

        return new TvShowParseResult(showTitle, showYear, seasonNumber.Value, episode, episodeTitle, s3Key);
    }

    /// <summary>
    /// Detect subtitle files associated with a video file.
    /// Looks for files with same base name but subtitle extension, and optional language suffix:
    ///   Movie.Title.2024.mkv → Movie.Title.2024.srt, Movie.Title.2024.en.srt
    /// </summary>
    public static SubtitleParseResult? ParseSubtitlePath(string s3Key)
    {
        if (!IsSubtitleFile(s3Key)) return null;

        var fileName = Path.GetFileNameWithoutExtension(s3Key);
        var ext = Path.GetExtension(s3Key).TrimStart('.').ToLowerInvariant();

        // Check for language code suffix: name.en.srt, name.eng.srt
        var langMatch = SubtitleLangRegex().Match(fileName);
        string? language = null;
        bool isForced = false;

        if (langMatch.Success)
        {
            language = langMatch.Groups["lang"].Value.ToLowerInvariant();
            isForced = langMatch.Groups["forced"].Success;
        }

        return new SubtitleParseResult(s3Key, language ?? "und", ext, isForced);
    }

    private static string CleanTitle(string name)
    {
        // Remove quality tags, release info, etc.
        var cleaned = QualityTagRegex().Replace(name, "");
        return cleaned.Replace('.', ' ').Replace('_', ' ').Trim();
    }

    private static readonly HashSet<string> QualityTagWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "720p", "1080p", "2160p", "4K", "HDTV", "WEB", "WEBDL", "WEBRip", "BluRay", "BDRip", "DVDRip",
        "x264", "x265", "HEVC", "H264", "H265", "AAC", "EAC3", "AC3", "DTS", "FLAC", "ATMOS",
        "REMUX", "PROPER", "REPACK", "German", "FRENCH", "SPANISH", "ITALIAN", "MULTI", "MULTi",
        "DL", "DUAL", "DUBBED", "iNTERNAL", "SUBBED", "NF", "AMZN", "DSNP", "ATVP", "HMAX",
        "REMASTERED", "EXTENDED", "UNCUT", "DD5", "DDP5"
    };

    private static bool IsOnlyQualityTags(string text)
    {
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return words.Length > 0 && words.All(w => QualityTagWords.Contains(w));
    }

    // Radarr folder: "Movie Title (2024)" or "Movie Title (2024) [tags]"
    [GeneratedRegex(@"^(?<title>.+?)\s*\((?<year>\d{4})\)")]
    private static partial Regex MovieFolderRegex();

    // Movie filename: "Movie.Title.2024.1080p.BluRay.x264.mkv" or "Movie Title 2024.mkv"
    [GeneratedRegex(@"^(?<title>.+?)[\.\s](?<year>(?:19|20)\d{2})[\.\s]")]
    private static partial Regex MovieFileRegex();

    // Season folder: "Season 01", "Season 1", "S01", "Specials"
    [GeneratedRegex(@"^(?:Season\s*|S)(?<num>\d+)$|^Specials$", RegexOptions.IgnoreCase)]
    private static partial Regex SeasonFolderRegex();

    // Episode: "Show.Title.S01E01.Episode.Title.720p" or "Show Title - S01E01 - Episode Title"
    // Uses .*? (not [^\.]*?) so dot-separated episode titles are captured correctly
    // Tags require a preceding separator (dot/space) to avoid matching inside words (e.g. "Anfang" matching "NF")
    [GeneratedRegex(@"^(?<title>.+?)[\.\s\-]*S(?<season>\d+)E(?<episode>\d+)[\.\s\-]*(?<eptitle>.*?)(?=(?:[\.\s\-]+(?:\d{3,4}p|HDTV|WEB[-.]?DL|WEB[-.]?Rip|WEB|BluRay|BDRip|DVDRip|x264|x265|HEVC|H\.?264|H\.?265|AAC|EAC3|E-AC-?3|AC3|DD[P+]?5|DTS|FLAC|ATMOS|REMUX|PROPER|REPACK|German|FRENCH|SPANISH|ITALIAN|MULTI|MULTi|DL|DUAL|DUBBED|iNTERNAL|SUBBED|NF|AMZN|DSNP|ATVP|HMAX|REMASTERED|EXTENDED|UNCUT))|$)", RegexOptions.IgnoreCase)]
    private static partial Regex EpisodeRegex();

    // Simple fallback: just match SxxExx anywhere in the filename
    [GeneratedRegex(@"^(?<title>.+?)[\.\s\-]*S(?<season>\d+)E(?<episode>\d+)", RegexOptions.IgnoreCase)]
    private static partial Regex SimpleEpisodeRegex();

    // Subtitle language: "name.en.srt", "name.eng.forced.srt"
    [GeneratedRegex(@"\.(?<lang>[a-z]{2,3})(?:\.(?<forced>forced))?$", RegexOptions.IgnoreCase)]
    private static partial Regex SubtitleLangRegex();

    // Quality tags to strip
    [GeneratedRegex(@"[\.\s](?:720p|1080p|2160p|4K|HDTV|WEB-?DL|WEB-?Rip|BluRay|BDRip|DVDRip|x264|x265|HEVC|H\.?264|H\.?265|AAC|EAC3|E-AC-?3|AC3|DD[P+]?5|DTS|FLAC|ATMOS|REMUX|PROPER|REPACK|German|FRENCH|SPANISH|ITALIAN|MULTI|MULTi|DL|DUAL|DUBBED|iNTERNAL|SUBBED|NF|AMZN|DSNP|ATVP|HMAX|REMASTERED|EXTENDED|UNCUT).*$", RegexOptions.IgnoreCase)]
    private static partial Regex QualityTagRegex();
}

public record MovieParseResult(string Title, int? Year, string S3Key);
public record TvShowParseResult(string ShowTitle, int? ShowYear, int SeasonNumber, int EpisodeNumber, string? EpisodeTitle, string S3Key);
public record SubtitleParseResult(string S3Key, string Language, string Format, bool IsForced);
