#include <Arduino.h>
#include <DHTesp.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <driver/i2s.h>
#include <esp_idf_version.h>
#include <esp_task_wdt.h>
#include <time.h>
#include "secrets.h"

#define VALIDAR_CERT 1

#define DHT_PIN 4
#define I2S_PORT I2S_NUM_0
#define I2S_SCK 18
#define I2S_WS  19
#define I2S_SD  21
#define SAMPLE_RATE 16000

#define DHT_TIPO DHTesp::DHT22

const double CALIB_OFFSET = 81.0;

const double RMS_MIN_VALIDO = 375.0;
const double DB_PISO_MICROFONO = 33.0;
const int32_t MUESTRA_SATURADA = 8300000;

const double VARIACION_CONGELADO = 0.001;
const int    VENTANAS_CONGELADO = 12;

const float TEMP_MIN = -40, TEMP_MAX = 80;
const float HUM_MIN  = 0,   HUM_MAX  = 100;

const unsigned long PERIODO_DHT_MS = 2000;
const int MAX_MUESTRAS_DHT = 5;
const int MIN_MUESTRAS_DHT = 2;

const int  FALLAS_PARA_DETENER = 6;
const int  BUENAS_PARA_RECUPERAR = 3;
const unsigned long PERIODO_AVISO_MS = 60000;

const unsigned long ESPERA_WIFI_SETUP_MS = 20000;
const unsigned long PERIODO_NTP_MS = 30000;
const int  RECHAZOS_PARA_BLOQUEAR = 5;
const unsigned long BLOQUEO_CREDENCIALES_MS = 30UL * 60UL * 1000UL;
const unsigned long ESPERA_MQTT_MAX_MS = 300000UL;

const uint32_t WDT_SEGUNDOS = 30;
const unsigned long SALTO_ID = 100;
const unsigned long GUARDAR_ID_CADA = 50;

DHTesp dhtSensor;
WiFiClientSecure espClient;
PubSubClient client(espClient);
Preferences prefs;

int32_t bufferI2S[512];
double sumaPotencia = 0;
long bloquesBuenos = 0;
int bloquesTotal = 0, bloquesMuertos = 0, ventanasIguales = 0;
double rmsVent = 0, rmsVentPrev = 0;
bool microfonoIniciado = false;
bool huboSaturacion = false;

float tempMuestras[MAX_MUESTRAS_DHT], humMuestras[MAX_MUESTRAS_DHT];
int nDht = 0;
unsigned long ultimaLecturaDht = 0;

unsigned long ultimoEnvio = 0, ultimoIntentoMqtt = 0, ultimoIntentoWifi = 0;
unsigned long ultimoIntentoNtp = 0, inicioBloqueo = 0;
unsigned long esperaMqtt = 1000;
int rechazosMqtt = 0;
unsigned long contador = 0;
bool bloqueadoPorCredenciales = false;
int fallasSeguidas = 0, buenasSeguidas = 0;
bool detenido = false;
unsigned long ultimoAviso = 0;

void iniciarMicrofono() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = SAMPLE_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  cfg.dma_desc_num = 4;
  cfg.dma_frame_num = 256;
#else
  cfg.dma_buf_count = 4;
  cfg.dma_buf_len = 256;
#endif
  cfg.use_apll = false;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = I2S_SCK;
  pins.ws_io_num = I2S_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = I2S_SD;

  esp_err_t e1 = i2s_driver_install(I2S_PORT, &cfg, 0, NULL);
  esp_err_t e2 = (e1 == ESP_OK) ? i2s_set_pin(I2S_PORT, &pins) : e1;
  if (e1 != ESP_OK || e2 != ESP_OK) {
    Serial.printf("ERROR I2S: install=%d set_pin=%d (el ruido se reportara como error)\n", (int)e1, (int)e2);
    microfonoIniciado = false;
    return;
  }
  i2s_zero_dma_buffer(I2S_PORT);
  microfonoIniciado = true;
}

void actualizarRuido() {
  bloquesTotal++;
  if (!microfonoIniciado) { bloquesMuertos++; delay(32); return; }

  size_t bytesRead = 0;
  esp_err_t e = i2s_read(I2S_PORT, bufferI2S, sizeof(bufferI2S), &bytesRead, pdMS_TO_TICKS(200));
  int n = (e == ESP_OK) ? (int)(bytesRead / sizeof(int32_t)) : 0;
  if (n == 0) { bloquesMuertos++; return; }

  double media = 0;
  int32_t vmin = INT32_MAX, vmax = INT32_MIN;
  for (int i = 0; i < n; i++) {
    bufferI2S[i] = ((int32_t)bufferI2S[i]) >> 8;
    if (bufferI2S[i] < vmin) vmin = bufferI2S[i];
    if (bufferI2S[i] > vmax) vmax = bufferI2S[i];
    media += bufferI2S[i];
  }
  media /= n;

  if (vmax >= MUESTRA_SATURADA || vmin <= -MUESTRA_SATURADA) huboSaturacion = true;

  double suma = 0;
  for (int i = 0; i < n; i++) {
    double m = (double)bufferI2S[i] - media;
    suma += m * m;
  }
  double rms = sqrt(suma / n);

  if (vmax == vmin || rms < RMS_MIN_VALIDO) { bloquesMuertos++; return; }

  sumaPotencia += rms * rms;
  bloquesBuenos++;
}

