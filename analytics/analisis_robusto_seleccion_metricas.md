# Análisis Robusto de la Selección de Métricas — Sistema de Monitoreo de Productividad en Trabajo Remoto

**Fecha:** Agosto de 2026

## Parte 1 — Por qué todas las métricas iniciales son recomendadas y factibles para conocer la productividad en trabajo remoto

Antes de aplicar cualquier filtro ético o de alcance, hay que sustentar por qué el conjunto completo de once métricas propuestas en el Cuadro 1 de la actividad 6 tiene sentido como punto de partida. "Recomendada y factible" aquí se entiende en dos capas distintas, que conviene no mezclar:

- **Factibilidad analítica/conceptual:** ¿la métrica captura realmente una señal relacionada con productividad, y no solo con actividad?
- **Factibilidad operativa:** ¿existe una fuente de datos accesible, de bajo costo de implementación, que permita obtenerla sin construir infraestructura nueva ni invasiva?

Las once métricas cumplen la primera capa — todas están conceptualmente bien fundamentadas —, y la mayoría también cumple la segunda, porque reutilizan sistemas que la organización ya opera (Jira, VPN, SSO, Teams/Zoom, IoT). Un marco teórico útil para ordenar esto es el **modelo de Demandas y Recursos Laborales (JD-R, Bakker & Demerouti, 2007)**, ampliamente usado en psicología organizacional: el desempeño sostenible de un trabajador depende del balance entre las *demandas* de su trabajo (carga, ritmo, exigencia) y los *recursos* disponibles para afrontarlas (herramientas, autonomía, ambiente, apoyo social), y ese balance predice tanto el resultado (output) como el riesgo de agotamiento. Bajo ese lente, cada una de las once métricas propuestas cae naturalmente en una de tres categorías — **Resultado, Recurso/Esfuerzo, o Demanda/Contexto** — lo cual demuestra que la lista inicial no fue una colección arbitraria de ideas, sino un barrido razonablemente completo del espacio de señales relevantes.

### 1.1 Métricas de Resultado (Output)

**% de actividades realizadas.** Es la métrica con mayor validez de las once: se apoya en una fuente ya validada por la organización (el gestor de tareas), no requiere instrumentación nueva, y mide directamente si se entregó lo comprometido. Es factible tanto analítica como operativamente porque el dato de estado de una tarea (Done/No Done) ya existe y solo requiere consultarse vía API.

### 1.2 Métricas de Recurso / Esfuerzo (Insumo digital validado)

**Tiempo de conectividad durante el día laboral (VPN).** Mide la disponibilidad real del trabajador reutilizando infraestructura de red que la empresa ya centraliza; es de las más baratas de implementar porque no exige instalar nada nuevo en el equipo del empleado.

**Número de plataformas digitales / Dominios.** Aprovecha datos nativos de los sistemas de acceso (SSO) o del propio agente de navegación, permitiendo establecer un "rango de uso normal" de herramientas de trabajo. Es factible porque los logs de autenticación y las APIs de navegación web ya existen; solo se necesita clasificarlos.

**Tiempo de foco continuo.** Es la métrica que mejor resuelve, en teoría, la distinción entre "estar activo" y "ser productivo", porque mide permanencia sostenida en una categoría laboral y no solo eventos puntuales. Es factible porque el agente ActivityWatch es open-source y gratuito, aunque —como se explica en la Parte 2— exige instalación y mantenimiento propio, a diferencia de las métricas que reutilizan infraestructura existente.

**Frecuencia de micrófono abierto por reunión.** Aporta una señal de participación activa en espacios colaborativos sin necesidad de grabar audio; es factible porque Microsoft Graph API y la API de Zoom ya exponen ese evento como metadato booleano (mic_on/mic_off).

**Niveles de interacción entre equipos.** Mide colaboración a nivel de red organizacional (quién trabaja con quién, con qué intensidad), lo cual es valioso para detectar cuellos de botella o silos que afectan la productividad colectiva. Es analíticamente sólida —de hecho incorpora una salvaguarda de anonimato (filtro N<5) poco común en sistemas de este tipo—, aunque su factibilidad operativa es más baja por el esfuerzo de ingeniería que implica.

