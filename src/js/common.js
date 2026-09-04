'use strict'

const $ = (sel, el) => (el || document).querySelector(sel)
const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel))

const App = {
  settings: {},
  productosCache: [],
  seccionActual: 'venta'
}

function hoyLocal () {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function aCentavos (v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

function fmtMoneda (centavos) {
  const n = (Number(centavos) || 0) / 100
  const texto = n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${App.settings.simbolo_moneda || '$'} ${texto}`
}

function fmtStock (n) {
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 1000) / 1000)
}

function esc (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

let toastTimer = null
function toast (msg, tipo = '') {
  const t = $('#toast')
  if (!t) return
  t.textContent = msg
  t.className = `toast ${tipo}`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { t.classList.add('oculto') }, 3200)
}

function hayModalAbierto () {
  return $$('.modal-overlay').some(m => !m.classList.contains('oculto'))
}

function esCampoEditable (el) {
  if (!el) return false
  if (el.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

function refocusVenta () {
  if (App.seccionActual !== 'venta' || hayModalAbierto()) return
  // no robar foco si el usuario ya está en un campo editable
  if (esCampoEditable(document.activeElement)) return
  setTimeout(() => {
    const b = $('#buscador-venta')
    if (b) b.focus()
  }, 30)
}

// Refresca los datos de la seccion entrante con lo que hay hoy en la base
async function refrescarSeccion (nombre) {
  try {
    if (nombre === 'venta') {
      await cargarProductos()
      if (typeof revincularCarrito === 'function') revincularCarrito()
      renderCarrito()
      actualizarVentasDelDia()
    } else if (nombre === 'productos') {
      await cargarProductos()
      renderProductos()
    } else if (nombre === 'stock') {
      await cargarProductos()
      renderStock()
    } else if (nombre === 'historial') {
      buscarHistorial()
    } else if (nombre === 'reportes') {
      if (typeof renderReportes === 'function') renderReportes()
    } else if (nombre === 'configuracion') {
      cargarConfigForm()
      cargarEstadoBackup()
      cargarInfoSistema()
    }
  } catch (_) { /* nunca romper la navegacion */ }
}

function mostrarSeccion (nombre) {
  App.seccionActual = nombre
  $$('.seccion').forEach(s => s.classList.toggle('activa', s.id === `seccion-${nombre}`))
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.seccion === nombre))
  refrescarSeccion(nombre)
  setTimeout(() => {
    if (nombre === 'venta') $('#buscador-venta').focus()
  }, 40)
}

function modalAbrir (id) { $(`#${id}`).classList.remove('oculto') }
function modalCerrar (id) {
  $(`#${id}`).classList.add('oculto')
  refocusVenta()
}

function reloj () {
  const el = $('#clock')
  if (!el) return
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  el.textContent = `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

async function cargarConfig () {
  const r = await window.api.settings.getAll()
  if (r.ok) App.settings = r.datos
  return App.settings
}

async function cargarProductos () {
  const r = await window.api.productos.listar()
  if (r.ok) App.productosCache = r.datos
  return App.productosCache
}

function initCommon () {
  $$('.nav-item').forEach(b => b.addEventListener('click', () => mostrarSeccion(b.dataset.seccion)))
  $$('[data-cerrar]').forEach(b => b.addEventListener('click', () => modalCerrar(b.dataset.cerrar)))
  $$('.modal-overlay').forEach(m => m.addEventListener('click', (e) => {
    if (e.target === m) { m.classList.add('oculto'); refocusVenta() }
  }))
  // lo que se tipea fuera de un campo va derecho al buscador de venta
  window.addEventListener('keydown', capturaTeclasGlobales)
  reloj()
  setInterval(reloj, 1000)
}

function capturaTeclasGlobales (e) {
  if (App.seccionActual !== 'venta') return
  if (hayModalAbierto()) return
  const t = e.target
  // no intervenir si ya se esta escribiendo en algun campo editable
  if (esCampoEditable(t)) return
  // no robar Enter/Espacio a los botones
  if ((e.key === 'Enter' || e.key === ' ') && t && t.tagName === 'BUTTON') return
  const buscador = $('#buscador-venta')
  if (!buscador) return
  if (e.key === 'Backspace') { e.preventDefault(); buscador.focus(); return }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    buscador.focus()
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $$('.modal-overlay').forEach(m => { if (!m.classList.contains('oculto')) { m.classList.add('oculto'); refocusVenta() } })
    if (typeof ocultarSugerencias === 'function') ocultarSugerencias()
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    $('#buscar-productos').focus()
  }
})