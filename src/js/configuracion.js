'use strict'

const CONFIG_CAMPOS = [
  'nombre_negocio', 'direccion', 'telefono', 'pie_ticket', 'simbolo_moneda', 'metodo_pago_default',
  'lect_tipo',
  'imp_papel', 'imp_tipo_conexion', 'imp_ip', 'imp_puerto_red', 'imp_serie_puerto',
  'imp_serie_baudrate', 'imp_ancho',
  'backup_activado', 'backup_carpeta', 'backup_frecuencia', 'backup_hora',
  'facturas_carpeta'
]

function initConfiguracion () {
  $('#btn-guardar-config').addEventListener('click', guardarConfig)
  $('#btn-probar-impresora').addEventListener('click', probarImpresora)
  $('#btn-backup-ahora').addEventListener('click', backupAhora)
  $('#btn-buscar-carpeta').addEventListener('click', buscarCarpeta)
  $('#btn-buscar-facturas').addEventListener('click', buscarCarpetaFacturas)
  $('#btn-verificar-backup').addEventListener('click', () => verificarCarpetaCampo('backup_carpeta', '#backup-carpeta-estado'))
  $('#btn-verificar-facturas').addEventListener('click', () => verificarCarpetaCampo('facturas_carpeta', '#facturas-carpeta-estado'))
  $('#btn-copiar-db-ruta').addEventListener('click', copiarRutaDb)
  const btnAtajosReset = $('#btn-atajos-reset')
  if (btnAtajosReset) btnAtajosReset.addEventListener('click', restablecerAtajos)

  const conexion = $('[name="imp_tipo_conexion"]')
  const actualizarCamposConexion = () => {
    $('.campo-red').classList.toggle('oculto', conexion.value !== 'red')
    $('.campo-serie').classList.toggle('oculto', conexion.value !== 'serie')
  }
  conexion.addEventListener('change', actualizarCamposConexion)

  $('#form-config').addEventListener('submit', (e) => e.preventDefault())

  cargarConfigForm()
  cargarInfoSistema()
  cargarEstadoBackup()
  renderAtajos()
}

let atajoCapturando = null

function renderAtajos () {
  const cont = $('#atajos-lista')
  if (!cont || typeof mapaAtajos === 'undefined') return
  const mapa = App.atajos || mapaAtajos(App.settings)
  cont.innerHTML = ''
  ATAJOS_ACCIONES.forEach(a => {
    const combo = mapa[a.id] || ''
    const fila = document.createElement('div')
    fila.className = 'atajo-fila'
    fila.innerHTML = `
      <span>${esc(a.nombre)}</span>
      <strong class="mono">${esc(combo || '—')}</strong>
      <button type="button" class="btn btn-small" data-accion="cambiar">Cambiar</button>
      <button type="button" class="btn btn-small btn-flat" data-accion="quitar">Quitar</button>`
    fila.querySelector('[data-accion="cambiar"]').addEventListener('click', () => iniciarCapturaAtajo(a.id))
    const btnQuitar = fila.querySelector('[data-accion="quitar"]')
    btnQuitar.disabled = !combo
    btnQuitar.addEventListener('click', () => guardarAtajo(a.id, ''))
    cont.appendChild(fila)
  })
  const aviso = $('#atajos-aviso')
  if (aviso) aviso.textContent = atajoCapturando ? 'Presioná la combinación (Esc cancela)…' : ''
}

function iniciarCapturaAtajo (id) {
  atajoCapturando = id
  renderAtajos()
  window.addEventListener('keydown', capturarCombinacion, true)
}

function capturarCombinacion (e) {
  if (!atajoCapturando) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    window.removeEventListener('keydown', capturarCombinacion, true)
    atajoCapturando = null
    renderAtajos()
    return
  }
  const combo = normalizarCombinacion(e)
  if (!combo) return
  if (!esAsignable(combo)) {
    toast(`"${combo}" está reservada, elegí otra`, 'error')
    return
  }
  window.removeEventListener('keydown', capturarCombinacion, true)
  const id = atajoCapturando
  atajoCapturando = null
  guardarAtajo(id, combo)
}

