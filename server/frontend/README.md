# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

## Cambios de esta versión

Esta versión agrega el detalle de analítica por persona a las vistas de líder y gerente, con una gráfica por métrica. Todo lo demás (inicio de sesión, empleado, administración, operación) quedó como estaba. El acuerdo con el backend, la analítica y la base de datos está en [`docs/interoperabilidad.md`](../../docs/interoperabilidad.md).

### Agregado

| Qué | Dónde |
|---|---|
| Panel de detalle de una persona: pestañas Día y Semana, tarjetas por dimensión y detalle de la dimensión elegida | `src/components/analitica/DetallePersona.tsx` |
| Tarjeta de una métrica y su gráfica (valor con franjas de umbral, puntos coloreados por criticidad, tooltip y teclado) | `TarjetaMetrica.tsx`, `GraficaMetrica.tsx` |
| Correlaciones entre métricas | `Correlaciones.tsx` |
| Conclusión al final del detalle: qué dimensiones se mueven juntas (lectura del LLM de la analítica, `interpretacion`; sin ella la sección no aparece; sin matriz de calor) | `LecturaDimensiones.tsx` |
| Fechas, formato de valores, colores y orden de las correlaciones | `src/utils/analitica.ts` |
| Tipos de la respuesta del backend (`AnaliticaPersona` y sus partes) | `src/types/index.ts` |
| Estilos del panel (clases `an-*`) | `src/index.css` |

### Cambiado

- **`LiderView`:** al tocar la fila de un integrante en "Actividad general del equipo", ya no se ve el listado plano de dimensiones y métricas con la línea de cobertura: se ve su detalle (`DetallePersona`). La pantalla inicial queda solo con resumen, métricas agregadas, actividad general y conectividad.
- **`GerenteView`:** la tabla del equipo abierto ahora tiene filas que se abren, igual que la del líder.
- **`index.css`:** dos reglas generales. `.grid > * { min-width: 0 }` y `.tablewrap { container-type: inline-size }` evitan que una tabla ancha ensanche toda la página en pantallas pequeñas (la tabla se desplaza por dentro). Afectan a todas las tarjetas y tablas.

### Sigue igual

- `App.tsx`, el cliente de la API (`services/api.ts`), el contexto de sesión, el login, el cambio de clave, `TopBar`, `nginx` y el `Dockerfile`.
- Las vistas de empleado, administración y operación.
- Sin dependencias nuevas.

### Qué dibuja y qué no

El frontend dibuja lo que entrega el backend y no calcula nada: ni puntajes, ni criticidades, ni promedios de dimensión, ni correlaciones. Muestra el puntaje de cada dimensión (0 a 10) y el nivel de cada métrica, pero **no muestra los puntos que suma cada métrica**: el backend los sigue entregando (`normalized_value`) y quedan disponibles. El texto de cada correlación es el `mensaje` tal como llega; un cambio de texto en la analítica se ve sin tocar el frontend. Un valor de `estado` de correlación que no conoce se muestra sin énfasis. Si cambian nombres de campos o el formato de `serie`, hay que actualizar `types/index.ts` y `Correlaciones.tsx`.

El backend ya entrega la correlación entre dimensiones (`correlaciones.dimensiones`), pero esta versión no la dibuja.

### Problemas conocidos (anteriores a estos cambios)

- **La vista de Operación del gerente se queda en "Cargando operación...".** El backend responde bien las tres rutas que usa (`/api/operacion/dispositivos`, `/conectividad`, `/config`) y el archivo de la vista no cambió; ocurre también con el frontend original de la rama `cambios-frontend`. Sin diagnosticar.
- **El linter (`npm run lint`) marca 6 errores**, todos anteriores: cuatro por llamar a funciones que cambian el estado dentro de un efecto (`EmpleadoView`, `GerenteView`, `LiderView`, `OperacionView`) y dos por `any` en `src/types/index.ts` (`ConfigOperacion`). El código nuevo no agrega ninguno.
- El frontend solo tiene tema claro.

## Detalle de analítica por persona: cómo funciona

En la tabla de actividad del equipo (líder) y en la del equipo abierto (gerente), tocar una fila abre el detalle de esa persona. El frontend no calcula nada: dibuja lo que entrega el backend.

1. Al abrir la fila se ven sus cinco dimensiones, con su puntaje, su criticidad y la variación frente al día anterior (pestaña Día) o a la semana anterior (pestaña Semana).
2. Al elegir una dimensión se despliegan sus métricas, una gráfica por cada una, y las correlaciones que la involucran. Volver a pulsarla la cierra.

- Datos: `GET /api/equipo/integrantes/:id/analitica` (líder) y `GET /api/organizacion/integrantes/:id/analitica` (gerente). La estructura de la respuesta está en el README del backend y tipada en `src/types/index.ts` (`AnaliticaPersona`). Se pide al abrir la fila.
- Componentes, en `src/components/analitica/`:
  - `DetallePersona`: pestañas Día y Semana, tarjetas por dimensión y detalle de la dimensión elegida.
  - `TarjetaMetrica` y `GraficaMetrica`: el valor real con franjas de umbral, los puntos coloreados por criticidad y el tooltip con la fecha, el valor y el nivel (con el cursor o con las flechas del teclado).
  - `Correlaciones`: tarjetas de correlación entre métricas. Dibuja el `mensaje` y los números tal como llegan; un estado desconocido se muestra sin énfasis.
- Las franjas y la escala de cada métrica vienen del catálogo de la analítica; si un valor las supera, el eje se amplía.
- La pantalla inicial del líder solo trae resumen, métricas agregadas, actividad general y conectividad.
- El empleado no tiene esta vista: nadie ve sus propias métricas.
