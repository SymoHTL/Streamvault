# StreamVault

A self-hosted media streaming server built for S3-compatible storage. Think Jellyfin/Plex, but purpose-built to stream directly from any S3-compatible provider (AWS S3, MinIO, Backblaze B2, Wasabi, Cloudflare R2).

## Features

- **Direct S3 streaming** — Pre-signed URLs for zero-bandwidth server streaming of compatible formats
- **Server-side transcoding** — FFmpeg fallback for incompatible codecs (HLS output)
- **Library scanning** — Automatic parsing of Radarr/Sonarr naming conventions
- **TMDB metadata** — Auto-fetches posters, backdrops, cast, genres, ratings
- **OpenSubtitles** — Automatic subtitle fetching
- **Multi-user** — JWT authentication with admin/user roles
- **Watch progress** — Cross-device resume with automatic progress tracking
- **Dark/Light theme** — System preference detection with manual toggle
- **i18n ready** — English included, structure ready for additional languages

## Tech Stack

**Backend:** .NET 10, ASP.NET Core, EF Core + SQLite, SignalR, Hangfire, FFmpeg  
**Frontend:** React 19, TypeScript, Vite, TailwindCSS 4, React Router 7, TanStack Query, Zustand  
**Infrastructure:** Docker Compose, Redis (caching), S3-compatible storage

## Quick Start

```bash
# Clone and configure
cp .env.example .env
# Edit .env with your JWT secret and (optionally) TMDB API key

# Start with Docker Compose
docker compose -f docker-compose.local.yml up -d

# Open http://localhost:8080
# Complete the setup wizard (admin user → S3 connection → library)
```

## Development

### Prerequisites

- .NET 10 SDK
- Node.js 22+
- FFmpeg (in PATH)

### Backend

```bash
cd src/StreamVault.Api
dotnet run
# API runs on http://localhost:5000
```

### Frontend

```bash
cd src/StreamVault.Web
npm install
npm run dev
# Dev server on http://localhost:5173 (proxies API to :5000)
```

## Configuration

Configuration via `appsettings.json` or environment variables:

| Setting | Default | Description |
|---------|---------|-------------|
| `DataDirectory` | `/data` | Path for SQLite DB, image cache, transcode temp |
| `Jwt__Secret` | (required) | JWT signing key (min 32 chars) |
| `Jwt__Issuer` | `StreamVault` | JWT issuer |
| `Tmdb__ApiKey` | (optional) | TMDB API key for metadata |
| `OpenSubtitles__ApiKey` | (optional) | OpenSubtitles API key |
| `Redis__ConnectionString` | (optional) | Redis connection for caching |
| `CorsOrigins__0` | `http://localhost:5173` | Allowed CORS origins |

## S3 Compatibility

Tested with:
- AWS S3
- MinIO
- Backblaze B2
- Wasabi
- Cloudflare R2
- Any S3-compatible API with path-style addressing support

## Architecture

```
StreamVault.Core          — Domain entities, interfaces, DTOs
StreamVault.Infrastructure — EF Core, S3 client, FFmpeg, TMDB, scanner
StreamVault.Api           — ASP.NET Core controllers, middleware, SignalR
StreamVault.Web           — React SPA (builds to Api/wwwroot)
```

## License

MIT
