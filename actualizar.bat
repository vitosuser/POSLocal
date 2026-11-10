@echo off
setlocal
cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
  echo No se encontro Git. Instalalo desde https://git-scm.com/download/win
  pause
  exit /b 1
)

echo Actualizando VitPos...
echo.
git pull --ff-only
if errorlevel 1 (
  echo.
  echo No se pudo actualizar. Revisa el mensaje de arriba.
  pause
  exit /b 1
)

rem Si cambiaron package.json o package-lock.json, hay que reinstalar dependencias.
git diff --name-only "HEAD@{1}" HEAD 2>nul | findstr /I /C:"package-lock.json" /C:"package.json" >nul
if not errorlevel 1 (
  where npm >nul 2>&1
  if errorlevel 1 (
    echo.
    echo Cambiaron las dependencias pero no se encontro npm. Instala Node.js LTS.
    pause
    exit /b 1
  )
  echo.
  echo Instalando dependencias nuevas...
  call npm ci
  if errorlevel 1 (
    echo.
    echo npm ci fallo. Revisa la conexion a internet y volve a intentar.
    pause
    exit /b 1
  )
)

echo.
echo Listo. Abri VitPos desde el icono anclado.
pause
