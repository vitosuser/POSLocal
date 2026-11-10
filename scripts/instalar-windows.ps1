#Requires -Version 5.1
# Instalacion de VitPos en Windows en modo "codigo vivo".
# Crea un acceso directo que ejecuta el Electron del repo (no un .exe empaquetado),
# asi los cambios de git pull se ven al reabrir la app sin rebuildear ni reinstalar.

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $repo 'node_modules\electron\dist\electron.exe'
$icono = Join-Path $repo 'build\icon.ico'
$appId = 'com.vito.vitpos'

# Permite escribir System.AppUserModel.ID en un .lnk. Sin esto, Windows puede
# mostrar dos iconos (el anclado y el de la ventana) para la misma app.
$codigoAumid = @'
using System;
using System.Runtime.InteropServices;

public static class AumidHelper
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int SHGetPropertyStoreFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        int flags,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IPropertyStore propertyStore);

    [ComImport]
    [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        [PreserveSig] int GetCount(out uint cProps);
        [PreserveSig] int GetAt(uint iProp, out PROPERTYKEY pkey);
        [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
        [PreserveSig] int Commit();
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct PROPERTYKEY
    {
        public Guid fmtid;
        public uint pid;
    }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PROPVARIANT
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(2)] public ushort wReserved1;
        [FieldOffset(4)] public ushort wReserved2;
        [FieldOffset(6)] public ushort wReserved3;
        [FieldOffset(8)] public IntPtr pointerValue;
    }

    public static void Set(string shortcutPath, string aumid)
    {
        Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
        IPropertyStore store;
        int hr = SHGetPropertyStoreFromParsingName(
            shortcutPath, IntPtr.Zero, 2, ref iid, out store);
        if (hr != 0) Marshal.ThrowExceptionForHR(hr);

        PROPERTYKEY key = new PROPERTYKEY();
        key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        key.pid = 5;

        PROPVARIANT value = new PROPVARIANT();
        value.vt = 31; // VT_LPWSTR
        value.pointerValue = Marshal.StringToCoTaskMemUni(aumid);

        try
        {
            hr = store.SetValue(ref key, ref value);
            if (hr != 0) Marshal.ThrowExceptionForHR(hr);
            hr = store.Commit();
            if (hr != 0) Marshal.ThrowExceptionForHR(hr);
        }
        finally
        {
            Marshal.FreeCoTaskMem(value.pointerValue);
            Marshal.ReleaseComObject(store);
        }
    }
}
'@

try {
  Add-Type -TypeDefinition $codigoAumid -Language CSharp
  $aumidDisponible = $true
} catch {
  $aumidDisponible = $false
}

function Fallar ([string] $mensaje) {
  Write-Host ''
  Write-Host "ERROR: $mensaje" -ForegroundColor Red
  Write-Host ''
  Read-Host 'Presiona Enter para cerrar'
  exit 1
}

Write-Host ''
Write-Host 'VitPos - Instalacion en Windows' -ForegroundColor Cyan
Write-Host "Carpeta del proyecto: $repo"
Write-Host ''

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fallar 'No se encontro Git. Instalalo desde https://git-scm.com/download/win y volve a intentar.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fallar 'No se encontro Node.js. Instala la version LTS desde https://nodejs.org y volve a intentar.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fallar 'No se encontro npm. Reinstala Node.js LTS y volve a intentar.'
}

if (-not (Test-Path $electron)) {
  Write-Host 'Instalando dependencias (npm ci)...'
  Push-Location $repo
  try {
    & npm ci
    if ($LASTEXITCODE -ne 0) {
      Fallar 'npm ci fallo. Revisa la conexion a internet y volve a intentar.'
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Host 'Las dependencias ya estan instaladas.'
}

if (-not (Test-Path $electron)) {
  Fallar "No se encontro electron.exe en $electron"
}
if (-not (Test-Path $icono)) {
  $icono = Join-Path $repo 'src\icon.png'
}

function Crear-Acceso ([string] $destino) {
  $carpeta = Split-Path -Parent $destino
  if (-not (Test-Path $carpeta)) {
    New-Item -ItemType Directory -Path $carpeta -Force | Out-Null
  }

  $shell = New-Object -ComObject WScript.Shell
  $acceso = $shell.CreateShortcut($destino)
  $acceso.TargetPath = $electron
  $acceso.Arguments = '"{0}"' -f $repo
  $acceso.WorkingDirectory = $repo
  $acceso.IconLocation = '{0},0' -f $icono
  $acceso.Description = 'VitPos - Punto de venta'
  $acceso.Save()

  if ($aumidDisponible) {
    try {
      [AumidHelper]::Set($destino, $appId)
    } catch {
      Write-Host 'Aviso: no se pudo asociar el ID de la app al acceso directo.' -ForegroundColor Yellow
    }
  }

  Write-Host "Acceso creado: $destino"
}

$escritorio = [Environment]::GetFolderPath('Desktop')
$menuInicio = [Environment]::GetFolderPath('Programs')

if ($escritorio) {
  Crear-Acceso (Join-Path $escritorio 'VitPos.lnk')
}
if ($menuInicio) {
  Crear-Acceso (Join-Path $menuInicio 'VitPos.lnk')
}

Write-Host ''
Write-Host 'Listo. Para anclarlo a la barra de tareas:' -ForegroundColor Green
Write-Host '  1. Abri el acceso directo "VitPos" del escritorio para comprobar que anda.'
Write-Host '  2. Clic derecho sobre el acceso directo "VitPos" en el escritorio.'
Write-Host '  3. Elegi "Anclar a la barra de tareas".'
Write-Host '     En Windows 11 puede estar en "Mostrar mas opciones".'
Write-Host '  Tambien podes abrir la app y anclar su icono desde la barra de tareas.'
Write-Host ''
Write-Host 'Para actualizar: cerra VitPos, ejecuta actualizar.bat y volve a abrirla.'
Write-Host ''
Read-Host 'Presiona Enter para cerrar'