**% de actividad en bloques de horas específicos.** Más que una métrica en sí misma, es una **estrategia de agregación** aplicable a los datos ya capturados por las demás métricas (agrupar en bloques de 15 minutos en vez de eventos individuales). Es completamente factible porque no añade una fuente de datos nueva, solo una forma de resumir las existentes, y de hecho es la técnica que hace viables, desde el punto de vista de privacidad, a casi todas las demás.

### 1.3 Métricas de Contexto / Demanda (condiciones y carga)

**% de humedad del aire (Confort Ambiental).** Es un dato puramente físico y ambiental —no conductual ni identificable—, por lo que tiene la barrera de entrada ética más baja de las once. Es factible con hardware de bajo costo (ESP32 + BME280), ampliamente documentado y económico.

**Nivel de estrés de la persona.** Es la métrica con mayor potencial explicativo sobre por qué cae el desempeño (carga percibida de la jornada), pero también la de mayor sensibilidad, al tratarse de un dato biométrico/fisiológico. Sigue siendo "recomendable" analíticamente —el modelo JD-R la ubicaría como el indicador más directo de acumulación de demandas—, pero su factibilidad operativa depende enteramente de que exista consentimiento explícito (opt-in), por lo que no puede desplegarse en un esquema de captura por defecto.

### 1.4 Métricas descartadas: recomendadas en la ideación, inviables en la operación

**Análisis con IA de captura de video** y **captura de pulsaciones de teclado** merecen un tratamiento aparte porque ilustran el límite del criterio de "factibilidad": ambas son perfectamente factibles en el sentido técnico —existen librerías de reconocimiento facial y de keylogging maduras y baratas de implementar— y ambas responden a una lógica analítica reconocible (el contacto visual se asocia tradicionalmente con atención; la interacción con teclado mide interactividad directa). El problema no es la validez conceptual ni la viabilidad técnica: es que ninguna mitigación de privacidad reduce el riesgo lo suficiente, porque procesan datos biométricos (rostro) o contenido literal escrito (texto de teclado), categorías que tanto el RGPD (dato biométrico, Art. 9) como la Ley 1581 de 2012 en Colombia (dato sensible) tratan con el máximo nivel de protección. Aquí la "factibilidad" técnica queda anulada por la infactibilidad legal/ética — un trade-off que no se resuelve con mejor ingeniería, sino que exige excluir la métrica por completo.

Esta distinción es clave para la Parte 2: el filtro que redujo once métricas a nueve fue un **filtro de barrera dura** (biometría/contenido = descarte automático, sin importar el valor analítico), mientras que el filtro que redujo nueve a cuatro fue un **filtro de eficiencia y parsimonia** entre opciones que ya habían superado la barrera ética.

---

## Parte 2 — Por qué solo 4 métricas quedaron en el sistema final

### 2.1 El principio: Triangulación No Invasiva de la Productividad

La productividad en trabajo remoto no puede inferirse de una sola variable sin caer en sesgo, y tampoco necesita nueve variables para dejar de estar sesgada — necesita **la combinación mínima que cubra los vértices verdaderamente independientes del fenómeno**. El sistema final retiene exactamente tres vértices, con cuatro métricas:

1. **El Contexto — Confort Ambiental (BME280):** antes de atribuir una caída de desempeño a la falta de compromiso del trabajador, el sistema necesita poder descartar una causa externa (por ejemplo, 30°C en la habitación). Es una métrica de empatía operativa: protege al empleado de ser evaluado injustamente por condiciones que no controla.
2. **El Insumo / Esfuerzo — Conectividad VPN y Dominios Laborales:** miden presencia digital validada. La VPN confirma que el empleado está dentro de la jornada y, al mismo tiempo, sirve de alerta temprana de sobretiempo/burnout; el filtrado de dominios valida que ese tiempo conectado se invierte en herramientas pertinentes al rol. Ambas se obtienen de infraestructura ya existente — bajo esfuerzo, alto impacto.
3. **El Resultado — % de Actividades Realizadas:** es el ancla de la productividad real. Estar conectado e interactuando con plataformas no significa nada sin entregables; al cruzar el Insumo con el Resultado, se desmitifica la idea de que "estar tecleando todo el día" equivale a ser productivo.

