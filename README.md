# 📡 Remote Work Dynamics

> **Infraestructura Telemática para el Análisis de Dinámicas de Trabajo Remoto**  
> *Proyecto Académico para la asignatura de Énfasis IV — Universidad del Cauca*

---

## 👥 Equipo de Trabajo y Asignación de Módulos

Para garantizar un desarrollo ordenado y libre de conflictos en Git (merge conflicts), el proyecto está dividido en módulos independientes donde cada integrante es responsable de su respectiva carpeta:

| Integrante | Rol / Especialidad | Módulo Principal | Responsabilidades Técnicas |
| :--- | :--- | :--- | :--- |
| **Karol** | Líder / Scrum Master | `docs/management/`<br>`.github/` | Gestión de backlog, revisión/aprobación de Pull Requests (PRs), plantillas de issues y seguimiento de sprints. |
| **Briyith** | Arquitecta Telemática | `docs/architecture/`<br>`deploy/` | Diagramación de arquitectura telemática, flujos de red, Docker Compose y topología del sistema. |
| **Layla** | Captura / Sensores | `apps/agent/`<br>`apps/edge-node/` | Agente de software en laptop (métricas no invasivas) y lectura del sensor ambiental BME280. |
| **Miguel** | Comunicaciones / Edge / MQTT | `apps/edge-node/`<br>`server/broker/` | Transmisión de eventos, configuración del Broker MQTT (Mosquitto/EMQX) y lógica Edge. |
| **Jose** | Backend / APIs | `server/api/`<br>`server/database/` | Desarrollo de API REST / WebSockets, persistencia en BD y controladores del servidor. |
| **Yulieth** | Analítica de Datos | `analytics/` | Procesamiento en bloques de 15 min, cálculo de tiempo de foco e integración con Jira/Trello/Asana. |
| **Angela** | UX / Dashboard / Ética | `apps/dashboard/`<br>`docs/ethics-privacy/` | Interfaz web para supervisor y empleado, y marco de privacidad (Privacy by Design). |

---

## 📁 Estructura del Repositorio

```text
remote-work-dynamics/
├── .github/                   # Plantillas de Issues/PRs y automatizaciones [Karol]
├── apps/                      # Aplicaciones ejecutables
│   ├── agent/                 # Captura de métricas en PC de empleado [Layla]
│   ├── dashboard/             # Panel web visualizador UX/UI [Angela]
│   └── edge-node/             # Firmware/Código para ESP32 + BME280 [Layla / Miguel]
├── server/                    # Servidor Central
│   ├── api/                   # API Backend REST & WebSockets [Jose]
│   ├── broker/                # Broker de mensajería MQTT [Miguel]
│   └── database/              # Modelos, esquemas y scripts de BD [Jose / Yulieth]
├── analytics/                 # Motor de Inteligencia y Analítica
│   ├── notebooks/             # Análisis exploratorio de datos de productividad [Yulieth]
│   ├── pipelines/             # Agregación por bloques de 15 min e integración Jira [Yulieth]
│   └── models/                # Lógica de cálculo de tiempo de foco continuo [Yulieth]
├── docs/                      # Documentación del Proyecto Académico
│   ├── architecture/          # Diagramas de red, secuencia y componentes [Briyith]
│   ├── ethics-privacy/        # Evaluación de impacto e indicadores no invasivos [Angela]
│   ├── management/            # Sprints, actas de reunión y backlog [Karol]
│   └── requirements/          # Historias de usuario y especificaciones [Karol / Briyith]
└── deploy/                    # Infraestructura y Despliegue
    ├── docker/                # Dockerfiles y docker-compose [Briyith / Miguel]
    └── scripts/               # Scripts de automatización e instalación [Briyith]
```

---

## 🚀 Guía de Clonación e Instalación

Para obtener una copia local del repositorio en tu equipo:

```bash
git clone https://github.com/LMiguelGo/remote-work-dynamics.git
cd remote-work-dynamics
```

---

## 🔄 Flujo de Trabajo en Git (Git Flow)

> ⚠️ **REGLA DE ORO:** Está strictly prohibido hacer `git push` directamente a la rama `main`. Toda contribución debe realizarse mediante ramas individuales (`feature/`) e integrarse a través de un **Pull Request (PR)**.

### Paso a Paso para Desarrollar una Tarea:

1. **Actualizar la rama `main` local:**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Crear tu rama de trabajo individual:**  
   Usa la convención de nombre `feature/tu_nombre-nombre_tarea`:
   ```bash
   # Ejemplo para Jose:
   git checkout -b feature/jose-api-autenticacion

   # Ejemplo para Layla:
   git checkout -b feature/layla-bme280-driver
   ```

3. **Trabajar en tu módulo y registrar cambios:**
   ```bash
   git add .
   git commit -m "feat: implementar controlador para recepción de eventos MQTT"
   ```

4. **Subir tu rama a GitHub:**
   ```bash
   git push origin feature/jose-api-autenticacion
   ```

5. **Crear el Pull Request (PR) en GitHub:**
   * Ve a la página del repositorio en GitHub.
   * Haz clic en el botón amarillo **"Compare & pull request"**.
   * Asigna a **Karol** o **Briyith** como revisoras (Reviewers).
   * Describe brevemente los cambios o funcionalidades agregadas.
   * Una vez aprobado el PR, presiona **"Merge pull request"** y elimina la rama remota.

---

## 💬 Estándar de Mensajes de Commit (Conventional Commits)

Usa prefijos claros para estructurar el historial de cambios:

* `feat:` Nueva funcionalidad (ej. `feat: agregar lectura del sensor BME280`)
* `fix:` Corrección de un error o bug (ej. `fix: corregir reconexión con el broker MQTT`)
* `docs:` Cambios en la documentación (ej. `docs: actualizar diagrama de secuencia del agente`)
* `refactor:` Reestructuración de código sin alterar su funcionamiento
* `chore:` Ajustes de configuración, dependencias o archivos auxiliares
