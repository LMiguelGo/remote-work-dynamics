#!/bin/bash
# Muestrea docker stats cada ~2 s hasta que exista el archivo $2 (bandera de parada).
OUT="$1"; STOP="$2"
echo "ts,name,cpu,mem,mempct,netio" > "$OUT"
while [ ! -f "$STOP" ]; do
  TS=$(date +%s)
  docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}}" frontend backend analytics broker-mqtt database 2>/dev/null | sed "s/^/$TS,/" >> "$OUT"
done
