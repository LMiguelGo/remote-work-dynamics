// Constantes compartidas por el generador de datos y por el motor de puntaje.

const PERIODO = '2026-09';

const DIMENSIONES = ['S', 'P', 'A', 'C', 'E'];

const NOMBRE_DIMENSION = {
  S: 'Satisfaccion y bienestar',
  P: 'Rendimiento',
  A: 'Actividad',
  C: 'Comunicacion y colaboracion',
  E: 'Eficiencia y flujo',
};

// Rangos de referencia para llevar cada metrica cruda a una escala de 0 a 100.
const REFERENCIAS = {
  A_max: 40,
  C_max: 25,
  lead_min_h: 8,
  lead_max_h: 120,
};

// Dimension que se espera dominante en cada arquetipo, para senalar un posible desajuste de rol.
const ARQUETIPO_DIMENSION = {
  backend: 'A',
  analista: 'C',
  frontend: 'E',
  qa: 'P',
};

// Duracion de la jornada pactada por contrato, en horas. Sirve de base al tiempo extralaboral.
const HORAS_PACTADAS = 8;

// Umbrales ambientales con los que arranca cada empleado. Luego los ajusta a su gusto.
// La conexion solo tiene minimo, porque una calidad alta nunca es un problema.
const UMBRALES_DEFECTO = {
  temperatura: { minimo: 18, maximo: 27 },
  humedad: { minimo: 30, maximo: 70 },
  calidad_conexion: { minimo: 55, maximo: null },
};

// Cada dispositivo fisico se asocia a un empleado. Es el mapa que usa el suscriptor MQTT
// para saber a quien pertenece una lectura que llega sin usuario_id. El seed lo refleja en
// la tabla dispositivos; esto es el valor de arranque por si la tabla no lo tiene.
const DISPOSITIVOS = {
  ESP32_Wokwi: 4, // Juan Perez
};

// Intervalo de muestreo del monitoreo en tiempo real. Lo consume el polling del tablero.
// El gerente lo puede ajustar desde la configuracion de monitoreo.
const INTERVALO_MONITOREO_SEGUNDOS = 5;

// Diccionario de metricas y umbrales (optimo / precaucion / critico) por dimension SPACE.
// Es la referencia que define el equipo. El tablero lo muestra tal cual en la configuracion
// de monitoreo y lo usa para colorear los indicadores en semaforo.
const DICCIONARIO_UMBRALES = [
  { dimension: 'S', metrica: '% Tiempo extralaboral', optimo: '≤ 5%', precaucion: '5% - 15%', critico: '> 15%' },
  { dimension: 'S', metrica: 'Índice de ánimo (eNPS)', optimo: '≥ 4.0', precaucion: '3.0 - 3.9', critico: '< 3.0' },
  { dimension: 'S', metrica: 'Fatiga / riesgo burnout', optimo: '1.0 - 2.0', precaucion: '2.1 - 3.5', critico: '> 3.5' },
  { dimension: 'S', metrica: 'Percepción de herramientas', optimo: '≥ 4.0', precaucion: '3.0 - 3.9', critico: '< 3.0' },
  { dimension: 'S', metrica: 'Ruido ambiental (ESP32)', optimo: '< 50 dB', precaucion: '50 - 65 dB', critico: '> 65 dB' },
  { dimension: 'S', metrica: 'Temperatura (ESP32)', optimo: '20 - 24 °C', precaucion: '18-20 ó 24-26 °C', critico: '< 18 ó > 26 °C' },
  { dimension: 'S', metrica: 'Humedad (ESP32)', optimo: '40% - 60%', precaucion: '30-40 ó 60-70%', critico: '< 30 ó > 70%' },
  { dimension: 'P', metrica: 'Fiabilidad revisiones (PRs)', optimo: '≥ 80% al 1er intento', precaucion: '60% - 79%', critico: '< 60%' },
  { dimension: 'P', metrica: 'MTTR (reparación Jira)', optimo: '< 8 h laborales', precaucion: '8 - 24 h', critico: '> 24 h' },
  { dimension: 'P', metrica: 'Cobertura (code coverage)', optimo: '≥ 80%', precaucion: '60% - 79%', critico: '< 60%' },
  { dimension: 'P', metrica: 'Líneas duplicadas', optimo: '< 3%', precaucion: '3% - 5%', critico: '> 5%' },
  { dimension: 'P', metrica: 'Rating SonarQube (seg/conf)', optimo: 'Rating A', precaucion: 'Rating B – C', critico: 'Rating D – E' },
  { dimension: 'P', metrica: 'Deuda técnica (tiempo)', optimo: '< 8 h (≤ 1 día)', precaucion: '8 - 40 h', critico: '> 40 h' },
  { dimension: 'A', metrica: 'Story points completados', optimo: '± 15% del prom.', precaucion: 'Desviación 15% - 30%', critico: 'Desviación > 30%' },
  { dimension: 'A', metrica: 'Frecuencia commits/PRs', optimo: '≥ 1 cada 1-2 días', precaucion: '—', critico: '> 4 días sin actividad' },
  { dimension: 'C', metrica: 'Tiempo respuesta PRs', optimo: '< 12 h', precaucion: '12 - 24 h', critico: '> 24 h' },
  { dimension: 'C', metrica: 'Commits de documentación', optimo: '≥ 5%', precaucion: '2% - 4.9%', critico: '< 2%' },
  { dimension: 'C', metrica: 'Encuestas TCS / RII', optimo: '≥ 4.0', precaucion: '3.0 - 3.9', critico: '< 3.0' },
  { dimension: 'E', metrica: 'Lead time for changes', optimo: '< 2 días', precaucion: '2 - 5 días', critico: '> 5 días' },
  { dimension: 'E', metrica: 'Tiempo "bloqueado"', optimo: '< 10% del lead time', precaucion: '10% - 25%', critico: '> 25%' },
  { dimension: 'E', metrica: 'Latencia red local', optimo: '< 50 ms', precaucion: '50 - 150 ms', critico: '> 150 ms' },
  { dimension: 'E', metrica: 'Pérdida de paquetes', optimo: '< 1%', precaucion: '1% - 3%', critico: '> 3%' },
  { dimension: 'E', metrica: 'Percepción de flujo', optimo: '≥ 4.0', precaucion: '3.0 - 3.9', critico: '< 3.0' },
];

// Bandas numericas para pintar las franjas de alerta de los graficos de tiempo real.
// Salen del mismo diccionario. critico y precaucion marcan el fondo rojo y amarillo.
const BANDAS_GRAFICO = {
  temperatura: { optimo: [20, 24], precaucion: [18, 26], unidad: '°C' },
  calidad_conexion: { critico: 55, precaucion: 70, unidad: '/100' },
};

module.exports = {
  PERIODO,
  DIMENSIONES,
  NOMBRE_DIMENSION,
  REFERENCIAS,
  ARQUETIPO_DIMENSION,
  HORAS_PACTADAS,
  UMBRALES_DEFECTO,
  DISPOSITIVOS,
  INTERVALO_MONITOREO_SEGUNDOS,
  DICCIONARIO_UMBRALES,
  BANDAS_GRAFICO,
};
