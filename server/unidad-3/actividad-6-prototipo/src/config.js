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

module.exports = { PERIODO, DIMENSIONES, NOMBRE_DIMENSION, REFERENCIAS, ARQUETIPO_DIMENSION };
