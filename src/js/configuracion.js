'use strict'

const CONFIG_CAMPOS = [
  'nombre_negocio', 'direccion', 'telefono', 'pie_ticket', 'simbolo_moneda', 'metodo_pago_default',
  'lect_tipo',
  'imp_papel', 'imp_tipo_conexion', 'imp_ip', 'imp_puerto_red', 'imp_serie_puerto',
  'imp_serie_baudrate', 'imp_ancho',
  'backup_activado', 'backup_carpeta', 'backup_frecuencia', 'backup_hora'
]

function initConfiguracion () {
  $('#btn-guardar-config').addEventListener('click', guardarConfig)
  $('#btn-probar-impresora').addEventListener('click', probarImpresora)
  $('#btn-backup-ahora').addEventListener('click', backupAhora)

  const conexion = $('[name="imp_tipo_conexion"]')
  const actualizarCamposConexion = () => {
    $('.campo-red').classList.toggle('oculto', conexion.value !== 'red')
    $('.campo-serie').classList.toggle('oculto', conexion.value !== 'serie')
  }
  conexion.addEventListener('change', actualizarCamposConexion)

  cargarConfigForm()
  cargarInfoSistema()
  cargarEstadoBackup()
}

function cargarConfigForm () {
  const s = App.settings
  for (const nombre of CONFIG_CAMPOS) {
    const el = $('[name="' + nombre + '"]')
    if (!el) continue
    if (el.type === 'checkbox') el.checked = s[nombre] === '1'
    else el.value = s[nombre] == null ? '' : String(s[nombre])
  }
  $('[name="imp_tipo_conexion"]').dispatchEvent(new Event('change'))
  actualizarMarca()
}

function guardarConfig () {
  const datos = {}
  for (const nombre of CONFIG_CAMPOS) {
    const el = $('[name="' + nombre + '"]')
    if (!el) continue
    if (el.type === 'checkbox') datos[nombre] = el.checked ? '1' : '0'
    else datos[nombre] = String(el.value).trim()
  }
  window.api.settings.setMany(datos).then(r => {
    if (!r.ok) return toast(r.error, 'error')
    App.settings = r.datos
    actualizarMarca()
    toast('Configuración guardada ✓')
  })
}

function actualizarMarca () {
  const nombre = App.settings.nombre_negocio || 'VitPos'
  $('#brand-negocio').textContent = nombre
  document.title = `${nombre} — VitPos`
}

async function probarImpresora () {
  const est = await window.api.impresora.estado()
  if (est.ok && est.datos.papel === 'desactivada') {
    toast('Activá la impresora antes de probar', 'error')
    return
  }
  const r = await window.api.impresora.probar()
  if (r.ok) toast('Impresora OK ✓', 'ok')
  else toast(r.error, 'error')
}

async function backupAhora () {
  const r = await window.api.backup.ahora()
  if (r.ok && r.datos.ok) {
    toast(`Backup hecho: ${r.datos.archivo.split(/[\\/]/).pop()}`)
  } else {
    toast(r.ok ? r.datos.error : r.error, 'error')
  }
  cargarEstadoBackup()
}

async function cargarEstadoBackup () {
  const r = await window.api.backup.estado()
  if (!r.ok) return
  const b = r.datos
  const ultimo = b.ultimo
    ? `Último backup: <strong>${esc(b.ultimo)}</strong><br><span class="mono">${esc(b.ultimoArchivo || '')}</span>`
    : 'Todavía no hay backups.'
  $('#backup-estado').innerHTML = `
    ${b.activado ? `<span class="estado-chip completada">● Backup automático activo</span>` : '● Backup automático desactivado'}
    <br>Carpeta: <strong>${esc(b.carpeta || '—')}</strong>
    <br>Frecuencia: ${b.frecuencia} ${b.frecuencia === 'diario' ? `· Hora ${esc(b.hora)}` : ''}
    <br>${ultimo}`
}

async function cargarInfoSistema () {
  const r = await window.api.app.info()
  if (!r.ok) return
  const i = r.datos
  $('#info-sistema').innerHTML = `
    <div><dt>Programa</dt><dd>${esc(i.nombre)} v${esc(i.version)}</dd></div>
    <div><dt>Sistema operativo</dt><dd>${esc(i.plataforma)}</dd></div>
    <div><dt>Carpeta de datos</dt><dd>${esc(i.userData)}</dd></div>
    <div><dt>Base de datos</dt><dd class="mono">${esc(i.dbPath)}</dd></div>`
  $('#info-version').textContent = `VitPos v${i.version}`
}