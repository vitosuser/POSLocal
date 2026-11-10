# VitPos en Windows (modo "codigo vivo")

Esta guia deja VitPos anclado a la barra de tareas y ejecutando **el codigo del
repo**. Despues de un `git pull` alcanza con cerrar y abrir la app: no hay que
generar el `.exe` de nuevo ni reinstalar nada.

> En Linux no cambia nada: se sigue usando `vitpos.sh` y `VitPos.desktop`.
> Este modo es solo para Windows.

## Por que no usar el instalador en el dia a dia

`npm run dist:win` genera un instalador con el codigo congelado adentro
(`app.asar`). Cada cambio obliga a rebuildear, reinstalar y volver a anclar.
Para la PC de la caja conviene el lanzador sobre el repo; el instalador queda
solo para distribuir VitPos a otras PCs.

## Instalacion (una sola vez)

1. Instalar **Git** (<https://git-scm.com/download/win>) y **Node.js LTS**
   (<https://nodejs.org>). Aceptar las opciones por defecto.
2. Clonar el repo en una ruta fija, sin espacios y fuera de OneDrive:

   ```bat
   git clone https://github.com/vitosuser/POSLocal.git C:\POSLocal
   ```

3. Ejecutar `C:\POSLocal\instalar-windows.bat`.
   - Instala las dependencias con `npm ci` si todavia no estan.
   - Crea los accesos directos **VitPos** en el Escritorio y en el menu Inicio.

4. Abrir el acceso directo **VitPos** para comprobar que la app inicia.
5. Clic derecho sobre el acceso directo **VitPos** del escritorio y elegir
   **Anclar a la barra de tareas**. En Windows 11 puede estar en
   **Mostrar mas opciones**.

Tambien se puede abrir la app y anclar el icono desde la barra de tareas. El
instalador le asigna a los accesos directos el mismo ID de aplicacion que usa
VitPos, para que Windows no muestre un icono duplicado.

Listo. El icono anclado ya ejecuta el codigo del repo.

## Uso diario

**Antes de actualizar, cerra VitPos.** Despues:

- Opcion facil: ejecutar `C:\POSLocal\actualizar.bat`.
  Hace `git pull`, reinstala dependencias solo si cambio `package.json` o
  `package-lock.json`, y te avisa cuando termina.
- Opcion manual:

  ```bat
  cd C:\POSLocal
  git pull
  ```

  Si el `pull` trajo cambios en `package-lock.json`, ejecutar una vez
  `npm ci`.

Despues abrir VitPos desde el icono anclado. Los cambios ya estan aplicados.

Los datos de ventas no se tocan: la base sigue en
`%APPDATA%\VitPos\vitpos.db`, igual que con la version instalada.

## Si la app esta abierta

`electron-reload` refresca solo los cambios de `src/` mientras la ventana esta
abierta, pero no los del proceso principal. Para un `pull` limpio conviene
cerrar la app primero.

## Problemas comunes

- **"No se encontro electron.exe"**: ejecutar `npm ci` dentro de
  `C:\POSLocal`.
- **Aparece un icono duplicado en la barra de tareas**: desanclar el icono
  viejo y volver a anclar desde la ventana abierta.
- **`git pull` pide usuario/contrasena**: usar GitHub Desktop, o un token de
  acceso personal de GitHub como contrasena.
- **La ruta del repo cambio**: volver a ejecutar `instalar-windows.bat` para
  regenerar los accesos directos.

## Distribuir a otras PCs

Para una PC nueva que no va a actualizarse por `git pull`, seguir usando:

```bat
npm run dist:win
```

Eso genera el instalador NSIS y el portable en `dist\`.
