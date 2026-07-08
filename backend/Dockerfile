# Build context is expected to be the `backend/` folder (this file's directory), so the
# project lives at `Library.Api/` relative to here — e.g. `docker build -f Dockerfile .`
# run from `backend/`. On Render: set Root Directory to `backend` and Dockerfile Path to
# `Dockerfile`.

# ---- Build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy the csproj first so `dotnet restore` is cached separately from source changes.
COPY Library.Api/Library.Api.csproj Library.Api/
RUN dotnet restore Library.Api/Library.Api.csproj

COPY Library.Api/ Library.Api/
RUN dotnet publish Library.Api/Library.Api.csproj -c Release -o /app/publish --no-restore

# ---- Runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Run as the non-root user the base image already provisions for this purpose.
USER $APP_UID

COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production
# No fixed EXPOSE/ASPNETCORE_URLS here: Render injects a dynamic $PORT at container
# runtime (not build time), and Program.cs reads it to configure Kestrel's listen URL.

ENTRYPOINT ["dotnet", "Library.Api.dll"]
