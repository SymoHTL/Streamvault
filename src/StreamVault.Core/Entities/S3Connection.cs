namespace StreamVault.Core.Entities;

public class S3Connection : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Endpoint { get; set; } = string.Empty;
    public string Bucket { get; set; } = string.Empty;
    public string AccessKey { get; set; } = string.Empty;
    public string SecretKeyEncrypted { get; set; } = string.Empty;
    public string Region { get; set; } = "us-east-1";
    public bool ForcePathStyle { get; set; } = true;

    public ICollection<Library> Libraries { get; set; } = [];
}
