export type Role = 'empleado' | 'lider' | 'gerente';

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

export interface EmpleadoPanelData {
  usuario: User;
  ambiente: {
    temperatura: number | null;
    humedad: number | null;
    presion: number | null;
    estado: string;
    serieTemp: number[];
  };
  conexion: {
    calidad: number | null;
    estado: string;
    vpn: boolean;
  };
  alertas: Array<{
    id: number;
    tipo: string;
    mensaje: string;
    timestamp: string;
  }>;
  bienestar: {
    nivel: number;
    texto: string;
  };
  jornada: {
    estado: 'abierta' | 'cerrada';
    horasHoy: number | null;
    horasPactadas: number;
    extralaboralPct: number | null;
  };
  encuestaPendiente: boolean;
  umbrales: {
    temperatura: { minimo: number | null; maximo: number | null };
    humedad: { minimo: number | null; maximo: number | null };
    calidad_conexion: { minimo: number | null; maximo: number | null };
  };
  queSeCaptura: Array<{ fuente: string; tipo: string }>;
  capturaActiva: boolean;
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