async function guardarAtajo (id, combo) {
  const mapa = { ...(App.atajos || {}) }
  if (combo && hayConflicto(mapa, id, combo)) {
    toast(`"${combo}" ya está asignada a otra acción`, 'error')
    renderAtajos()
    return
  }
  mapa[id] = combo
  const r = await window.api.settings.setMany({ atajos: JSON.stringify(mapa) })
  if (!r.ok) { toast(r.error, 'error'); return }
  App.settings = r.datos
  construirAtajos()
  renderAtajos()
  toast(combo ? `Atajo ${combo} guardado ✓` : 'Atajo eliminado')
}

async function restablecerAtajos () {
  const r = await window.api.settings.setMany({ atajos: '{}' })
  if (!r.ok) { toast(r.error, 'error'); return }
  App.settings = r.datos
  construirAtajos()
  renderAtajos()
  toast('Atajos restablecidos ✓')
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
  return window.api.settings.setMany(datos).then(r => {
    if (!r.ok) {
      toast(r.error, 'error')
      throw new Error(r.error)
    }
    App.settings = r.datos
    actualizarMarca()
    return r.datos
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
  const carpeta = $('[name="backup_carpeta"]')
  if (!String(carpeta.value).trim()) {
    toast('Primero configurá la carpeta de destino del backup', 'error')
    carpeta.focus()
    return
  }
  try {
    await guardarConfig()
  } catch (_) { return }
  const r = await window.api.backup.ahora()
  if (r.ok && r.datos.ok) {
    toast(`Backup hecho: ${r.datos.archivo.split(/[\\/]/).pop()}`)
  } else {
    toast(r.ok ? r.datos.error : r.error, 'error')
  }
  cargarEstadoBackup()
}

async function buscarCarpeta () {
  const campo = $('[name="backup_carpeta"]')
  const r = await window.api.dialog.openFolder(campo.value.trim() ? { inicial: campo.value.trim() } : undefined)
  if (!r.ok) { toast(r.error, 'error'); return }
  if (r.datos && r.datos.cancelado) return
  const ruta = (r.datos && r.datos.path) || r.path || ''
  if (ruta) campo.value = ruta
  else toast('No se pudo leer la carpeta elegida', 'error')
}

async function buscarCarpetaFacturas () {
  const campo = $('[name="facturas_carpeta"]')
  const r = await window.api.dialog.openFolder(campo.value.trim() ? { inicial: campo.value.trim() } : undefined)
  if (!r.ok) { toast(r.error, 'error'); return }
  if (r.datos && r.datos.cancelado) return
  const ruta = (r.datos && r.datos.path) || r.path || ''
  if (ruta) campo.value = ruta
  else toast('No se pudo leer la carpeta elegida', 'error')
}

async function verificarCarpetaCampo (campo, estadoSel) {
  const el = $(`[name="${campo}"]`)
  const box = $(estadoSel)
  const r = await window.api.dialog.verificarCarpeta(el.value)
  if (!r.ok) {
    if (box) box.innerHTML = `<span class="badge ambar">⚠ No válida</span> ${esc(r.error)}`
    toast(r.error, 'error')
    return
  }
  el.value = r.datos.ruta
  if (box) {
    box.innerHTML = `<span class="estado-chip completada">✓ Carpeta válida${r.datos.creada ? ' (creada ahora)' : ''}</span>` +
      `<br><span class="mono">${esc(r.datos.ruta)}</span>`
  }
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
  const dbRuta = $('#db-ruta')
  if (dbRuta) dbRuta.value = i.dbPath || ''
}

async function copiarRutaDb () {
  const valor = ($('#db-ruta') || {}).value || ''
  if (!valor) return toast('Todavía no se cargó la ruta', 'error')
  try {
    await navigator.clipboard.writeText(valor)
    toast('Ruta copiada ✓')
  } catch (_) {
    $('#db-ruta').select()
    toast('Copiá la ruta seleccionada con Ctrl+C', 'error')
  }
}