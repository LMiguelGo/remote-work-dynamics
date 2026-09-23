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

module.exports = {
  PERIODO,
  DIMENSIONES,
  NOMBRE_DIMENSION,
  REFERENCIAS,
  ARQUETIPO_DIMENSION,
  HORAS_PACTADAS,
  UMBRALES_DEFECTO,
};
