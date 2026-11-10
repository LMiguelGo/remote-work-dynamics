# Pruebas de rendimiento del MVP (Actividad 5, Unidad 5)

Datos crudos y *scripts* de las mediciones de desempeño del 9 de noviembre de 2026. Con ellos se llenaron los cuadros 1 y 2 y las figuras 1 y 2 del informe de la Actividad 5.

## Entorno

- Portátil con Docker Desktop: 4 vCPU y 3,77 GiB para los contenedores. **No es el VPS de Oracle Cloud**: la latencia y la pérdida hacia el VPS quedan pendientes.
- Contenedores del `docker-compose` de `main` (8f7a608): `database`, `backend`, `analytics`, `broker-mqtt` (Mosquitto 2.1.2) y `frontend`, más un nginx local para entrar por `http://localhost`.
- No se usó un ESP32 físico. El dispositivo simulado publica el mismo JSON que `esp-32/main.cpp`, con QoS 0, y corre **dentro del contenedor `backend`**. Por eso la CPU y la memoria atribuidas al backend en las pruebas MQTT incluyen las del simulador.
- Base de datos con los datos sintéticos del `seed` (usuarios `lider1`, `gerente1`, `empleado1`, `empleado2`).

## Archivos

| Archivo | Qué es | Dónde se usa en el informe |
|---|---|---|
| `scripts/mqtt_rendimiento.js` | Dispositivo simulado: latencia (`FASE=latencia`) y tasas de 20 a 500 mensajes/s (`FASE=tasa`). Casa cada mensaje con su fila en `events` | M-05, M-06, M-11, figura 1a |
| `scripts/reconexion.js` | Dispositivo que publica 1 lectura/s mientras se detiene el *broker* 10 s | M-07, M-08 |
| `scripts/http_carga.mjs` | Usuarios virtuales sin pausa contra 6 rutas de líder y gerente (1 a 200 usuarios, 20 s por nivel) | M-09, M-10, figura 1b |
| `scripts/render.mjs` | Chrome sin interfaz (CDP), 15 repeticiones: carga del tablero, clic en un integrante y dibujo de las gráficas | M-13 |
| `scripts/stats.sh` | Muestra `docker stats` cada ≈2 s hasta que exista un archivo de parada | M-01, M-02, figura 2 |
| `scripts/resumen_stats.py` | Mediana y máximo de CPU y memoria por contenedor | M-01, M-02 |
| `scripts/graficas.py` | Genera las figuras a partir de `resultados/` | Figuras 1 y 2 |
| `resultados/resultados_2026-11-09.json` | Salida de todas las pruebas: latencias, tasas, API, renderizado y reconexión | Cuadro 2 |
| `resultados/stats_reposo.csv`, `stats_mqtt.csv`, `stats_http.csv` | Lecturas crudas de `docker stats` en reposo, en la carga MQTT y en la carga de la API | M-01, M-02, figura 2 |
| `resultados/recursos_por_escenario.json` | CPU y memoria por contenedor en cada escenario (lo calcula `graficas.py`) | Figura 2 |
| `resultados/reconexion.log`, `reconexion_db.txt` | Conexiones del dispositivo y filas guardadas durante el corte del *broker* | M-08 |
| `figuras/` | Figuras 1 y 2 en PNG y PDF | Figuras 1 y 2 |

Las horas de los resultados están en UTC (la prueba fue la noche del 9 de noviembre en Colombia).

## Cómo repetir las pruebas

1. Crear una fuente temporal para el dispositivo simulado y anotar su `id`:
   `INSERT INTO data_sources (user_id, source_type, identifier, description) VALUES (<id de empleado1>, 'esp32', 'esp32_prueba_rendimiento', 'Temporal: pruebas de rendimiento') RETURNING id;`
2. Muestreo de recursos en segundo plano: `./scripts/stats.sh resultados/stats.csv parar &` (para detenerlo: `touch parar`).
3. Ingesta MQTT (desde `pruebas/rendimiento`):
   `docker exec -i -e FASE=latencia -e RUN=1 -e SOURCE_ID=<id> backend node - < scripts/mqtt_rendimiento.js`
   `docker exec -i -e FASE=tasa -e TASA=100 -e RUN=20 -e SOURCE_ID=<id> backend node - < scripts/mqtt_rendimiento.js`
4. Reconexión: correr `docker exec -i -e DUR=70 backend node - < scripts/reconexion.js`, y a los 20 s `docker stop broker-mqtt`; 10 s después, `docker start broker-mqtt`.
5. API (requiere nginx en `http://localhost` y Node 22): `LIDER_CLAVE=... GERENTE_CLAVE=... node scripts/http_carga.mjs`.
6. Tablero: `LIDER_CLAVE=... REP=15 node scripts/render.mjs` (variable `CHROME` si Chrome está en otra ruta).
7. Figuras: `python scripts/graficas.py`.
8. **Al terminar, borrar los datos de prueba:** `DELETE FROM events WHERE source_id=<id>;` y `DELETE FROM data_sources WHERE id=<id>;`.

Las claves de los usuarios de prueba no están en este repositorio: se pasan como variables de entorno al correr cada *script*.
