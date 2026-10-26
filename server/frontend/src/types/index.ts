export type Role = 'admin' | 'gerente' | 'lider' | 'empleado';

// Usuario de la sesión, tal como lo entrega POST /api/login.
export interface Usuario {
  id: number;
  username: string;
  full_name: string | null;
  rol: Role;
}

// Elemento de GET /api/usuarios-demo (solo existe en desarrollo).
export interface UsuarioDemo {
  username: string;
  full_name: string | null;
  role_name: Role;
}

// LEGACY: forma del prototipo. Solo la usan los tipos de abajo (panel, equipo,
// organización), que se reemplazan cuando se adapten esas vistas a la API nueva.
export interface User {
  id: string;
  nombre: string;
  rol: Role;
  arquetipo?: string;
}

export type DimensionKey = 'S' | 'P' | 'A' | 'C' | 'E';

export const DIMN: Record<DimensionKey, string> = {
  S: 'Satisfacción y bienestar',
  P: 'Rendimiento',
  A: 'Actividad',
  C: 'Comunicación y colaboración',
  E: 'Eficiencia y flujo',
};

export const ORDEN_DIMENSIONES: DimensionKey[] = ['S', 'P', 'A', 'C', 'E'];

export type SemaphoreLevel = 'ok' | 'warn' | 'bad' | 'none';

export interface DimensionesMap {
  S: number;
  P: number;
  A: number;
  C: number;
  E: number;
}

// --- Panel del empleado: respuesta de GET /api/mi-panel ---

