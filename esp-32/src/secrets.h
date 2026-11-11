#pragma once
#define WIFI_SSID   ""
#define WIFI_PASS   ""
#define MQTT_HOST   ""
#define MQTT_PORT   
#define MQTT_USER   ""
#define MQTT_PASS   ""
#define MQTT_TOPIC  ""
#define DEVICE_ID   ""

// Solo se usa si VALIDAR_CERT = 1 en main.cpp.
// Pegar aquí el contenido de los certificados, uno debajo del otro, sin texto en medio.
static const char CA_CERT[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
-----END CERTIFICATE-----
)EOF";