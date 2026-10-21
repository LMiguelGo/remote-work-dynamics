## Guía de despliegue en Windows

Para el despliegue en Windows de los contenedores se deben seguir los siguientes pasos: 

- Instalar Docker Desktop para Windows.
- Tener una copia del repositorio (rama main) en una carpeta local (ver la documentación del archivo README principal)
- Ingresar a la carpeta del proyecto en PowerShell.
- Ingresar a la carpeta server mediante el comando:
```bash
cd ./server
```
- Ejecutar el comando docker-compose up --build para construir y ejecutar los contenedores. Se levantan la base de datos, el backend, la analítica, el frontend y el broker MQTT.
```bash
docker-compose up -d --build
```
- Verficar que los contenedores se están ejecutando mediante el comando (también se puede visualizar en la interfaz gráfica de Docker Desktop):
```bash
docker ps
```
- Sembrar los datos de demostración dentro del contenedor del backend. Este paso crea los roles, los usuarios y los datos de ejemplo. Solo hace falta la primera vez, o cuando se quiera volver a dejar la base en su estado inicial.
```bash
docker-compose exec backend npm run seed
```
- Consultar las credenciales de la demostración. El seed genera una clave distinta por usuario y las escribe en un archivo dentro del contenedor del backend. Cada usuario entra con su propia clave.
```bash
docker-compose exec backend cat .seed-credenciales.txt
```
- Acceder a la aplicación en el navegador mediante la dirección: http://localhost para visualizar el dashboard.
- La API de la analítica queda disponible para consulta en http://localhost:8000/docs
- Detener los contenedores mediante el comando:
```bash
docker-compose down
```

### Variables de entorno y secretos

En desarrollo los contenedores usan valores por defecto, así que no hace falta configurar nada para probar en local. Para un despliegue real se crea un archivo `.env` en la carpeta `server`, que es donde Docker Compose lo lee, tomando como referencia las variables de `backend/.env.example`. Ahí se fijan el `POSTGRES_PASSWORD`, el `JWT_SECRET` y el `INGEST_TOKEN` con cadenas largas y aleatorias. El archivo `.env` nunca se sube al repositorio, igual que el archivo de credenciales de la demostración. Los pasos completos para dejar el backend en modo producción están en la sección siguiente.

### Dejar el backend en modo producción

En desarrollo el backend arranca con valores por defecto. En producción debe correr con sus propios secretos y con la verificación de seguridad activada, que impide el arranque con los valores de ejemplo. Para dejarlo así, junto con los demás contenedores, se siguen estos pasos desde la carpeta `server`.

- Generar los secretos. Este bloque de PowerShell crea tres cadenas aleatorias y las deja en variables, sin que haya que copiar nada a mano. Ejecutarlo una sola vez en la misma ventana.
```bash
$db  = -join (1..64 | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$jwt = -join (1..64 | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$ing = -join (1..64 | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```
- Crear el archivo `.env` en la carpeta `server` con esos secretos. Toma las variables del paso anterior, así que no se reemplaza nada de los secretos a mano. En `CORS_ORIGIN` va el dominio del frontend servido por HTTPS en el despliegue real; para una prueba local se cambia por `http://localhost`.
```bash
@"
POSTGRES_PASSWORD=$db
JWT_SECRET=$jwt
INGEST_TOKEN=$ing
CORS_ORIGIN=https://dominio-del-frontend
"@ | Set-Content -Path .env -Encoding utf8
```
- Activar el modo producción del backend. Para no modificar el `docker-compose.yml`, se crea junto a él, en la carpeta `server`, un archivo `docker-compose.override.yml` que Docker Compose combina de forma automática. Es un archivo local de cada entorno y no se sube al repositorio, ya está en el `.gitignore`. Su contenido es:
```yaml
services:
  backend:
    environment:
      - NODE_ENV=production
```
- Levantar el stack. Como cambia la clave de la base, la primera vez se recrea el volumen para que nazca con la clave nueva, lo que elimina los datos anteriores.
```bash
docker-compose down -v
docker-compose up -d --build
```
- Verificar que el backend arrancó. En los logs debe aparecer que está escuchando. Si en cambio se reinicia en bucle avisando que no puede arrancar con secretos por defecto, es que el `.env` quedó mal; esa es la verificación de seguridad funcionando como debe.
```bash
docker-compose logs backend --tail 10
```
- Sembrar los datos iniciales igual que en desarrollo, con `docker-compose exec backend npm run seed`. En producción la clave del administrador se entrega a la persona por un canal privado y no se deja el archivo de credenciales en el servidor.

Para volver al modo desarrollo se borran el `.env` y el `docker-compose.override.yml`, y se vuelve a levantar el stack.

### Reinicio limpio de la base

La base guarda sus datos en un volumen de Docker llamado `db_data`, que gestiona Docker y no vive dentro de la carpeta del proyecto, así que no hay riesgo de subir la base al repositorio por error. La base conserva sus datos entre reinicios normales con `docker-compose down` y `docker-compose up`. Para empezar de cero se baja el stack borrando el volumen, lo que elimina todos los datos. El esquema se vuelve a crear solo en el primer arranque con el volumen vacío, y después se corre de nuevo el seed.
```bash
docker-compose down -v
```
