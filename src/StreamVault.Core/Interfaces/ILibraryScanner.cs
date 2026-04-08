namespace StreamVault.Core.Interfaces;

public interface ILibraryScanner
{
    Task ScanLibraryAsync(Guid libraryId, CancellationToken ct = default);
}
