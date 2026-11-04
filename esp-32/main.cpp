#include <Arduino.h>
#include <DHTesp.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

const char *ssid = "";
const char *wifi_password = "";

const char *mqtt_server = "";
const int mqtt_port = ;

const char *mqtt_user = "";
const char *mqtt_pass = "";

const char *topic_pub = "";

const int DHT_PIN = 34;
const int NOISE_PIN = 15;

DHTesp dhtSensor;

WiFiClientSecure espClient;
PubSubClient client(espClient);

unsigned long ultimoEnvio = 0;
int contador = 0;

void conectarWiFi() {
  Serial.println();
  Serial.print("Conectando a Wi-Fi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, wifi_password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Wi-Fi conectado");
  Serial.print("IP del ESP32: ");
  Serial.println(WiFi.localIP());
}

void reconectarMQTT() {
  while (!client.connected()) {
    Serial.print("Conectando al broker MQTT... ");

    String clientId = "ESP32-Fisico-";
    clientId += String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("CONECTADO AL BROKER MQTT");
    } else {
      Serial.print("Error de conexión MQTT. rc=");
      Serial.println(client.state());
      Serial.println("Reintentando en 3 segundos...");
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  dhtSensor.setup(DHT_PIN, DHTesp::DHT22);
  pinMode(NOISE_PIN, INPUT);

  conectarWiFi();

  espClient.setInsecure();

  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconectarMQTT();
  }

  client.loop();

  if (millis() - ultimoEnvio >= 5000) {
    ultimoEnvio = millis();
    contador++;

    TempAndHumidity data = dhtSensor.getTempAndHumidity();

    float temperatura = data.temperature;
    float humedad = data.humidity;

    int ruidoRaw = analogRead(NOISE_PIN);

    if (isnan(temperatura) || isnan(humedad)) {
      Serial.println("Error al leer el DHT22");
      return;
    }

    String payload = "{";
    payload += "\"dispositivo\":\"ESP32_Fisico\",";
    payload += "\"lectura_id\":" + String(contador) + ",";
    payload += "\"temperatura\":" + String(temperatura, 2) + ",";
    payload += "\"humedad\":" + String(humedad, 2) + ",";
    payload += "\"ruido_raw\":" + String(ruidoRaw);
    payload += "}";

    Serial.println();
    Serial.println("Datos obtenidos:");

    Serial.print("Temperatura: ");
    Serial.print(temperatura);
    Serial.println(" °C");

    Serial.print("Humedad: ");
    Serial.print(humedad);
    Serial.println(" %");

    Serial.print("Ruido RAW: ");
    Serial.println(ruidoRaw);

    Serial.println();
    Serial.println("JSON:");
    Serial.println(payload);

    bool resultado = client.publish(topic_pub, payload.c_str());

    if (resultado) {
      Serial.println("Mensaje publicado correctamente en MQTT");
    } else {
      Serial.println("ERROR al publicar mensaje MQTT");
    }

    Serial.println("----------------------------------------");
  }
}
