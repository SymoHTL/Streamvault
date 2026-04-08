namespace StreamVault.Core.Interfaces;

public interface IS3StorageService
{
    Task<IReadOnlyList<string>> ListObjectKeysAsync(Guid s3ConnectionId, string prefix, CancellationToken ct = default);
    Task<string> GetPreSignedUrlAsync(Guid s3ConnectionId, string key, TimeSpan expiry, CancellationToken ct = default);
    Task<Stream> GetObjectStreamAsync(Guid s3ConnectionId, string key, string? rangeHeader = null, CancellationToken ct = default);
    Task<S3ObjectMetadata> HeadObjectAsync(Guid s3ConnectionId, string key, CancellationToken ct = default);
    Task<bool> TestConnectionAsync(Guid s3ConnectionId, CancellationToken ct = default);
    Task DownloadToFileAsync(Guid s3ConnectionId, string key, string localPath, CancellationToken ct = default);
    Task UploadFromFileAsync(Guid s3ConnectionId, string key, string localPath, CancellationToken ct = default);
}

public record S3ObjectMetadata(long ContentLength, string? ContentType, DateTime? LastModified);
