# StreamVault – Copilot Workspace Instructions

## Architecture

- **Backend**: .NET 10 Web API (`src/StreamVault.Api`) → Core (`StreamVault.Core`) → Infrastructure (`StreamVault.Infrastructure`)
- **Frontend**: React 19 + TypeScript + Vite 8 (`src/StreamVault.Web`)
- **Database**: SQLite via EF Core (auto-created, `EnsureCreated` + raw SQL migrations)
- **Storage**: S3-compatible object storage for media files
- **Background jobs**: Hangfire (in-memory)
- **Cache**: Redis (optional, falls back to in-memory)
- **Media processing**: ffmpeg/ffprobe for remuxing, transcoding, probing

## Code Style

### C# / Backend
- Controllers inherit `BaseController` (provides `CurrentUserId`)
- Thin controllers → services via DI (`AddInfrastructure()`)
- JWT Bearer auth; query-string `access_token` fallback for streaming/SignalR
- Serilog for logging

### TypeScript / Frontend
- Tailwind CSS v4 with `@theme` CSS variables for theming (dark/light)
- Custom dark mode: `@custom-variant dark (&:where(.dark, .dark *))`
- Zustand stores for auth + theme; TanStack Query for server state
- Central API client (`src/api/client.ts`) with auto-refresh on 401
- Path alias: `@` → `./src`
- i18n via `react-i18next`

## Build & Run

```sh
# Frontend dev
cd src/StreamVault.Web && npm run dev

# Backend dev
cd src/StreamVault.Api && dotnet run

# Full Docker build (local)
docker compose -f docker-compose.local.yml up --build

# Tests
dotnet test   # runs xUnit tests in tests/
cd src/StreamVault.Web && npm run lint  # frontend lint
```

## Conventions

- Prefer direct play for browser-compatible media; remux only as fallback
- Frontend pages in `src/pages/`, shared components in `src/components/`
- API organized by domain: `auth`, `libraries`, `media`, `stream`, `progress`, `collections`, `lists`
- Docker multi-stage: Node build → .NET publish → runtime with ffmpeg
- Health endpoint: `GET /health`