### 2.2 Por qué las otras cinco métricas aprobadas no llegaron al conjunto final

Que una métrica haya superado el filtro ético no la hace automáticamente necesaria en la versión final del sistema. De las nueve métricas aprobadas o condicionadas, cinco quedaron fuera del núcleo de 4 — no por invalidez, sino por razones específicas de parsimonia, redundancia o madurez operativa:

**Tiempo de foco continuo — excluida por redundancia de vértice y costo de despliegue.** Conceptualmente es excelente, pero mide esencialmente lo mismo que Dominios Laborales: cómo se distribuye la atención digital durante la jornada. Incluir ambas no añadiría un vértice nuevo a la triangulación, solo duplicaría el vértice de "Insumo/Esfuerzo" con una fuente de datos que, a diferencia de VPN y SSO, exige instalar y mantener un agente nuevo (ActivityWatch) y un diccionario de clasificación por regex en cada equipo — mayor esfuerzo de implementación para una señal parcialmente redundante.

**Frecuencia de micrófono abierto por reunión — excluida por alcance limitado y solapamiento.** Solo aporta señal durante el subconjunto de la jornada en que hay reuniones, y conceptualmente es otra forma de medir "esfuerzo/participación digital", vértice que Dominios y VPN ya cubren de forma más continua y con menor integración técnica (requeriría conectar Microsoft Graph API y/o Zoom API específicamente para este fin).

**% de actividad en bloques de horas específicos — no es una métrica final porque es un método, no un vértice.** Como se señaló en la Parte 1, esta es la técnica de agregación temporal que ya se aplica dentro de las cuatro métricas finales (todas se agrupan en bloques de 15 minutos); no representa una dimensión adicional de productividad, sino la forma en que se reportan las demás.

**Niveles de interacción entre equipos — pospuesta por esfuerzo técnico, no descartada.** Es la única de las cinco que el propio análisis inicial reconoce como aprobada éticamente (incluye el filtro de anonimato N<5), pero que exige consultas SQL agregadas sobre un modelo relacional completo (Jira + calendarios de Teams) y el diseño de una matriz de cohesión — un nivel de ingeniería sustancialmente mayor al de simplemente leer logs de VPN o SSO. Queda como candidata natural para una segunda fase del sistema, una vez esté validado el núcleo de 4.

**Nivel de estrés de la persona — condicionada a consentimiento explícito, no lista para un sistema "por defecto".** Es, bajo el modelo JD-R, la métrica más directamente relacionada con el desgaste del trabajador, pero al ser un dato biométrico/fisiológico altamente sensible requiere una capa de consentimiento opt-in que el sistema base (diseñado para operar sin fricción y sin depender de que cada empleado accione algo) todavía no tiene construida. No se descarta por falta de valor, sino porque su despliegue responsable exige un mecanismo de gobernanza (consentimiento, revocación, alcance de uso) que está fuera del alcance del MVP.

### 2.3 Síntesis del criterio de reducción

En conjunto, la reducción de 11 a 9 metrías respondió a una **barrera ética dura** (datos biométricos identificables o contenido literal = descarte, sin excepción), y la reducción de 9 a 4 respondió a un **criterio de eficiencia analítica**: quedarse con la combinación mínima de métricas que cubre los tres vértices no redundantes del desempeño contexto, esfuerzo y resultado.

### Fuentes citadas

- [Bakker, A. B., & Demerouti, E. (2007). *The Job Demands-Resources model: State of the art*. Journal of Managerial Psychology, 22(3), 309-328.](https://www.emerald.com/jmp/article/22/3/309/236386/The-Job-Demands-Resources-model-state-of-the-art)
