# Cambios del backend para el frontend (guía para Angela)

El backend pasó de SQLite a PostgreSQL con TimescaleDB y se reescribió en capas. La API se diseñó limpia desde el modelo nuevo, sin atarse a la forma del frontend anterior. Por eso el frontend necesita ajustes. Este documento reúne todo lo que cambia y lo que hay que hacer, incluida la seguridad.

La forma exacta de cada respuesta está en `server/backend/README.md`. Aquí va lo que impacta al frontend.

## 1. Autenticación y sesión

- **Login.** `POST /api/login` con el cuerpo `{ "username": "...", "clave": "..." }`. Antes el campo podía llamarse distinto. Responde `{ token, usuario, debe_cambiar_clave }`. El `usuario` trae `{ id, username, full_name, rol }`.
- **Token.** Es un JWT. Se manda en cada petición protegida en la cabecera `Authorization: Bearer <token>`. Caduca a las ocho horas. Si el backend responde `401`, la sesión venció o es inválida y hay que volver al login.
- **Roles.** Ahora son cuatro: `admin`, `gerente`, `lider`, `empleado`. El `admin` es el administrador del sistema, una figura técnica que crea cuentas, distinto del gerente.
- **Selector de usuarios de la demo.** `GET /api/usuarios-demo` ahora devuelve `{ username, full_name, role_name }` por usuario. El frontend viejo esperaba otros nombres de campo, por eso no pintaba los nombres. Además ese endpoint solo existe en desarrollo, en producción responde `404`, así que no se debe depender de él para algo real.
- **Claves.** Ya no hay una clave compartida. Cada usuario tiene la suya. En la demo las claves las genera el seed y quedan en un archivo del contenedor del backend.

## 2. Cambio obligatorio de clave (nuevo flujo)

Cuando el administrador crea una cuenta, entrega una clave temporal y el usuario debe cambiarla en el primer ingreso. El frontend tiene que manejar esto:

- Al iniciar sesión, si la respuesta trae `debe_cambiar_clave: true`, hay que llevar a una pantalla de cambio de clave antes de dejar usar el resto.
- Mientras no se cambie, cualquier ruta de negocio responde `403` con el cuerpo `{ "codigo": "debe_cambiar_clave" }`. Si el frontend ve ese código, debe redirigir a la pantalla de cambio, no mostrar un error cualquiera.
- **Cambio de clave.** `POST /api/cambiar-clave` con `{ "clave_actual": "...", "clave_nueva": "..." }`. Responde `200` con un `token` nuevo, que reemplaza al anterior. Si la clave actual es incorrecta responde `401`, y si la nueva no cumple la política responde `400` con `detalles`.
- **Política de clave nueva.** Mínimo doce caracteres, se admiten frases largas, se rechazan las claves comunes. Conviene mostrar estas reglas en la pantalla de cambio y validar también del lado del frontend para avisar antes, aunque la validación que manda es la del backend.

## 3. Pantallas del administrador (nuevas)

Solo para el rol `admin`:

- `POST /api/usuarios` con `{ username, full_name, rol, team_id }` crea una cuenta y devuelve la clave temporal una sola vez, para entregarla. El `rol` es uno de los cuatro.
- `POST /api/usuarios/:id/restablecer-clave` genera una clave temporal nueva para una cuenta.

Si el equipo decide que el administrador tenga su propia vista, estas son sus acciones. Si no, pueden quedar para una fase siguiente.

## 4. Endpoints por rol y formas de respuesta

Las rutas y qué ve cada rol:

| Rol | Rutas principales |
|---|---|
| Empleado | `GET /api/mi-panel`, `POST /api/jornada/iniciar`, `POST /api/jornada/finalizar`, `POST /api/encuesta-diaria`, `GET /api/encuesta-semanal/estado`, `POST /api/encuesta-semanal`, `GET /api/umbrales`, `PUT /api/umbrales` |
| Líder | `GET /api/equipo`, `GET /api/equipo/conectividad` |
| Gerente | `GET /api/organizacion`, `GET /api/organizacion/equipo/:liderId`, `GET /api/operacion/dispositivos`, `GET /api/operacion/conectividad`, `GET /api/operacion/config`, `PUT /api/operacion/config` |

