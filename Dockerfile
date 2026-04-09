# Build React frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY src/StreamVault.Web/package*.json ./
RUN npm ci
COPY src/StreamVault.Web/ ./
RUN npm run build

# Build .NET backend
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build
WORKDIR /src
COPY *.slnx ./
COPY src/StreamVault.Core/*.csproj src/StreamVault.Core/
COPY src/StreamVault.Infrastructure/*.csproj src/StreamVault.Infrastructure/
COPY src/StreamVault.Api/*.csproj src/StreamVault.Api/
RUN dotnet restore src/StreamVault.Api
COPY . .
RUN dotnet publish src/StreamVault.Api -c Release -o /app/publish --no-restore

# Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS runtime

# Install FFmpeg and curl (curl needed for healthcheck)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=backend-build /app/publish .
COPY --from=frontend-build /app/frontend/../StreamVault.Api/wwwroot ./wwwroot/

ENV ASPNETCORE_URLS=http://+:8080
ENV DataDirectory=/data
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "StreamVault.Api.dll"]
