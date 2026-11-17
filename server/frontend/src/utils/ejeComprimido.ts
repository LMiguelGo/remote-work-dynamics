// Eje X de las gráficas de métricas con los periodos sin muestras comprimidos. El ancho de la gráfica se reparte entre
// los días (o semanas) que sí tienen muestras; un periodo largo sin ninguna queda como una franja angosta que dice desde
// cuándo y hasta cuándo no llegó nada. Así una pausa de un mes no aplasta los datos que sí existen.

const DIA_MS = 86400000;

// Un tramo del eje: con datos (proporcional al tiempo) o hueco (ancho fijo y angosto).
export interface TramoEje {
  hueco: boolean;
  t0: number; // ms
  t1: number; // ms
  x0: number;
  x1: number;
  desde?: string; // solo huecos: primer día sin muestras (YYYY-MM-DD)
  hasta?: string; // solo huecos: último día sin muestras
}

export interface EjeComprimido {
  tramos: TramoEje[];
  X: (t: number) => number;
  anchoUnidad: number; // ancho en el dibujo de un día (diaria) o una semana (semanal) en los tramos con datos
}

export interface OpcionesEje {
  x0: number; // borde izquierdo del área de dibujo
  ancho: number; // ancho del área de dibujo
  unidadMs: number; // un día o una semana
  huecoMinUnidades: number; // separación entre muestras desde la que el periodo vacío se comprime
  anchoHueco: number; // ancho de cada franja comprimida
  maxFraccionHuecos: number; // tope del ancho total de las franjas (por ejemplo 0.3)
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

// `centros`: instante de cada muestra, ordenado. `finMs`: instante del día de referencia (el eje llega hasta ahí aunque
// no haya muestra ese día). Entre dos instantes seguidos con `huecoMinUnidades` o más unidades de distancia, el periodo
// vacío se comprime.
export function ejeComprimido(centros: number[], finMs: number, opciones: OpcionesEje): EjeComprimido {
  // El hueco se mide contra el ritmo normal de la serie: una métrica que solo tiene muestra una vez por semana (por
  // ejemplo MTTR, que depende de que se resuelva un ticket) no debe mostrar cada semana como "sin muestras". Es hueco si
  // la pausa es al menos 3 veces la separación mediana entre sus muestras, y nunca menos que `huecoMinUnidades`.
  const separaciones = centros.slice(1).map((c, i) => (c - centros[i]) / opciones.unidadMs).sort((x, y) => x - y);
  // Con pocas muestras no hay ritmo que medir (con dos, la "separación habitual" sería el propio hueco).
  const mediana = separaciones.length >= 4 ? separaciones[Math.floor(separaciones.length / 2)] : 0;
  const o = { ...opciones, huecoMinUnidades: Math.max(opciones.huecoMinUnidades, 3 * mediana) };
  const medio = o.unidadMs / 2;
  const anclas = [...centros];
  if (anclas.length === 0 || finMs > anclas[anclas.length - 1]) anclas.push(finMs);

  // Tramos en el tiempo, antes de darles ancho.
  const base: Array<Omit<TramoEje, 'x0' | 'x1'>> = [];
  let t = anclas[0] - medio;
  for (let i = 0; i < anclas.length; i++) {
    const siguiente = anclas[i + 1];
    if (siguiente === undefined) {
      base.push({ hueco: false, t0: t, t1: anclas[i] + medio });
      break;
    }
    if ((siguiente - anclas[i]) / o.unidadMs >= o.huecoMinUnidades) {
      // Datos hasta media unidad después de la muestra; hueco hasta media unidad antes de la siguiente.
      base.push({ hueco: false, t0: t, t1: anclas[i] + medio });
      base.push({
        hueco: true,
        t0: anclas[i] + medio,
        t1: siguiente - medio,
        desde: iso(anclas[i] + o.unidadMs),
        hasta: iso(siguiente - (siguiente === finMs && !centros.includes(finMs) ? 0 : o.unidadMs)),
      });
      t = siguiente - medio;
    }
  }

  const nHuecos = base.filter((b) => b.hueco).length;
  const anchoHueco = nHuecos ? Math.min(o.anchoHueco, (o.ancho * o.maxFraccionHuecos) / nHuecos) : 0;
  const tiempoDatos = base.filter((b) => !b.hueco).reduce((s, b) => s + (b.t1 - b.t0), 0);
  const anchoDatos = o.ancho - anchoHueco * nHuecos;

  let x = o.x0;
  const tramos: TramoEje[] = base.map((b) => {
    const w = b.hueco ? anchoHueco : tiempoDatos > 0 ? ((b.t1 - b.t0) / tiempoDatos) * anchoDatos : anchoDatos;
    const tramo = { ...b, x0: x, x1: x + w };
    x += w;
    return tramo;
  });

  const X = (tt: number) => {
    const tr = tramos.find((r) => tt >= r.t0 && tt <= r.t1) ?? (tt < tramos[0].t0 ? tramos[0] : tramos[tramos.length - 1]);
    if (tr.t1 === tr.t0) return tr.x0;
    const f = Math.max(0, Math.min(1, (tt - tr.t0) / (tr.t1 - tr.t0)));
    return tr.x0 + f * (tr.x1 - tr.x0);
  };

  const unaUnidad = tiempoDatos > 0 ? (o.unidadMs / tiempoDatos) * anchoDatos : anchoDatos;
  return { tramos, X, anchoUnidad: unaUnidad };
}

export const UNIDAD_DIA_MS = DIA_MS;
export const UNIDAD_SEMANA_MS = 7 * DIA_MS;
