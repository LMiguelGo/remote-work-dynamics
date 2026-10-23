### HTTPS en el frontend

El nginx del frontend sirve la aplicación por HTTP (puerto 80) en desarrollo. Para el despliegue real, la guía de seguridad del frontend exige HTTPS: la clave del usuario viaja dentro de la petición de login y lo que la protege es el cifrado de la conexión. Con HTTPS activo, nginx redirige todo el tráfico del puerto 80 al 443 y atiende ahí con el certificado.

Se activa sin tocar la configuración de desarrollo, con dos archivos aparte: `frontend/nginx.prod.conf` y `docker-compose.https.yml`.

- Poner el certificado y la llave en `server/certs/`, con estos nombres exactos: `fullchain.pem` (certificado y cadena) y `privkey.pem` (llave privada). Esa carpeta está en el `.gitignore` y **nunca se sube al repositorio**.
- Para una prueba local se puede generar un certificado autofirmado. Desde la raíz del repositorio:
```bash
mkdir server\certs
docker run --rm -v "${PWD}\server\certs:/certs" alpine/openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout /certs/privkey.pem -out /certs/fullchain.pem -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```
- Levantar el stack con HTTPS, desde la carpeta `server`. Si también se usa `docker-compose.override.yml` (modo producción del backend), agregarlo con otro `-f`:
```bash
docker-compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```
- Abrir `https://localhost`. Con el certificado autofirmado el navegador muestra una advertencia, que es lo esperado; con un certificado emitido por una autoridad reconocida no aparece. `http://localhost` debe redirigir solo a `https://localhost`.
- En el despliegue real, usar el certificado del dominio (por ejemplo de Let's Encrypt), poner en `CORS_ORIGIN` el dominio con `https://` y descomentar la línea `Strict-Transport-Security` de `nginx.prod.conf`. Esa cabecera no se activa con certificados de prueba porque el navegador recuerda la regla y bloquearía `http://localhost`.
- Los sensores ESP32 envían por MQTT, que no pasa por este nginx. Si algún conector envía a `/ingesta/` por HTTP, debe cambiarse a `https://`, porque la redirección rompe las peticiones POST de clientes que no la siguen.
