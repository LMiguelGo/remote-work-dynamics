#include <WiFi.h>
#include <PubSubClient.h>
#include <DHTesp.h>

// ==================================================
// CONFIGURACIÓN WIFI
// ==================================================

const char* ssid = "Wokwi-GUEST";
const char* password = "";

// ==================================================
// CONFIGURACIÓN MQTT
// ==================================================

const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
const char* topic_pub = "remote-work/esp32/ambiente";

// ==================================================
// CONFIGURACIÓN DE SENSORES
// ==================================================

// DHT22
const int DHT_PIN = 15;
DHTesp dhtSensor;

// Simulación de sensor de ruido:
// potenciómetro conectado al GPIO 34
const int NOISE_PIN = 34;

// ==================================================
// CLIENTE MQTT
// ==================================================

WiFiClient espClient;
PubSubClient client(espClient);

// ==================================================
// VARIABLES DE CONTROL
// ==================================================

unsigned long lastMsg = 0;
int contador = 0;


// ==================================================
// CONEXIÓN WIFI
// ==================================================

void setup_wifi() {

  delay(10);

  Serial.println();
  Serial.print("Conectando a ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi conectado");

  Serial.print("Dirección IP: ");
  Serial.println(WiFi.localIP());
}


// ==================================================
// RECONEXIÓN MQTT
// ==================================================

void reconnect() {

  while (!client.connected()) {

    Serial.print("Intentando conexión MQTT...");

    String clientId = "ESP32Client-Wokwi-";
    clientId += String(random(0xffff), HEX);

    if (client.connect(clientId.c_str())) {

      Serial.println("¡Conectado al broker MQTT!");

    } else {

      Serial.print("Falló, rc=");
      Serial.print(client.state());
      Serial.println(" intentando nuevamente en 5 segundos");

      delay(5000);
    }
  }
}


// ==================================================
// SETUP
// ==================================================

void setup() {

  Serial.begin(115200);

  // Inicializar DHT22
  dhtSensor.setup(DHT_PIN, DHTesp::DHT22);

  // Entrada analógica para ruido simulado
  pinMode(NOISE_PIN, INPUT);

  // WiFi
  setup_wifi();

  // MQTT
  client.setServer(mqtt_server, mqtt_port);
}


// ==================================================
// LOOP PRINCIPAL
// ==================================================

void loop() {

  if (!client.connected()) {
    reconnect();
  }

  client.loop();

  unsigned long now = millis();

  // Publicar cada 5 segundos
  if (now - lastMsg > 5000) {

    lastMsg = now;
    contador++;

    // ==============================================
    // LEER DHT22
    // ==============================================

    TempAndHumidity data = dhtSensor.getTempAndHumidity();

    float temperatura = data.temperature;
    float humedad = data.humidity;

    // ==============================================
    // LEER RUIDO SIMULADO
    // ==============================================

    int ruidoRaw = analogRead(NOISE_PIN);

    // ==============================================
    // CREAR JSON
    // ==============================================

    String payload = "{";

    payload += "\"dispositivo\":\"ESP32_Wokwi\",";
    payload += "\"lectura_id\":" + String(contador) + ",";
    payload += "\"temperatura\":" + String(temperatura, 2) + ",";
    payload += "\"humedad\":" + String(humedad, 2) + ",";
    payload += "\"ruido_raw\":" + String(ruidoRaw);

    payload += "}";

    // ==============================================
    // MOSTRAR EN MONITOR SERIAL
    // ==============================================

    Serial.println();
    Serial.println("Publicando mensaje:");
    Serial.println(payload);

    Serial.print("Temperatura: ");
    Serial.print(temperatura);
    Serial.println(" °C");

    Serial.print("Humedad: ");
    Serial.print(humedad);
    Serial.println(" %");

    Serial.print("Ruido RAW: ");
    Serial.println(ruidoRaw);

    Serial.println("--------------------------------");

    // ==============================================
    // PUBLICAR MQTT
    // ==============================================

    client.publish(topic_pub, payload.c_str());
  }
}