void actualizarDht() {
  if (millis() - ultimaLecturaDht < PERIODO_DHT_MS) return;
  ultimaLecturaDht = millis();

  TempAndHumidity d = dhtSensor.getTempAndHumidity();
  bool ok = dhtSensor.getStatus() == 0 && !isnan(d.temperature) && !isnan(d.humidity)
            && d.temperature >= TEMP_MIN && d.temperature <= TEMP_MAX
            && d.humidity >= HUM_MIN && d.humidity <= HUM_MAX;
  if (ok && nDht < MAX_MUESTRAS_DHT) {
    tempMuestras[nDht] = d.temperature;
    humMuestras[nDht] = d.humidity;
    nDht++;
  } else if (!ok) {
    Serial.printf("DHT descartado: estado=%s T=%.1f H=%.1f (limites T %.0f..%.0f, H %.0f..%.0f)\n",
                  dhtSensor.getStatusString(), d.temperature, d.humidity,
                  TEMP_MIN, TEMP_MAX, HUM_MIN, HUM_MAX);
  }
}

float mediana(float *a, int n) {
  float t[MAX_MUESTRAS_DHT];
  for (int i = 0; i < n; i++) t[i] = a[i];
  for (int i = 1; i < n; i++) {
    float v = t[i]; int j = i - 1;
    while (j >= 0 && t[j] > v) { t[j + 1] = t[j]; j--; }
    t[j + 1] = v;
  }
  return (n % 2) ? t[n / 2] : (t[n / 2 - 1] + t[n / 2]) / 2.0f;
}

const char *evaluarRuido(double &dbSpl, bool &hayValor) {
  const char *estado = "ok";
  hayValor = true;

  if (bloquesTotal == 0 || bloquesBuenos == 0 || bloquesMuertos * 2 > bloquesTotal) {
    estado = "error";
    hayValor = false;
    ventanasIguales = 0;
    rmsVent = 0;
  } else {
    rmsVent = sqrt(sumaPotencia / bloquesBuenos);
    bool casiIgual = rmsVentPrev > 0 &&
                     fabs(rmsVent - rmsVentPrev) / rmsVentPrev < VARIACION_CONGELADO;
    if (casiIgual) ventanasIguales++; else ventanasIguales = 0;
    if (ventanasIguales >= VENTANAS_CONGELADO) estado = "sospechoso";

    double dbfs = 20.0 * log10(rmsVent / 8388608.0);
    dbSpl = dbfs + CALIB_OFFSET;
    if (dbSpl < 0.0) dbSpl = 0.0;

    if (dbSpl < DB_PISO_MICROFONO) {
      Serial.println("AVISO: nivel por debajo del piso del microfono (~33 dB): valor poco fiable");
    }
  }

  rmsVentPrev = rmsVent;
  sumaPotencia = 0; bloquesBuenos = 0; bloquesTotal = 0; bloquesMuertos = 0;
  return estado;
}

bool horaOk() { return time(nullptr) > 1700000000; }

void iniciarNtp() { configTime(0, 0, "pool.ntp.org", "time.google.com"); }

void sincronizarHoraInicial() {
  iniciarNtp();
  unsigned long t0 = millis();
  while (!horaOk() && millis() - t0 < 15000) { delay(300); }
  Serial.println(horaOk() ? "Hora UTC sincronizada" : "NTP sin respuesta (se reintentara en el loop)");
}

void mantenerConexion() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - ultimoIntentoWifi > 5000) {
      ultimoIntentoWifi = millis();
      Serial.println("WiFi caido, reintentando...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
    return;
  }
  if (client.connected()) {
    rechazosMqtt = 0; esperaMqtt = 1000;
    return;
  }

#if VALIDAR_CERT
  if (!horaOk()) {
    if (millis() - ultimoIntentoNtp >= PERIODO_NTP_MS) {
      ultimoIntentoNtp = millis();
      Serial.println("Sin hora UTC: no se puede validar el certificado (reintentando NTP)");
      iniciarNtp();
    }
    return;
  }
#endif

  if (bloqueadoPorCredenciales) {
    if (millis() - inicioBloqueo < BLOQUEO_CREDENCIALES_MS) return;
    bloqueadoPorCredenciales = false;
    rechazosMqtt = RECHAZOS_PARA_BLOQUEAR - 1;
    Serial.println("Fin del bloqueo por credenciales: se prueba de nuevo");
  }

  if (millis() - ultimoIntentoMqtt < esperaMqtt) return;
  ultimoIntentoMqtt = millis();

  String clientId = String(DEVICE_ID) + "-" + String(random(0xffff), HEX);
  if (client.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
    Serial.println("MQTT conectado");
    return;
  }

  int rc = client.state();
  Serial.print("MQTT rc="); Serial.println(rc);

  if (rc == -2) {
    char buf[100] = {0};
    int err = espClient.lastError(buf, sizeof(buf));
    if (err != 0) Serial.printf("TLS lastError=%d: %s\n", err, buf);
  }

  if (rc == 4 || rc == 5) {
    if (++rechazosMqtt >= RECHAZOS_PARA_BLOQUEAR) {
      bloqueadoPorCredenciales = true;
      inicioBloqueo = millis();
      Serial.println("Credenciales rechazadas varias veces: reintentos pausados 30 min");
    }
  }
  esperaMqtt = min(esperaMqtt * 2, ESPERA_MQTT_MAX_MS);
}

