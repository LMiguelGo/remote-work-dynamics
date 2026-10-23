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
