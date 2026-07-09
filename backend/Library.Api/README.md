# Library API — Biblioteca Alberto Gutiérrez Botero

Backend del sistema de gestión de la biblioteca. ASP.NET Core Web API + PostgreSQL, con
autenticación JWT de login único (sin roles) para las rutas de gestión.

## Requisitos previos

- **.NET 10 SDK** ([descargar](https://dotnet.microsoft.com/download)) — el proyecto apunta a
  `net10.0` (`Library.Api.csproj`). Verificalo con `dotnet --version`.
- **Docker Desktop** (o cualquier motor compatible con `docker compose`) — para levantar
  Postgres localmente, sin instalarlo nativo.
- Un IDE con soporte para .NET: **Rider** o **VS Code** con el extension pack de C#.
- El CLI de EF Core (una sola vez, global): `dotnet tool install --global dotnet-ef`.

## 1. Levantar Postgres

Desde la **raíz del repositorio** (donde está `docker-compose.yml`):

```bash
docker compose up -d
```

Esto levanta un contenedor `library_postgres` (Postgres 16) con un volumen persistente, para
que los datos no se pierdan entre reinicios del contenedor.

## 2. Configurar `appsettings.Development.json`

Este archivo **no está en el repositorio** (está en `.gitignore` a propósito, porque contendría
credenciales reales). Creá `backend/Library.Api/appsettings.Development.json` con esta forma:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "ConnectionStrings": {
    "LibraryDb": "Host=localhost;Port=5432;Database=library_alberto_gutierrez_botero;Username=library_dev;Password=library_dev_password"
  },
  "Jwt": {
    "Key": "<secreto largo y aleatorio, mínimo 32 caracteres>"
  },
  "Auth": {
    "Username": "<usuario compartido de la coordinadora>",
    "Password": "<contraseña compartida de la coordinadora>"
  },
  "Smtp": {
    "Host": "sandbox.smtp.mailtrap.io",
    "Port": 2525,
    "Username": "<usuario de Mailtrap>",
    "Password": "<contraseña de Mailtrap>",
    "FromAddress": "no-reply@biblioteca-agb.local",
    "ToAddress": "<correo real de la coordinadora>"
  }
}
```

- La cadena de conexión de arriba ya coincide con las credenciales del `docker-compose.yml`
  del repo — no hace falta cambiarla si usás Docker para la base local.
- `Jwt:Key` es el secreto para firmar los tokens de acceso; cualquier string largo y aleatorio
  sirve en desarrollo.
- `Auth:Username`/`Auth:Password` son las únicas credenciales de login del sistema de gestión
  (no hay usuarios ni roles — un solo login compartido para la coordinadora).
- `Smtp:*` es solo para el módulo de Sugerencias (envía un correo a la coordinadora por cada
  sugerencia nueva). Con una cuenta gratuita de [Mailtrap](https://mailtrap.io) alcanza para
  desarrollo — el envío nunca hace fallar la request aunque el SMTP esté mal configurado o caído.

## 3. Aplicar las migraciones

Desde `backend/Library.Api`:

```bash
dotnet ef database update
```

Esto crea el esquema completo (tablas, enums nativos de Postgres, índices) contra el Postgres
del paso 1.

## 4. Correr el proyecto

Desde `backend/Library.Api`:

```bash
dotnet run
```

Swagger queda disponible en:

```
https://localhost:7272/swagger
```

(o `http://localhost:5062/swagger` si tu perfil de ejecución usa HTTP — revisá
`Properties/launchSettings.json` si Rider te asigna otro puerto).

Para probar las rutas que requieren autenticación, hacé login primero en
`POST /api/v1/auth/login` con las credenciales de `Auth` de tu `appsettings.Development.json`,
y usá el token devuelto como `Authorization: Bearer {token}` — en Swagger, el botón
"Authorize" de arriba a la derecha lo hace por vos.

## Colección de Postman

`library-api.postman_collection.json` (con su entorno `library-api.postman_environment.json`)
cubre los 35 endpoints de los 10 módulos, organizados en carpetas.

1. Importá ambos archivos en Postman y seleccioná el entorno "Library API - Local".
2. Completá `auth_username` / `auth_password` en el entorno con las credenciales de tu
   `Auth` local.
3. Corré **Auth → Login** una vez: guarda el token en `{{jwt_token}}` automáticamente para el
   resto de la colección (no hay que copiarlo a mano).
4. Los requests que crean un recurso (**Crear libro**, **Afiliar nuevo miembro**, **Crear
   préstamo**, **Crear evento**, **Enviar sugerencia**) guardan automáticamente el `id` que
   devuelven en `{{book_id}}`, `{{member_id}}`, `{{loan_id}}`, `{{event_id}}` y
   `{{suggestion_id}}` respectivamente — el resto de la colección ya los usa solo, sin copiar
   nada a mano. Corriendo las carpetas en orden (de arriba hacia abajo) alcanza; **"Dar de
   baja libro"** queda al final a propósito, para no retirar el libro de ejemplo antes de
   que Préstamos lo use.

## 5. Apagar todo

```bash
docker compose down
```

Los datos persisten en el volumen de Docker aunque apagues el contenedor — solo se pierden si
corrés `docker compose down -v`.

## Módulos implementados

| Módulo | Qué hace |
|---|---|
| **Auth** | Login único compartido (sin roles), emite JWT para las rutas de gestión. |
| **Catálogo** | CRUD de libros. Catálogo público con búsqueda y paginación; alta, edición y retiro (soft delete) requieren login. |
| **Afiliaciones** | Alta y edición de miembros/afiliados, con chequeo de duplicados por número de documento. Todo requiere login. |
| **Préstamos y consulta en sala** | Prestar y devolver libros (con las reglas de disponibilidad y vencimiento), más el registro rápido de lectura en sala sin afectar el inventario. Todo requiere login. |
| **Asistencia** | Registro manual de visitas al mostrador, independiente de las afiliaciones. Todo requiere login. |
| **Eventos** | Talleres y actividades: listado público de próximos eventos/destacados, y CRUD completo (incluye borrado físico) para gestión. |
| **Sugerencias** | Buzón público de sugerencias con notificación automática por correo a la coordinadora; marcado de leída y listado requieren login. |
| **Contador de visitas** | Contador atómico de visitas al sitio público (sin login), pensado para alta concurrencia. |
| **Reportes** | Estadísticas mensuales de catálogo/préstamos y de sala/asistencia, calculadas con agregaciones de base de datos. Todo requiere login. |

## Nota: enums nativos de Postgres en español

`BookStatus` (`Disponible`, `Prestado`, `Consulta en sala`, `Perdido`, `Baja`) y `LoanStatus`
(`Prestado`, `Devuelto`, `Vencido`) están modelados como **enums nativos de Postgres**, con las
etiquetas en español tal como los usa la coordinadora en su flujo actual — no son códigos
internos en inglés que haya que traducir en el frontend. Esto fue una decisión de negocio
deliberada: el vocabulario del sistema debe coincidir exactamente con el que ya usa el personal
de la biblioteca, para minimizar fricción de adopción y evitar una capa de traducción/mapeo
innecesaria entre lo que ve la coordinadora y lo que hay en la base de datos.
