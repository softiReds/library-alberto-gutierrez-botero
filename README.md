# Library Alberto Gutiérrez Botero

Public website and internal management system for **Biblioteca Alberto Gutiérrez Botero**, a neighborhood library in Ricaurte, Bogotá. This project was built as part of a university social service requirement (not a thesis), replacing the library's current Excel/notebook/Google Forms workflow with a proper web-based system.

## Project scope

The project has two independent systems:

- **Public website** — institutional content, catalog browsing, digital resources (external public book databases), workshops and gallery, recommendations, suggestion box, and a public visit counter.
- **Management system** — catalog management, memberships, attendance, loans and in-house reading, and reports. Single shared login for the coordinator.

## Tech stack

- **Backend:** C# .NET
- **Database:** PostgreSQL
- **Frontend:** HTML, CSS, JavaScript (vanilla, no framework)
- **IDs:** UUID (GUID) for all primary/foreign keys
- **Diagramming:** PlantUML (use case, sequence, and data model diagrams)

## Repository structure
- docs/
  - requirements/ — user stories and requirements (EN + ES)
  - diagrams/ — PlantUML: use cases, sequence diagrams, data model
- backend/ — C# .NET API
- frontend/
  - public/ — public website (HTML/CSS/JS)
  - admin/ — management system (HTML/CSS/JS)

## Local development database

PostgreSQL runs in Docker for local development; the API itself runs natively (e.g. from Rider), not in a container.

```bash
# Start Postgres (from the repo root)
docker compose up -d

# Apply EF Core migrations (from backend/Library.Api)
dotnet ef database update

# Stop Postgres
docker compose down
```
