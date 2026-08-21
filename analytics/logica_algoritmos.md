# Lógica deAlgoritmos — 

## VPN - conectividad_vpn 

### Estructura de los Datos (VPN Logs)

El servidor VPN genera registros continuos. El sistema debe extraer una tabla con al menos estas cuatro columnas clave:

- **Timestamp:** Fecha y hora exacta del registro (ej. 2026-08-20 08:00:00).
- **User_ID:** La credencial corporativa del empleado (ej. mperez).
- **Event_Type:** La acción registrada (Session_Start, Session_End, o Keep_Alive/Traffic_Log).
- **Bytes_Tx_Rx:** Volumen de datos transmitidos y recibidos (esencial para validar si realmente hay interacción o solo está conectado sin hacer nada).

### Lógica del Algoritmo 

debe ejecutar estas fases secuenciales al cierre del día para cada usuario:

- **Fase 1: Cálculo del Tiempo Bruto.** El algoritmo filtra los datos de un empleado, identifica su primer evento `Session_Start` y su último evento `Session_End`. La diferencia entre ambas marcas temporales arroja la jornada conectada total (por ejemplo, 10 horas).
- **Fase 2: Descuento de Inactividad Prolongada.** El script analiza los eventos intermedios de tráfico (`Keep_Alive` o volumen de bytes). Si la diferencia de tiempo entre dos eventos que reporten tráfico real es mayor o igual a 60 minutos, el sistema clasifica ese bloque como "Inactividad". El algoritmo resta esos minutos inactivos del Tiempo Bruto para obtener el "Tiempo de Conectividad Neto".
- **Fase 3: Detector de Riesgo de Burnout.** El algoritmo revisa todos los bloques con actividad confirmada. Si el Timestamp de un bloque activo es mayor a las 20:00:00, activa una bandera condicional y suma esos minutos específicos a la variable acumulativa `Horas_Sobretiempo`.

**Se debe generar:** Variable = `Horas_Sobretiempo`, `Tiempo_de_conectividad_Neto`

---

## Sensor de Temperatura, Humedad y Presión - sensor_ambiental

- **Temperatura:** Medida en grados centígrados (°C).
- **Humedad Relativa:** Medida en porcentaje (%). Representa la cantidad de vapor de agua en el aire.
- **Presión Barométrica:** Medida en hectopascales (hPa).

### Lógica del Algoritmo

**Paso 1: Agregación Temporal.** Para evitar saturar el sistema con fluctuaciones de un segundo a otro (como si el empleado suspira cerca del sensor), Node-RED agrupa las lecturas físicas en bloques de tiempo (ej. 15 minutos) y calcula el promedio de temperatura y humedad de ese bloque.

**Paso 2: Clasificación base.** El algoritmo pasa el bloque promediado por una regla condicional simple:

1. **Confort Óptimo:**
   - Condición: `(20°C ≤ T ≤ 24°C) ∧ (30% ≤ H ≤ 60%) ∧ (P ≥ 1008 hPa)`
   - Resultado: Clasificación = "Confort Óptimo"
   - Nota: Mantiene el equilibrio térmico, hídrico y de estabilidad barométrica.

2. **Alerta por Exceso de Calor / Sofocación:**
   - Condición: `(T > 27°C) ∨ (T > 25°C ∧ H > 60%) ∨ (T > 25°C ∧ P < 1005 hPa)`
   - Resultado: Clasificación = "Alerta Térmica (Calor/Sofocación)"
   - Nota: La baja presión actúa como multiplicador: a 25°C con baja presión, la sensación de letargo y sofoco equivale a estar a 28°C.

3. **Alerta por Baja Presión (Riesgo de Fatiga / Cefalea):**
   - Condición: `(P < 1005 hPa) ∧ (20°C ≤ T ≤ 25°C)`
   - Resultado: Clasificación = "Alerta Barométrica (Riesgo de Cefalea/Somnolencia)"
   - Nota: Detecta días tormentosos o de baja presión ambiental donde, aunque la temperatura sea buena, el empleado corre alto riesgo de perder concentración por cansancio físico o dolor de cabeza.

4. **Alerta por Frío:**
   - Condición: `T < 20°C`
   - Resultado: Clasificación = "Alerta Térmica (Frío)"

5. **Alerta por Aire Seco:**
   - Condición: `(H < 30%) ∧ (T ≤ 27°C)`
   - Resultado: Clasificación = "Alerta Ambiental (Aire Seco)"