export interface AlertaEmpleado {
  id: number | string;
  user_id: number | string;
  alert_type: string;
  message: string;
  severity: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface RangoUmbral {
  min: number;
  max: number;
}

// Claves tal como las guarda el backend (y como espera PUT /api/umbrales).
export interface UmbralesAmbientales {
  temperatura_c: RangoUmbral;
  humedad_pct: RangoUmbral;
  ruido_db: RangoUmbral;
}

// Última lectura del sensor: el payload del evento aplanado junto con su hora.
export interface LecturaAmbiente {
  time: string;
  temperature?: number | null;
  humidity?: number | null;
  noise_level?: number | null;
}

export interface EmpleadoPanelData {
  usuario: { id: number; rol: Role };
  capture_active: boolean | null;
  jornada: { estado: string; start_time: string | null };
  ambiente: {
    estado: string;
    ultima: LecturaAmbiente | null;
    umbrales: UmbralesAmbientales | null;
  };
  conexion: { estado: string };
  alertas: AlertaEmpleado[];
  encuestaDiariaPendiente: boolean;
  encuestaSemanalPendiente: boolean;
}

// --- Tablero del líder: respuesta de GET /api/equipo ---
// Los puntajes vienen en escala 0-10 y la criticidad como texto
// ('optimo' | 'precaucion' | 'critico'). Las 5 dimensiones llegan siempre;
// sin datos, el puntaje es null.

export interface PeriodoAnalisis {
  start_date: string | null;
  end_date: string | null;
}

export interface MetricaAnalisis {
  metric_name: string;
  raw_value: number | null;
  normalized_value: number | null;
  criticality: string | null;
  periodo: PeriodoAnalisis;
}

export interface DimensionAnalisis {
  dimension: DimensionKey;
  frequency: string | null;
  periodo: PeriodoAnalisis;
  normalized_score: number | null;
  criticality_status: string | null;
  metricas: MetricaAnalisis[];
}

export interface PersonaBasica {
  id: number;
  username: string;
  full_name: string | null;
}

export interface IntegranteLider {
  usuario: PersonaBasica;
  dimensiones: DimensionAnalisis[];
}

export interface AgregadoDimension {
  dimension: DimensionKey;
  normalized_score: number;
  integrantes_con_dato: number;
}

export interface EquipoLiderData {
  lider: PersonaBasica | null;
  integrantes: IntegranteLider[];
  equipo: { agregado: AgregadoDimension[] | null };
}

// --- Tablero del gerente: respuesta de GET /api/organizacion ---
// Cada equipo trae la misma forma que /api/equipo (líder, integrantes y agregado).

export interface OrganizacionGerenteData {
  gerente: PersonaBasica | null;
  equipos: EquipoLiderData[];
}

// --- Operación del gerente: GET /api/operacion/* ---

export interface DispositivoEstado {
  id: number;
  source_type: string;
  identifier: string;
  dueno: { username: string | null; full_name: string | null };
  estado: string; // 'en vivo' | 'con historial' | 'sin datos'
  ultima_actividad: string | null;
}

export interface RespuestaDispositivos {
  generado_en: string;
  umbral_en_vivo_segundos: number;
  dispositivos: DispositivoEstado[];
}

export interface QosRed {
  latency_ms: number | null;
  download_speed_mbps: number | null;
  upload_speed_mbps: number | null;
  packet_loss_percentage: number | null;
  time: string | null;
}

export interface InterrupcionRed {
  interruption_duration_seconds: number | null;
  interruption_count: number | null;
  time: string | null;
}

export interface FuenteRed {
  id: number;
  identifier: string;
  dueno: { username: string | null; full_name: string | null };
  estado: string; // 'con datos' | 'sin datos'
  qos: QosRed | null;
  interrupcion: InterrupcionRed | null;
}

export interface RespuestaConectividad {
  fuentes: FuenteRed[];
}

export interface ConfigOperacionBackend {
  umbral_en_vivo_segundos: number;
  ventana_retencion_dias: number;
}

export interface RespuestaConfigOperacion {
  config: ConfigOperacionBackend;
  persistencia: string;
}

export interface IntegranteEquipo {
  usuario: User;
  compuesto: number;
  dimensiones: DimensionesMap;
  contexto: {
    temperatura: number | null;
    calidad_conexion: number | null;
    extralaboral_pct: number | null;
  };
  banderas: string[];
  cobertura: number;
}

export interface LiderEquipoData {
  lider: { id: string; nombre: string };
  metricaLider: number;
  agregadoDimensiones: DimensionesMap;
  integrantes: IntegranteEquipo[];
  serieAnimo: Array<{
    fecha: string;
    fatiga: number;
    enps: number;
    flujo: number;
  }>;
  preguntasParaElLider: Array<{
    integrante: string;
    preguntas: string[];
  }>;
}

export interface EquipoOrganizacion {
  lider: { id: string; nombre: string };
  metricaLider: number;
  tamano: number;
  agregadoDimensiones: DimensionesMap;
  preguntasAbiertas: number;
}

export interface OrganizacionData {
  gerente: { id: string; nombre: string };
  metricaOrganizacion: number;
  equipos: EquipoOrganizacion[];
}

export interface DispositivoOperacion {
  dispositivo: string;
  descripcion: string;
  asignadoA: string;
  estado: 'en vivo' | 'con historial' | 'inactivo';
  ultimaLectura: string | null;
  lecturas: {
    temperatura?: { valor: number | null; ts: string };
    humedad?: { valor: number | null; ts: string };
    ruido?: { valor: number | null; ts: string };
    calidad_conexion?: { valor: number | null; ts: string };
  };
}

export interface ConectividadOperacion {
  bandas: {
    conexion: { optimo: number; precaucion: number; critico: number };
    temperatura: { optimo: [number, number]; precaucion: [number, number] };
  };
  serieConexion: Array<{ ts: string; valor: number }>;
  serieTemperatura: Array<{ ts: string; valor: number }>;
  eventos: Array<{ ts: string; usuario: string; tipo: 'conexion' | 'sensor'; mensaje: string }>;
}

export interface SaludOperacion {
  estadoBroker: string;
  suscriptorMqttActivo: boolean;
  conectores: Array<{ nombre: string; estado: string; ultimaIngesta: string | null }>;
}

export interface ConfigOperacion {
  periodo: { inicio: string; fin: string };
  intervaloMuestreoSeg: number;
  diccionario: Record<string, any>;
  umbralesReferencia: Record<string, any>;
}

// --- Detalle de analítica de una persona ---
// GET /api/equipo/integrantes/:id/analitica (líder) y GET /api/organizacion/integrantes/:id/analitica (gerente).
// Todo viene calculado por la analítica y leído por el backend: aquí solo se dibuja. Puntajes en escala 0-10.

export type EstadoCriticidad = 'optimo' | 'precaucion' | 'critico';
export type FrecuenciaMetrica = 'diaria' | 'semanal';
// Qué es mejor en la métrica: menos, más, estar dentro de un rango, la letra A, o compararse con sus sprints anteriores.
export type DireccionMetrica = 'menos' | 'mas' | 'rango' | 'letra' | 'relativa';

export interface PuntoDimension {
  start_date: string;
  end_date: string;
  normalized_score: number | null;
  criticality_status: EstadoCriticidad | null;
}

export interface UltimoDimension extends PuntoDimension {
  metricas_medidas: number; // métricas que aportaron a este puntaje
  metricas_total: number; // métricas que tiene la dimensión en esta frecuencia
}

export interface BloqueDimension {
  ultimo: UltimoDimension;
  anterior: PuntoDimension | null;
  variacion: number | null; // ultimo - anterior, un decimal
  historial: PuntoDimension[]; // de más antiguo a más reciente
  // Solo en `diaria`: el promedio de la semana de los puntos diarios (para la vista de la semana).
  promedios_semanales?: PuntoDimension[];
}

export interface PuntoMetrica {
  start_date: string;
  end_date: string;
  raw_value: number | null;
  normalized_value: number | null;
  criticality: EstadoCriticidad | null;
}

export interface FranjaMetrica {
  desde: number;
  hasta: number;
  estado: EstadoCriticidad;
}

export interface MetricaDetalle {
  metric_name: string;
  nombre: string;
  unidad: string;
  formato: string; // texto con {v}, por ejemplo "{v} ms"
  decimales: number;
  mejor: DireccionMetrica;
  frecuencia: FrecuenciaMetrica;
  escala: { min: number; max: number } | null; // sugerida; si un valor la supera se amplía
  franjas: FranjaMetrica[] | null; // null en las métricas por sprint (su puntaje es relativo)
  umbrales_relativos?: { optimo_hasta_pct: number; precaucion_hasta_pct: number };
  ultimo: PuntoMetrica | null;
  historial: PuntoMetrica[]; // de más antiguo a más reciente
}

export interface DimensionDetalle {
  dimension: DimensionKey;
  nombre: string;
  diaria: BloqueDimension | null;
  semanal: BloqueDimension | null;
  metricas: MetricaDetalle[];
}

export type EstadoCorrelacion =
  | 'diagnostico'
  | 'patron_distinto'
  | 'no_significativa'
  | 'datos_insuficientes';

export interface EstadoMetricaCorrelacion {
  valor: number;
  habitual: number | null;
  criticidad: string;
}

export interface CorrelacionMetricas {
  usuario_id: number;
  id: number;
  dimension_a: DimensionKey;
  dimension_b: DimensionKey;
  contexto: string;
  metrica_a: string;
  metrica_b: string;
  relacion_esperada: string;
  periodo: 'dia' | 'semana';
  periodo_referencia: string | null;
  a: EstadoMetricaCorrelacion | null;
  b: EstadoMetricaCorrelacion | null;
  serie: Array<[string, number, number]>; // [periodo, valor de A, valor de B]
  n_muestras: number;
  coeficiente: number | null;
  fuerza: string;
  significativa: boolean;
  estado: EstadoCorrelacion;
  mensaje: string; // el texto que se imprime siempre
  aviso: string | null;
}

export interface CorrelacionDimensiones {
  usuario_id: number;
  dimension_a: DimensionKey;
  dimension_b: DimensionKey;
  periodo: string;
  n_muestras: number;
  coeficiente: number | null;
  fuerza: string;
  significativa: boolean;
}

// Lectura de conjunto de las correlaciones entre dimensiones, redactada por la analítica. `mensaje` es el texto que se muestra.
export interface ConclusionDimensiones {
  usuario_id: number;
  estado: 'relacion' | 'sin_relacion' | 'datos_insuficientes';
  semanas: number;
  mensaje: string; // texto de plantilla de la analítica; no se muestra
  interpretacion: string | null; // lectura del LLM; sin ella no se muestra la sección
  aviso: string;
  relaciones: { dimension_a: DimensionKey; dimension_b: DimensionKey; coeficiente: number; fuerza: string; sentido: 'juntas' | 'contrarias' }[];
  sin_datos: DimensionKey[];
}

export interface CorrelacionesPersona {
  calculado_en: string;
  metricas: CorrelacionMetricas[];
  dimensiones: CorrelacionDimensiones[];
  conclusion_dimensiones: ConclusionDimensiones | null;
}

export interface AnaliticaPersona {
  usuario: PersonaBasica | null;
  referencia: string | null; // último día con resultados de al menos dos dimensiones
  ventana: { dias: number; semanas: number };
  catalogo_version: string | null;
  dimensiones: DimensionDetalle[]; // siempre las cinco
  correlaciones: CorrelacionesPersona | null; // null si la analítica no respondió
}
