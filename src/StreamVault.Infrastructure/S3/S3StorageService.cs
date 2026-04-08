using System.Collections.Concurrent;
using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Infrastructure.S3;

public class S3StorageService : IS3StorageService, IDisposable
{
    private readonly IDbContextFactory<StreamVaultDbContext> _dbFactory;
    private readonly IDataProtector _protector;
    private readonly ILogger<S3StorageService> _logger;
    private readonly ConcurrentDictionary<Guid, AmazonS3Client> _clients = new();

    public S3StorageService(
        IDbContextFactory<StreamVaultDbContext> dbFactory,
        IDataProtectionProvider protectionProvider,
        ILogger<S3StorageService> logger)
    {
        _dbFactory = dbFactory;
        _protector = protectionProvider.CreateProtector("S3Credentials");
        _logger = logger;
    }

    private async Task<(AmazonS3Client Client, string Bucket)> GetClientAsync(Guid s3ConnectionId, CancellationToken ct)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var conn = await db.S3Connections.FindAsync([s3ConnectionId], ct)
            ?? throw new InvalidOperationException($"S3 connection {s3ConnectionId} not found");

        var client = _clients.GetOrAdd(s3ConnectionId, _ =>
        {
            string secretKey;
            try { secretKey = _protector.Unprotect(conn.SecretKeyEncrypted); }
            catch { secretKey = conn.SecretKeyEncrypted; } // fallback for unencrypted (first-run)

            var config = new AmazonS3Config
            {
                ServiceURL = conn.Endpoint,
                ForcePathStyle = conn.ForcePathStyle,
                AuthenticationRegion = conn.Region
            };

            if (!string.IsNullOrEmpty(conn.Region) && conn.Endpoint.Contains("amazonaws.com"))
            {
                config.RegionEndpoint = RegionEndpoint.GetBySystemName(conn.Region);
                config.ServiceURL = null;
            }

            return new AmazonS3Client(conn.AccessKey, secretKey, config);
        });

        return (client, conn.Bucket);
    }

    public async Task<IReadOnlyList<string>> ListObjectKeysAsync(Guid s3ConnectionId, string prefix, CancellationToken ct = default)
    {
        var (client, bucket) = await GetClientAsync(s3ConnectionId, ct);
        var keys = new List<string>();
        string? continuationToken = null;

        do
        {
            var request = new ListObjectsV2Request
            {
                BucketName = bucket,
                Prefix = prefix,
                ContinuationToken = continuationToken,
                MaxKeys = 1000
            };

            var response = await client.ListObjectsV2Async(request, ct);
            keys.AddRange(response.S3Objects.Select(o => o.Key));
            continuationToken = response.IsTruncated == true ? response.NextContinuationToken : null;
        } while (continuationToken != null);

        return keys;
    }

    public async Task<string> GetPreSignedUrlAsync(Guid s3ConnectionId, string key, TimeSpan expiry, CancellationToken ct = default)
    {
        var (client, bucket) = await GetClientAsync(s3ConnectionId, ct);

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = key,
            Expires = DateTime.UtcNow.Add(expiry),
            Verb = HttpVerb.GET
        };

        return await client.GetPreSignedURLAsync(request);
    }

    public async Task<Stream> GetObjectStreamAsync(Guid s3ConnectionId, string key, string? rangeHeader = null, CancellationToken ct = default)
    {
        var (client, bucket) = await GetClientAsync(s3ConnectionId, ct);

        var request = new GetObjectRequest
        {
            BucketName = bucket,
            Key = key
        };

        if (!string.IsNullOrEmpty(rangeHeader))
        {
            request.ByteRange = new ByteRange(rangeHeader);
        }

        var response = await client.GetObjectAsync(request, ct);
        return response.ResponseStream;
    }

    public async Task<S3ObjectMetadata> HeadObjectAsync(Guid s3ConnectionId, string key, CancellationToken ct = default)
    {
        var (client, bucket) = await GetClientAsync(s3ConnectionId, ct);
        var response = await client.GetObjectMetadataAsync(bucket, key, ct);
        return new S3ObjectMetadata(response.ContentLength, response.Headers.ContentType, response.LastModified);
    }

    public async Task<bool> TestConnectionAsync(Guid s3ConnectionId, CancellationToken ct = default)
    {
        try
        {
            var (client, bucket) = await GetClientAsync(s3ConnectionId, ct);
            await client.ListObjectsV2Async(new ListObjectsV2Request
            {
                BucketName = bucket,
                MaxKeys = 1
            }, ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "S3 connection test failed for {ConnectionId}", s3ConnectionId);
            return false;
        }
    }

    public async Task DownloadToFileAsync(Guid s3ConnectionId, string key, string localPath, CancellationToken ct = default)
    {
        var dir = Path.GetDirectoryName(localPath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        await using var s3Stream = await GetObjectStreamAsync(s3ConnectionId, key, null, ct);
        await using var fileStream = File.Create(localPath);
        await s3Stream.CopyToAsync(fileStream, ct);
    }

    public async Task UploadFromFileAsync(Guid s3ConnectionId, string key, string localPath, CancellationToken ct = default)
    {
        var (client, bucket) = await GetClientAsync(s3ConnectionId, ct);

        var request = new PutObjectRequest
        {
            BucketName = bucket,
            Key = key,
            FilePath = localPath
        };

        await client.PutObjectAsync(request, ct);
    }

    public void InvalidateClient(Guid s3ConnectionId)
    {
        if (_clients.TryRemove(s3ConnectionId, out var client))
        {
            client.Dispose();
        }
    }

    public void Dispose()
    {
        foreach (var client in _clients.Values)
        {
            client.Dispose();
        }
        _clients.Clear();
    }
}
