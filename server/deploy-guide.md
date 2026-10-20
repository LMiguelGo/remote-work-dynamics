## Guía de despliegue en Windows

Para el despliegue en Windows de los contenedores se deben seguir los siguientes pasos: 

- Instalar Docker Desktop para Windows.
- Tener una copia del repositorio (rama main) en una carpeta local (ver la documentación del archivo README principal)
- Ingresar a la carpeta del proyecto en PowerShell.
- Ingresar a la carpeta server mediante el comando:
```bash
cd ./server
```
- Ejecutar el comando docker-compose up --build para construir y ejecutar los contenedores.
```bash
docker-compose up -d --build
```
- Verficar que los contenedores se están ejecutando mediante el comando (también se puede visualizar en la interfaz gráfica de Docker Desktop):
```bash
docker ps
```
- Acceder a la aplicación en el navegador mediante la dirección: http://localhost para visualizar el dashboard.
- Detener los contenedores mediante el comando:
```bash
docker-compose down
```