void avisarEstado(const char *situacion, const char *estadoRuido, bool dhtOk) {
  Serial.print("ESTADO: ");
  Serial.print(situacion);
  Serial.print(" | ruido: ");
  Serial.print(estadoRuido);
  Serial.print(" | dht: ");
  Serial.println(dhtOk ? "ok" : "error");
  ultimoAviso = millis();
}

void publicarLectura() {
  double dbSpl = 0;
  bool hayRuido;
  const char *estadoRuido = evaluarRuido(dbSpl, hayRuido);

  bool dhtOk = nDht >= MIN_MUESTRAS_DHT;
  float temperatura = 0, humedad = 0;
  if (dhtOk) {
    temperatura = mediana(tempMuestras, nDht);
    humedad = mediana(humMuestras, nDht);
  }
  Serial.print("Muestras DHT validas en la ventana: "); Serial.println(nDht);
  nDht = 0;

  if (strcmp(estadoRuido, "sospechoso") == 0) {
    Serial.println("AVISO: ruido sospechoso (valor sin variacion)");
  }
  if (huboSaturacion) {
    Serial.println("AVISO: saturacion del microfono en la ventana");
    huboSaturacion = false;
  }

  if (!client.connected()) {
    Serial.println("Sin MQTT: lectura descartada");
    return;
  }

  bool lecturaBuena = dhtOk && hayRuido;

  if (!lecturaBuena) {
    buenasSeguidas = 0;
    fallasSeguidas++;
    Serial.println("Lectura descartada (sensor con falla)");

    if (!detenido && fallasSeguidas == 1) {
      avisarEstado("falla", estadoRuido, dhtOk);
    }
    if (!detenido && fallasSeguidas >= FALLAS_PARA_DETENER) {
      detenido = true;
      avisarEstado("detenido", estadoRuido, dhtOk);
    } else if (detenido && millis() - ultimoAviso >= PERIODO_AVISO_MS) {
      avisarEstado("detenido", estadoRuido, dhtOk);
    }
    return;
  }

  fallasSeguidas = 0;
  if (detenido) {
    if (++buenasSeguidas < BUENAS_PARA_RECUPERAR) return;
    detenido = false;
    buenasSeguidas = 0;
    avisarEstado("recuperado", estadoRuido, dhtOk);
  }

  contador++;
  if (contador % GUARDAR_ID_CADA == 0) prefs.putULong("cnt", contador);

  char p[200];
  snprintf(p, sizeof(p),
           "{\"dispositivo\":\"%s\",\"lectura_id\":%lu,\"temperatura\":%.2f,\"humedad\":%.2f,\"ruido_raw\":%.1f}",
           DEVICE_ID, contador, temperatura, humedad, dbSpl);

  Serial.println(p);
  Serial.println(client.publish(MQTT_TOPIC, p) ? "Publicado" : "ERROR al publicar");
}

void iniciarWatchdog() {
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  esp_task_wdt_config_t c = {};
  c.timeout_ms = WDT_SEGUNDOS * 1000;
  c.idle_core_mask = 0;
  c.trigger_panic = true;
  esp_task_wdt_reconfigure(&c);
#else
  esp_task_wdt_init(WDT_SEGUNDOS, true);
#endif
  esp_task_wdt_add(NULL);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  prefs.begin("lecturas", false);
  contador = prefs.getULong("cnt", 0) + SALTO_ID;
  prefs.putULong("cnt", contador);

  dhtSensor.setup(DHT_PIN, DHT_TIPO);
  iniciarMicrofono();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < ESPERA_WIFI_SETUP_MS) {
    delay(500); Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi conectado" : "\nWiFi sin conexion (se reintenta en el loop)");

#if VALIDAR_CERT
  if (WiFi.status() == WL_CONNECTED) sincronizarHoraInicial();
  else iniciarNtp();
  espClient.setCACert(CA_CERT);
#else
  espClient.setInsecure();
#endif
  client.setServer(MQTT_HOST, MQTT_PORT);

  iniciarWatchdog();
}

void loop() {
  esp_task_wdt_reset();
  mantenerConexion();
  if (client.connected()) client.loop();
  actualizarRuido();
  actualizarDht();

  if (millis() - ultimoEnvio >= 5000) {
    ultimoEnvio = millis();
    publicarLectura();
  }
}