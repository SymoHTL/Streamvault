using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.Entities;

namespace StreamVault.Infrastructure.Data;

public class StreamVaultDbContext : DbContext, IDataProtectionKeyContext
{
    public StreamVaultDbContext(DbContextOptions<StreamVaultDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<S3Connection> S3Connections => Set<S3Connection>();
    public DbSet<Library> Libraries => Set<Library>();
    public DbSet<MediaItem> MediaItems => Set<MediaItem>();
    public DbSet<Season> Seasons => Set<Season>();
    public DbSet<Episode> Episodes => Set<Episode>();
    public DbSet<MediaFile> MediaFiles => Set<MediaFile>();
    public DbSet<Subtitle> Subtitles => Set<Subtitle>();
    public DbSet<Genre> Genres => Set<Genre>();
    public DbSet<MediaGenre> MediaGenres => Set<MediaGenre>();
    public DbSet<Person> Persons => Set<Person>();
    public DbSet<MediaPerson> MediaPersons => Set<MediaPerson>();
    public DbSet<ExternalId> ExternalIds => Set<ExternalId>();
    public DbSet<MediaImage> MediaImages => Set<MediaImage>();
    public DbSet<WatchProgress> WatchProgresses => Set<WatchProgress>();
    public DbSet<WatchlistItem> WatchlistItems => Set<WatchlistItem>();
    public DbSet<UserMediaList> UserMediaLists => Set<UserMediaList>();
    public DbSet<Collection> Collections => Set<Collection>();
    public DbSet<CollectionItem> CollectionItems => Set<CollectionItem>();
    public DbSet<TranscodeProfile> TranscodeProfiles => Set<TranscodeProfile>();
    public DbSet<AudioTrack> AudioTracks => Set<AudioTrack>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // MediaGenre composite key
        modelBuilder.Entity<MediaGenre>()
            .HasKey(mg => new { mg.MediaItemId, mg.GenreId });

        modelBuilder.Entity<MediaGenre>()
            .HasOne(mg => mg.MediaItem)
            .WithMany(m => m.MediaGenres)
            .HasForeignKey(mg => mg.MediaItemId);

        modelBuilder.Entity<MediaGenre>()
            .HasOne(mg => mg.Genre)
            .WithMany(g => g.MediaGenres)
            .HasForeignKey(mg => mg.GenreId);

        // MediaPerson composite key
        modelBuilder.Entity<MediaPerson>()
            .HasKey(mp => new { mp.MediaItemId, mp.PersonId, mp.Role });

        modelBuilder.Entity<MediaPerson>()
            .HasOne(mp => mp.MediaItem)
            .WithMany(m => m.MediaPersons)
            .HasForeignKey(mp => mp.MediaItemId);

        modelBuilder.Entity<MediaPerson>()
            .HasOne(mp => mp.Person)
            .WithMany(p => p.MediaPersons)
            .HasForeignKey(mp => mp.PersonId);

        // Library -> S3Connection
        modelBuilder.Entity<Library>()
            .HasOne(l => l.S3Connection)
            .WithMany(s => s.Libraries)
            .HasForeignKey(l => l.S3ConnectionId);

        // MediaItem -> Library
        modelBuilder.Entity<MediaItem>()
            .HasOne(m => m.Library)
            .WithMany(l => l.MediaItems)
            .HasForeignKey(m => m.LibraryId);

        // Season -> MediaItem (TV Show)
        modelBuilder.Entity<Season>()
            .HasOne(s => s.MediaItem)
            .WithMany(m => m.Seasons)
            .HasForeignKey(s => s.MediaItemId);

        // Episode -> Season
        modelBuilder.Entity<Episode>()
            .HasOne(e => e.Season)
            .WithMany(s => s.Episodes)
            .HasForeignKey(e => e.SeasonId);

        // MediaFile -> MediaItem (optional) or Episode (optional)
        modelBuilder.Entity<MediaFile>()
            .HasOne(mf => mf.MediaItem)
            .WithMany(m => m.MediaFiles)
            .HasForeignKey(mf => mf.MediaItemId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<MediaFile>()
            .HasOne(mf => mf.Episode)
            .WithMany(e => e.MediaFiles)
            .HasForeignKey(mf => mf.EpisodeId)
            .OnDelete(DeleteBehavior.Cascade);

        // Subtitle -> MediaFile
        modelBuilder.Entity<Subtitle>()
            .HasOne(s => s.MediaFile)
            .WithMany(mf => mf.Subtitles)
            .HasForeignKey(s => s.MediaFileId);

        // AudioTrack -> MediaFile
        modelBuilder.Entity<AudioTrack>()
            .HasOne(at => at.MediaFile)
            .WithMany(mf => mf.AudioTracks)
            .HasForeignKey(at => at.MediaFileId)
            .OnDelete(DeleteBehavior.Cascade);

        // WatchProgress unique per user+mediafile
        modelBuilder.Entity<WatchProgress>()
            .HasIndex(wp => new { wp.UserId, wp.MediaFileId })
            .IsUnique();

        modelBuilder.Entity<WatchProgress>()
            .HasOne(wp => wp.User)
            .WithMany(u => u.WatchProgresses)
            .HasForeignKey(wp => wp.UserId);

        modelBuilder.Entity<WatchProgress>()
            .HasOne(wp => wp.MediaFile)
            .WithMany(mf => mf.WatchProgresses)
            .HasForeignKey(wp => wp.MediaFileId);

        // WatchlistItem unique per user+mediaitem
        modelBuilder.Entity<WatchlistItem>()
            .HasIndex(wi => new { wi.UserId, wi.MediaItemId })
            .IsUnique();

        modelBuilder.Entity<WatchlistItem>()
            .HasOne(wi => wi.User)
            .WithMany(u => u.WatchlistItems)
            .HasForeignKey(wi => wi.UserId);

        modelBuilder.Entity<WatchlistItem>()
            .HasOne(wi => wi.MediaItem)
            .WithMany(m => m.WatchlistItems)
            .HasForeignKey(wi => wi.MediaItemId);

        // RefreshToken -> User
        modelBuilder.Entity<RefreshToken>()
            .HasOne(rt => rt.User)
            .WithMany(u => u.RefreshTokens)
            .HasForeignKey(rt => rt.UserId);

        // UserMediaList unique per user+mediaitem
        modelBuilder.Entity<UserMediaList>()
            .HasIndex(uml => new { uml.UserId, uml.MediaItemId })
            .IsUnique();

        modelBuilder.Entity<UserMediaList>()
            .HasOne(uml => uml.User)
            .WithMany(u => u.MediaLists)
            .HasForeignKey(uml => uml.UserId);

        modelBuilder.Entity<UserMediaList>()
            .HasOne(uml => uml.MediaItem)
            .WithMany(m => m.UserMediaLists)
            .HasForeignKey(uml => uml.MediaItemId);

        // Collection -> User
        modelBuilder.Entity<Collection>()
            .HasOne(c => c.CreatedBy)
            .WithMany(u => u.Collections)
            .HasForeignKey(c => c.CreatedByUserId);

        // CollectionItem
        modelBuilder.Entity<CollectionItem>()
            .HasIndex(ci => new { ci.CollectionId, ci.MediaItemId })
            .IsUnique();

        modelBuilder.Entity<CollectionItem>()
            .HasOne(ci => ci.Collection)
            .WithMany(c => c.Items)
            .HasForeignKey(ci => ci.CollectionId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CollectionItem>()
            .HasOne(ci => ci.MediaItem)
            .WithMany(m => m.CollectionItems)
            .HasForeignKey(ci => ci.MediaItemId);

        // ExternalId -> MediaItem
        modelBuilder.Entity<ExternalId>()
            .HasOne(e => e.MediaItem)
            .WithMany(m => m.ExternalIds)
            .HasForeignKey(e => e.MediaItemId);

        // MediaImage -> MediaItem
        modelBuilder.Entity<MediaImage>()
            .HasOne(i => i.MediaItem)
            .WithMany(m => m.Images)
            .HasForeignKey(i => i.MediaItemId);

        // Indexes
        modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();
        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<Genre>().HasIndex(g => g.Name).IsUnique();
        modelBuilder.Entity<MediaItem>().HasIndex(m => m.Title);
        modelBuilder.Entity<MediaItem>().HasIndex(m => new { m.LibraryId, m.SortTitle });
        modelBuilder.Entity<MediaFile>().HasIndex(mf => mf.S3Key).IsUnique();
        modelBuilder.Entity<RefreshToken>().HasIndex(rt => rt.Token).IsUnique();

        // Seed default transcode profiles
        modelBuilder.Entity<TranscodeProfile>().HasData(
            new TranscodeProfile { Id = Guid.Parse("a0000000-0000-0000-0000-000000000001"), Name = "1080p", VideoCodec = "libx264", AudioCodec = "aac", MaxHeight = 1080, MaxBitrate = 8000 },
            new TranscodeProfile { Id = Guid.Parse("a0000000-0000-0000-0000-000000000002"), Name = "720p", VideoCodec = "libx264", AudioCodec = "aac", MaxHeight = 720, MaxBitrate = 4000 },
            new TranscodeProfile { Id = Guid.Parse("a0000000-0000-0000-0000-000000000003"), Name = "480p", VideoCodec = "libx264", AudioCodec = "aac", MaxHeight = 480, MaxBitrate = 2000 },
            new TranscodeProfile { Id = Guid.Parse("a0000000-0000-0000-0000-000000000004"), Name = "360p", VideoCodec = "libx264", AudioCodec = "aac", MaxHeight = 360, MaxBitrate = 1000 }
        );
    }

    public override int SaveChanges()
    {
        UpdateTimestamps();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        UpdateTimestamps();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void UpdateTimestamps()
    {
        var entries = ChangeTracker.Entries<BaseEntity>()
            .Where(e => e.State is EntityState.Modified);

        foreach (var entry in entries)
        {
            entry.Entity.UpdatedAt = DateTime.UtcNow;
        }
    }
}
