# Integración con GitHub

Recibe webhooks de GitHub y los guarda como eventos en la tabla `events`, con los payloads definidos en `docs/data_guide.md`.

## Cómo funciona

```
GitHub ──webhook──> POST /api/ingesta/github
                      ├─ exigeFirmaGithub   valida la firma HMAC ── si no ──> 401
                      ├─ githubAEventos     traduce el aviso al contrato
                      ├─ buscarPorIdentifierYTipo   login de GitHub -> data_source
                      └─ events.insertar    guarda el evento
```

El código vive en `server/backend/src/`:
- `middlewares/githubFirma.middleware.js`: verifica la firma `X-Hub-Signature-256`.
- `services/github.service.js`: traduce cada aviso a eventos.
- `controllers/ingest.controller.js` y `routes/ingesta.routes.js`: la ruta.

## Eventos que captura

| Aviso de GitHub | `event_type` | Campos guardados |
|---|---|---|
| `pull_request` (opened, reopened, closed) | `pull_request` | `pr_number`, `action` (`merged` si se aceptó), `lines_added`, `lines_deleted`, `files_changed` |
| `pull_request_review` (submitted) | `pull_request_review` | `pr_number`, `is_first_attempt_approved`, `review_responsiveness_minutes`, `pr_comment_density` |
| `push` | `commit` (uno por commit) | `commit_hash`, `conventional_commit_prefix`, `lines_added`, `lines_deleted` |

Nunca se guarda el código ni el mensaje del commit, solo el prefijo convencional (`feat`, `fix`, etc.).

## Configuración

**1. Variables de entorno** (en `server/.env`, que no se sube al repositorio):

```
GITHUB_WEBHOOK_SECRET=una-clave-larga-y-aleatoria
```

Para generarla en PowerShell:

```
-join ((48..57)+(97..102) | Get-Random -Count 64 | % {[char]$_})
```

`docker-compose.yml` debe pasarla al contenedor del backend. Después de cambiarla: `docker compose up -d --build backend`.

**2. Registrar la cuenta de cada persona** en `data_sources`. El `identifier` es el usuario de GitHub, tal como lo escribe GitHub:

```sql
INSERT INTO data_sources (user_id, source_type, identifier, description)
VALUES (3, 'github', 'usuario-de-github', 'Cuenta GitHub');
```

Los avisos de cuentas sin fuente registrada se ignoran sin dar error.

**3. Crear el webhook** en el repositorio: *Settings → Webhooks → Add webhook*.

| Campo | Valor |
|---|---|
| Payload URL | `https://TU-URL-PUBLICA/api/ingesta/github` |
| Content type | `application/json` |
| Secret | el mismo valor de `GITHUB_WEBHOOK_SECRET` |
| Eventos | Pull requests, Pull request reviews, Pushes |

En desarrollo, la URL pública se obtiene con un túnel: `cloudflared tunnel --url http://localhost:3000`. La dirección cambia cada vez que se reinicia el túnel.

## Verificar

1. En el webhook, pestaña *Recent Deliveries*: el aviso `ping` debe tener código 200.
2. Haz un commit y consulta:

```sql
SELECT time, event_type, payload FROM events WHERE source_id = <id de la fuente github>;
```

## Limitaciones conocidas

- `lines_added` y `lines_deleted` de los commits quedan en `null`: el aviso de `push` no las trae. Se obtendrían con la API de GitHub.
- `is_first_attempt_approved` queda en `null`: requiere contar las revisiones previas del PR.
- GitHub incluye como máximo 20 commits por aviso de `push`.

## Problemas frecuentes

| Respuesta en *Recent Deliveries* | Causa |
|---|---|
| 401 "Firma invalida" | El *Secret* del webhook no coincide con `GITHUB_WEBHOOK_SECRET` del contenedor. Comprobar con `docker exec backend printenv GITHUB_WEBHOOK_SECRET` |
| 404 | La URL no termina en `/api/ingesta/github`, o el backend no está reconstruido |
| Error de conexión | El túnel está cerrado o cambió de dirección |
| 200 pero sin filas en `events` | El usuario de GitHub no está registrado en `data_sources` |
