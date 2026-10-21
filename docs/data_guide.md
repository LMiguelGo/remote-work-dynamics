# Guía de Referencia: Fuentes de Datos, Tipos de Eventos y Payloads

Este documento sirve como guía de integración y catálogo de las fuentes de datos, los tipos de eventos por fuente y la estructura del payload de cada evento. 

---

## Matriz de Mapeo de Eventos

<table border="1">
  <thead>
    <tr>
      <th>Título de la fuente</th>
      <th>Descripción de la fuente</th>
      <th>Nombre de la fuente en BD (data_sources:source_type)</th>
      <th>Nombre del tipo de evento en BD (events:event_type)</th>
      <th>Contenido del Payload (events:payload)</th>
      <th>Ejemplo del Payload</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="3"><b>Vista web del empleado</b></td>
      <td rowspan="3">Acceso web del empleado para registro de horas laborales y encuestas</td>
      <td rowspan="3">web_app</td>
      <td>working_session</td>
      <td>
        <ul>
          <li>Hora de inicio</li>
          <li>Hora de finalización</li>
        </ul>
      </td>
      <td><code>
      {"start_time": "2026-10-19T08:00:00Z", "end_time": "2026-10-19T12:00:00Z"}
      </code></td>
    </tr>
    <tr>
      <td>daily_survey</td>
      <td>
        <ul>
          <li>Índice de satisfacción general (1 - 5)</li>
          <li>Percepción de herramientas/eficacia (1 - 5)</li>
          <li>Nivel de fatiga (1 - 5)</li>
          <li>Percepción de capacidad de concentración (1 - 5)</li>
        </ul>
      </td>
      <td><code>
      {"satisfaction_level": 4, "tools_perception": 3, "fatigue_level": 1, "concentration_perception": 4}
      </code></td>
    </tr>
    <tr>
      <td>weekly_survey</td>
      <td>
        <ul>
          <li>Índice de calidad de canales de comunicación (1 - 5)</li>
          <li>Coordinación en el equipo/TCS (1 - 5)</li>
          <li>Percepción sobre la documentación (1 - 5)</li>
        </ul>
      </td> 
      <td><code>
      {"communication_quality": 4, "team_coordination": 3, "documentation_perception": 2}
      </code></td>
    </tr>
    <tr>
      <td><b>Microcontrolador ESP32</b></td>
      <td>Medición ambiental de temperatura, humedad y ruido</td>
      <td>esp32</td>
      <td>ambiental_reading</td>
      <td>
        <ul>
          <li>Temperatura</li>
          <li>Humedad</li>
          <li>Ruido ambiental</li>
        </ul>
      </td>
      <td><code>
      {"temperature": 23.5, "humidity": 45.2, "noise_level": 42.1}
      </code></td>
    </tr>
    <tr>
      <td rowspan="3"><b>GitHub</b></td>
      <td rowspan="3">Trazabilidad del flujo de desarrollo, revisiones y actividad de commits</td>
      <td rowspan="3">github</td>
      <td>pull_request</td>
      <td>
        <ul>
          <li>Acción del PR (opened, merged, closed)</li>
          <li>Líneas agregadas y eliminadas</li>
          <li>Archivos modificados</li>
        </ul>
      </td>
      <td><code>
      {"pr_number": 12, "action": "opened", "lines_added": 120, "lines_deleted": 15, "files_changed": 3}
      </code></td>
    </tr>
    <tr>
      <td>pull_request_review</td>
      <td>
        <ul>
          <li>Aprobación al primer intento</li>
          <li>Tiempo de respuesta de revisión (min)</li>
          <li>Densidad de comentarios</li>
        </ul>
      </td>
      <td><code>
      {"pr_number": 12, "is_first_attempt_approved": true, "review_responsiveness_minutes": 35.0, "pr_comment_density": 2}
      </code></td>
    </tr>
    <tr>
      <td>commit</td>
      <td>
        <ul>
          <li>Hash del commit</li>
          <li>Prefijo convencional (feat, fix, docs, etc.)</li>
          <li>Líneas agregadas y eliminadas</li>
        </ul>
      </td>
      <td><code>
      {"commit_hash": "a1b2c3d", "conventional_commit_prefix": "feat", "lines_added": 45, "lines_deleted": 8}
      </code></td>
    </tr>
    <tr>
      <td rowspan="2"><b>Jira Software</b></td>
      <td rowspan="2">Seguimiento del ciclo de vida y estado de tareas ágiles</td>
      <td rowspan="2">jira</td>
      <td>issue_created</td>
      <td>
        <ul>
          <li>Clave del issue (ej: PROJ-101)</li>
          <li>Tipo de issue (Story, Bug, Task)</li>
          <li>Story points asignados</li>
        </ul>
      </td>
      <td><code>
      {"issue_key": "PROJ-101", "issue_type": "Story", "story_points": 5}
      </code></td>
    </tr>
    <tr>
      <td>issue_updated</td>
      <td>
        <ul>
          <li>Transición de estado (status_from, status_to)</li>
          <li>Tiempo de resolución (horas)</li>
          <li>Tiempo en estado bloqueado (horas)</li>
        </ul>
      </td>
      <td><code>
      {"issue_key": "PROJ-101", "status_from": "In Progress", "status_to": "Done", "resolution_time_hours": 6.5, "blocked_time_hours": 1.0}
      </code></td>
    </tr>
    <tr>
      <td rowspan="2"><b>Agente de red</b></td>
      <td rowspan="2">Monitoreo de estabilidad, disponibilidad y calidad del servicio (QoS)</td>
      <td rowspan="2">network</td>
      <td>interruption</td>
      <td>
        <ul>
          <li>Duración de la interrupción (segundos)</li>
          <li>Conteo de caídas detectadas</li>
        </ul>
      </td>
      <td><code>
      {"interruption_duration_seconds": 45, "interruption_count": 1}
      </code></td>
    </tr>
    <tr>
      <td>qos_measurement</td>
      <td>
        <ul>
          <li>Latencia media (ms)</li>
          <li>Velocidad de descarga y subida (Mbps)</li>
          <li>Pérdida de paquetes (%)</li>
        </ul>
      </td>
      <td><code>
      {"latency_ms": 24.5, "download_speed_mbps": 95.0, "upload_speed_mbps": 22.0, "packet_loss_percentage": 0.0}
      </code></td>
    </tr>
    <tr>
      <td><b>SonarQube</b></td>
      <td>Análisis estático de calidad, seguridad y cobertura en el PR</td>
      <td>sonarqube</td>
      <td>pull_request_quality</td>
      <td>
        <ul>
          <li>Cobertura de pruebas (%)</li>
          <li>Líneas duplicadas (%)</li>
          <li>Ratings de fiabilidad y seguridad (A - E)</li>
          <li>Deuda técnica estimada (min)</li>
        </ul>
      </td>
      <td><code>
      {"code_coverage_percentage": 84.5, "duplicated_lines_percentage": 1.1, "reliability_rating": "A", "security_rating": "A", "technical_debt_minutes": 20}
      </code></td>
    </tr>
  </tbody>
</table>

## Convenciones de Estructura de Payloads

1. Las fechas y marcas de tiempo deben estar en formato **ISO 8601** en formato UTC (ej: `2026-10-19T08:00:00Z`).
2. Los valores de las encuestas se mantienen en la escala original (1-5).

> <span style="color: red;"><b>IMPORTANTE:</b></span> Los eventos `commit` de GitHub y `issue_created` / `issue_updated` de Jira se validaron con datos reales (ver `integrations/`). Los eventos `pull_request` y `pull_request_review` están implementados según la documentación de GitHub y falta verificarlos con casos reales. Algunos campos quedan en `null` porque el origen no los entrega: `lines_added` y `lines_deleted` en `commit`, `is_first_attempt_approved` en `pull_request_review` y `blocked_time_hours` en `issue_updated`. `story_points` se llena en `issue_created` solo si la tarea ya tiene puntos al crearse; `issue_updated` incluye además `story_points` con el valor vigente. SonarQube aún no se ha validado, por lo que su estructura puede variar en versiones posteriores.