6. **Confort Normal (ELSE):**
   - Condición: Cualquier otra combinación que no dispare una alerta explícita.
   - Resultado: Clasificación = "Confort Normal"

**Paso 3: Validación de Calor Sostenido.** Un pico de calor de un minuto no es crítico. El algoritmo verifica si la bandera de "Alerta Térmica" se ha mantenido activa durante al menos 30 minutos.

**Paso 4: Cruce Multivariable (La condición clave).** Si se confirma el calor sostenido, Node-RED hace una consulta a la métrica de *Tiempo de foco continuo* (obtenida por el agente ActivityWatch).

- Evaluación: ¿El Índice de Foco de los últimos 30 minutos muestra una caída en comparación con el promedio de la mañana?
- SI la respuesta es SÍ: Significa que la Alerta está impactando el rendimiento.

**Paso 5: Acción No Invasiva.** Al cumplirse la doble condición (Alerta — principalmente alerta de calor, ya que se asocia con niveles de estrés fuera del rango normal  + Caída del Foco), enviar notificación web que aparece únicamente en el panel personal (self-service) del empleado. El mensaje sugiere discretamente abrir una ventana, encender un ventilador o hidratarse, tomar un tiempo de descanso aprox de 20 min.

El proceso se debe ejecutar (evaluación de datos) cada 15 minutos, ya que las condiciones atmosféricas de una habitación no varían constantemente; este intervalo evita registrar picos irreales causados por interferencias puntuales, como un destello de luz o la respiración directa sobre el sensor.

**Se debe guardar:** `"alerta_generada"`, `"notificacion_recomendacion_realizada"` (en el caso de afectar niveles de foco), `"numero_de_notificacion_recomendacion_realizada"`

---

## Dominios laborales utilizados - dominio_laboral 

### Lógica del algoritmo

**Paso 1: Captura de la URL Cruda.** La herramienta detecta la dirección web completa obtenida a través de ActivityWatch.

**Paso 2: Configuración de Regex.** El script aísla exclusivamente el dominio raíz. En milisegundos, destruye de la memoria temporal todo el contenido confidencial: subcarpetas, nombres de proyectos, parámetros de búsqueda y credenciales.

- Resultado tras Regex: `github.com`

**Paso 3: Validación contra Lista Blanca (Whitelisting).** El dominio truncado se contrasta con un diccionario corporativo (una lista de dominios preaprobados por la empresa).

**Paso 4: Clasificación y Enmascaramiento:**

- **Escenario A (Match Laboral):** Si el dominio (`github.com`, `aws.amazon.com`, etc.) está en la lista blanca, el algoritmo autoriza registrar su nombre exacto.
- **Escenario B (No Match / Uso Personal):** Si el dominio truncado es `facebook.com` o `banco-personal.com`, el script lo enmascara de inmediato bajo la etiqueta genérica "Otros / No Laboral". De este modo, la empresa contabiliza el tiempo de distracción.

**Paso 5: Agregación del Payload.** Para evitar un registro segundo a segundo, el sistema agrupa el tiempo total invertido por dominio en una ventana temporal. El reporte se debe generar al final de la jornada laboral emitiendo un JSON minimizado.

**Variables:** `tiempo_de_distracción`, `dominio_laboral_auditado`, `tiempo_dentro_del_dominio_laboral_auditado`

---

## % Actividades realizadas - entrega_sprint 

- Consultas de filtro por medio de APIs a Jira, Trello o Asana sobre las tareas realizadas, pendientes, terminadas. Entrega de esos datos al algoritmo.

### Logica algoritmo

**Paso 1: Inicialización de Acumuladores.** El script crea dos variables numéricas en cero: `total_sp_comprometidos = 0` y `total_sp_terminados = 0`.

**Paso 2: Iteración y Suma (El Bucle).** El algoritmo recorre cada elemento (issue) dentro del JSON.

- Extrae el valor numérico del campo de Story Points (ej. 5.0) y lo suma a `total_sp_comprometidos`.
- Evalúa el campo `status.name`. SI el estado es exactamente igual a "Done" (o "Completado"), toma ese mismo valor numérico y lo suma también a `total_sp_terminados`.

**Paso 3: Ejecución de la Fórmula Matemática.** Con las variables llenas, el script aplica el cálculo de la Tasa de Entrega:

`Tasa de Entrega (%) = (Story Points terminados (Done) / Total Story Points Comprometidos en el Sprint) × 100`

**Paso 4: Entrega del cálculo de % tasa de entrega.**

**Nota:** Por cada una de las 4 métricas se va a estimar un % de productividad.