Las formas de respuesta cambiaron respecto al prototipo. Los puntos clave:

- Los nombres de campo están en el modelo nuevo. Las dimensiones SPACE llegan como una lista, con las cinco letras `S`, `P`, `A`, `C`, `E` siempre presentes, y cuando no hay datos el valor va en `null`, no desaparece el campo. La forma completa de `/equipo` y `/organizacion` está en el README del backend.
- El panel del empleado no trae ninguna métrica de productividad, solo el contexto de su espacio, la jornada, los umbrales y las alertas. Eso no cambió de intención, pero sí los nombres de los campos.
- Si una respuesta queda casi vacía porque todavía no hay analítica, llega vacía pero válida. El frontend debe tolerarlo, por ejemplo mostrando un estado de sin datos en lugar de romperse.

## 5. De dónde salen los datos de analítica

Hay dos fuentes y conviene no confundirlas:

- **El backend** entrega los puntajes de las dimensiones y las métricas, con su criticidad, ya filtrados por rol y con control de acceso. Para los tableros de líder y gerente, el frontend consume el backend. Esos puntajes los calcula el contenedor de analítica y los deja en la base; el backend solo los lee.
- **El contenedor de analítica** (API en el puerto 8000) entrega solo las correlaciones entre métricas y dimensiones. Su contrato está en `server/analytics/docs/contrato_frontend.md`. Esa API es de solo lectura y no tiene control de acceso por rol, así que hay que acordar con el equipo si el frontend la llama directo o si pasa por el backend.

## 6. Seguridad del lado del frontend

Esto es lo que el frontend debe garantizar para cerrar la seguridad de la que se habló:

- **HTTPS siempre.** Toda la comunicación con el backend va por `https://`, no por `http://`. En el despliegue el TLS se termina en el nginx del frontend con un certificado real. La clave del usuario viaja dentro de la petición y lo que la protege es el HTTPS.
- **No cifrar ni hashear la clave en el navegador.** Se manda tal cual sobre HTTPS. Hashearla en el frontend no aporta seguridad y rompe el modelo, porque ese hash pasaría a ser la contraseña. El backend ya la guarda cifrada con bcrypt.
- **Guardar el token con cuidado.** En memoria o en `sessionStorage`, no en `localStorage` si se puede evitar. Nunca escribirlo en logs ni en la URL. Mandarlo solo en la cabecera `Authorization`.
- **Manejar los códigos de la API.** `401` vuelve al login. `403` con `codigo: debe_cambiar_clave` lleva a cambiar la clave. `403` sin ese código es falta de permiso para ese rol. `429` es demasiados intentos, hay que esperar.
- **No exponer el token de ingesta.** El `INGEST_TOKEN` es de los sensores y conectores, no del frontend. El navegador nunca lo usa.
- **El control de acceso vive en el backend.** El frontend oculta botones por comodidad, pero no es la barrera. No pasa nada si una vista llama una ruta que no le toca, porque el backend responde `403`.

## 7. Lista de cambios para el frontend

1. Ajustar el login al cuerpo `{ username, clave }` y leer `{ token, usuario, debe_cambiar_clave }`.
2. Mandar el token en `Authorization: Bearer` en todas las llamadas protegidas.
3. Agregar la pantalla de cambio de clave y el manejo del código `debe_cambiar_clave`.
4. Manejar `401`, `403` y `429` de forma consistente.
5. Leer la lista de usuarios de la demo con los campos nuevos, y no depender de ese endpoint en producción.
6. Adaptar los tableros de empleado, líder y gerente a las formas de respuesta nuevas, con las cinco dimensiones siempre presentes y los `null` cuando no hay datos.
7. Tolerar respuestas vacías pero válidas.
8. Consumir el backend por HTTPS y decidir con el equipo si las correlaciones se piden al contenedor de analítica directo o por el backend.
9. Servir el frontend por HTTPS en el despliegue, con el certificado en el nginx, y redirigir de HTTP a HTTPS.
