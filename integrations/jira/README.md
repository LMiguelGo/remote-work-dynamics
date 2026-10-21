# Integración con Jira

Recibe avisos de reglas de Jira Automation y los guarda como eventos en la tabla `events`.

## Cómo funciona

```
Regla de Jira Automation ──"Enviar una solicitud web"──> POST /api/ingesta/jira
                      ├─ exigeTokenIngesta   token en X-Ingest-Token ── si no ──> 401
                      ├─ exigeJson           Content-Type: application/json ── si no ──> 415
                      ├─ jiraAEventos        traduce el aviso al contrato
                      ├─ buscarPorIdentifierYTipo   accountId -> data_source
                      └─ events.insertar     guarda el evento
```

El código vive en `server/backend/src/services/jira.service.js` y en la ruta `POST /api/ingesta/jira`.

## Eventos que captura

| Regla | `event_type` | Campos guardados |
|---|---|---|
| Elemento de trabajo creado | `issue_created` | `issue_key`, `issue_type`, `story_points` |
| Elemento de trabajo transicionado | `issue_updated` | `issue_key`, `status_from`, `status_to`, `story_points`, `resolution_time_hours`, `blocked_time_hours` |

## Configuración

**1. Variables de entorno** (`server/.env` y `docker-compose.yml`):

```
JIRA_STORY_POINTS_FIELD=customfield_10016
```

El id del campo cambia entre instalaciones. Se consulta en `https://TU-SITIO.atlassian.net/rest/api/3/field`, buscando "Story point estimate".

El token de la ingesta es el `INGEST_TOKEN` del backend, el mismo que usan los sensores.

**2. Registrar la cuenta** en `data_sources`. El `identifier` es el `accountId` de Jira **completo**, incluido el prefijo numérico (por ejemplo `712020:...`):

```sql
INSERT INTO data_sources (user_id, source_type, identifier, description)
VALUES (3, 'jira', '712020:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'Cuenta Jira');
```

Para ver el `accountId` que Jira envía realmente, crea una tarea y busca en el log del backend (`docker logs backend`) el mensaje "Aviso de jira ignorado: '...' sin data_source".

**3. Crear dos reglas** en *Configuración del espacio → Automatización*. Ambas usan la acción **Enviar una solicitud web** con:

| Campo | Valor |
|---|---|
| URL | `https://TU-URL-PUBLICA/api/ingesta/jira` |
| Método | `POST` |
| Cuerpo | Datos personalizados |
| Encabezado 1 | `X-Ingest-Token` = valor de `INGEST_TOKEN` |
| Encabezado 2 | `Content-Type` = `application/json` |

**Regla A**, disparador *Elemento de trabajo creado*:

```json
{
  "webhookEvent": "jira:issue_created",
  "issue": {
    "key": "{{issue.key}}",
    "fields": {
      "issuetype": { "name": "{{issue.issueType.name}}" },
      "created": "{{issue.created}}",
      "customfield_10016": "{{issue.customfield_10016}}",
      "assignee": { "accountId": "{{issue.assignee.accountId}}" },
      "reporter": { "accountId": "{{issue.reporter.accountId}}" }
    }
  }
}
```

**Regla B**, disparador *Elemento de trabajo transicionado*:

```json
{
  "webhookEvent": "jira:issue_updated",
  "issue": {
    "key": "{{issue.key}}",
    "fields": {
      "issuetype": { "name": "{{issue.issueType.name}}" },
      "created": "{{issue.created}}",
      "resolutiondate": "{{issue.resolutiondate}}",
      "customfield_10016": "{{issue.customfield_10016}}",
      "assignee": { "accountId": "{{issue.assignee.accountId}}" },
      "reporter": { "accountId": "{{issue.reporter.accountId}}" }
    }
  },
  "changelog": {
    "items": [
      {
        "field": "status",
        "fromString": "{{#changelog.status}}{{fromString}}{{/}}",
        "toString": "{{#changelog.status}}{{toString}}{{/}}"
      }
    ]
  }
}
```

Si cambia el id del campo de story points, hay que cambiarlo también en el cuerpo de las dos reglas.

## Verificar

1. Crea una tarea asignada a ti y muévela de estado.
2. En el registro de auditoría de la regla debe aparecer "Solicitud web publicada correctamente".
3. Consulta:

```sql
SELECT time, event_type, payload FROM events WHERE source_id = <id de la fuente jira> ORDER BY time DESC;
```

Para leer el valor vigente de los puntos de cada tarea (el último evento de cada una):

```sql
SELECT DISTINCT ON (payload->>'issue_key')
       payload->>'issue_key' AS tarea, payload->>'story_points' AS puntos, time
FROM events
WHERE source_id = <id de la fuente jira> AND payload->>'story_points' IS NOT NULL
ORDER BY payload->>'issue_key', time DESC;
```

## Limitaciones conocidas

- Los story points solo se leen al crear la tarea y al cambiar de estado. Cambiar los puntos sin mover la tarea no genera ningún aviso. Si los puntos se asignan después de crear la tarea, `issue_created` guarda `null`.
- `blocked_time_hours` queda en `null`. Requiere el historial completo de la tarea.
- `resolution_time_hours` solo se llena cuando la tarea llega a un estado final.
- Los eventos `issue_updated` se guardan con la hora de llegada al backend.
- Los avisos de cuentas sin fuente registrada se ignoran.

## Problemas frecuentes

| Mensaje en el registro de auditoría | Causa |
|---|---|
| 401 | `X-Ingest-Token` distinto del `INGEST_TOKEN` del backend |
| 415 | Falta el encabezado `Content-Type: application/json` |
| 404 | URL incorrecta o backend sin reconstruir |
| 500 `... is not a function` o `... is not defined` | Error de código en `jira.service.js`; revisar `docker logs backend` |
| Error de conexión | El túnel está cerrado o cambió de dirección |
| 200 pero sin filas en `events` | El `accountId` no coincide con el de `data_sources` |
| Estados vacíos (`""`) | Se usaron `{{fromStatus.name}}` y `{{toStatus.name}}` en lugar de la sintaxis `{{#changelog.status}}` |
