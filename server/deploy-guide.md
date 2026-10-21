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

En desarrollo los contenedores usan valores por defecto, así que no hace falta configurar nada para probar en local. Para un despliegue real se debe crear un archivo `.env` en la carpeta `backend` a partir de `backend/.env.example`, y fijar ahí el `JWT_SECRET` y el `INGEST_TOKEN` con cadenas largas y aleatorias. El archivo `.env` nunca se sube al repositorio, igual que el archivo de credenciales de la demostración.

### Reinicio limpio de la base

La base guarda sus datos en un volumen de Docker llamado `db_data`, que gestiona Docker y no vive dentro de la carpeta del proyecto, así que no hay riesgo de subir la base al repositorio por error. La base conserva sus datos entre reinicios normales con `docker-compose down` y `docker-compose up`. Para empezar de cero se baja el stack borrando el volumen, lo que elimina todos los datos. El esquema se vuelve a crear solo en el primer arranque con el volumen vacío, y después se corre de nuevo el seed.
```bash
docker-compose down -v
```
