namespace StreamVault.Core.Interfaces;

public interface ITranscodeService
{
    Task<TranscodeSession> StartTranscodeAsync(Guid mediaFileId, string profileName, CancellationToken ct = default);
    Task<string?> GetManifestPathAsync(string sessionId, string format, CancellationToken ct = default);
    Task<string?> GetSegmentPathAsync(string sessionId, string segmentName, CancellationToken ct = default);
    Task StopTranscodeAsync(string sessionId, CancellationToken ct = default);
    IReadOnlyList<TranscodeSession> GetActiveSessions();
}

public record TranscodeSession(
    string SessionId,
    Guid MediaFileId,
    string ProfileName,
    DateTime StartedAt,
    string OutputDirectory
);
