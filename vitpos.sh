#!/bin/bash
# Lanzador de VitPos (doble clic, sin terminal ni comandos).
# Usa el codigo actual de esta carpeta: los cambios se ven al reiniciar la app.
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON="$APP_DIR/node_modules/.bin/electron"

if [ ! -x "$ELECTRON" ]; then
  MSG="No se encontró el programa. Pedile al técnico que ejecute la instalación."
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="VitPos" --text="$MSG"
  else
    echo "$MSG" >&2
  fi
  exit 1
fi

cd "$APP_DIR" || exit 1
exec "$ELECTRON" "$APP_DIR" >>"$HOME/.vitpos.log" 2>&1
