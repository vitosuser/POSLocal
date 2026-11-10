'use strict'

const $ = (sel, el) => (el || document).querySelector(sel)
const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel))

const App = {
  settings: {},
  productosCache: [],
  deudoresCache: [],
  proveedoresCache: [],
  atajos: {},
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

// ---------- busqueda de texto ----------
// Normaliza mayusculas, acentos y signos: "Piñón Ácido" -> "pinon acido".
function normalizarBusqueda (texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Distancia de edicion simple, para tolerar errores de tipeo.
function distanciaEdicion (a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const actual = [i]
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(
        anterior[j] + 1,
        actual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    anterior = actual
  }
  return anterior[b.length]
}

function puntajeToken (token, campo, palabras) {
  if (!campo) return 0
  if (campo === token) return 60
  const partes = palabras || campo.split(' ')
  if (partes.includes(token)) return 55
  if (campo.startsWith(token)) return 50
  if (partes.some(p => p.startsWith(token))) return 44
  if (campo.includes(token)) return 34
  if (token.length >= 3) {
    const max = token.length >= 8 ? 2 : 1
    for (const palabra of partes) {
      if (Math.abs(palabra.length - token.length) > max) continue
      if (distanciaEdicion(token, palabra) <= max) return 20
    }
  }
  return 0
}

// Cache del texto normalizado: los productos se reemplazan al recargar la base,
// asi que la identidad del objeto alcanza como clave.
const indiceProductosCache = new WeakMap()
function indiceBusquedaProducto (p) {
  let indice = indiceProductosCache.get(p)
  if (indice) return indice
  const codigo = normalizarBusqueda(p.codigo_barras)
  const nombre = normalizarBusqueda(p.nombre)
  const marca = normalizarBusqueda(p.marca)
  const categoria = normalizarBusqueda(p.categoria)
  indice = {
    codigoCompacto: codigo.replace(/\s+/g, ''),
    nombre,
    nombreCompacto: nombre.replace(/\s+/g, ''),
    nombrePalabras: nombre ? nombre.split(' ') : [],
    marca,
    marcaCompacta: marca.replace(/\s+/g, ''),
    marcaPalabras: marca ? marca.split(' ') : [],
    categoria,
    categoriaCompacta: categoria.replace(/\s+/g, ''),
    categoriaPalabras: categoria ? categoria.split(' ') : []
  }
  indiceProductosCache.set(p, indice)
  return indice
}

// Busca productos por codigo, nombre, marca y categoria. Ignora acentos y
// mayusculas, acepta varias palabras en cualquier orden y tolera typos leves.
// Devuelve los resultados ordenados por relevancia.
function buscarProductos (lista, consulta, opciones = {}) {
  const items = Array.isArray(lista) ? lista : []
  const soloActivos = opciones.soloActivos === true
  const limite = Number(opciones.limite) > 0 ? Number(opciones.limite) : 0
  const q = normalizarBusqueda(consulta)
  const visibles = soloActivos ? items.filter(p => p && p.activo) : items.filter(Boolean)
  if (!q) return limite ? visibles.slice(0, limite) : visibles.slice()

  const tokens = q.split(' ').filter(Boolean)
  const qCompacta = q.replace(/\s+/g, '')
  const resultados = []

  for (const p of visibles) {
    const indice = indiceBusquedaProducto(p)
    const { codigoCompacto, nombre, marca, categoria } = indice

    let total = 0
    if (qCompacta && codigoCompacto === qCompacta) total += 300
    else if (qCompacta && codigoCompacto.startsWith(qCompacta)) total += 180
    else if (qCompacta && codigoCompacto.includes(qCompacta)) total += 110

    let coincide = true
    for (const token of tokens) {
      const tokenCodigo = token.replace(/\s+/g, '')
      let mejor = 0
      if (tokenCodigo && codigoCompacto.includes(tokenCodigo)) mejor = 70
      if (tokenCodigo.length >= 2) {
        if (indice.nombreCompacto.includes(tokenCodigo)) mejor = Math.max(mejor, 36)
        if (indice.marcaCompacta.includes(tokenCodigo)) mejor = Math.max(mejor, 34)
        if (indice.categoriaCompacta.includes(tokenCodigo)) mejor = Math.max(mejor, 32)
      }
      const puntajeNombre = puntajeToken(token, nombre, indice.nombrePalabras)
      if (puntajeNombre) mejor = Math.max(mejor, puntajeNombre + 10)
      mejor = Math.max(mejor, puntajeToken(token, marca, indice.marcaPalabras))
      mejor = Math.max(mejor, puntajeToken(token, categoria, indice.categoriaPalabras))
      if (!mejor) { coincide = false; break }
      total += mejor
    }
    if (!coincide) continue

    if (nombre.includes(q)) total += 30
    if (marca.includes(q)) total += 20
    if (categoria.includes(q)) total += 20
    resultados.push({ producto: p, puntaje: total })
  }

  resultados.sort((a, b) =>
    b.puntaje - a.puntaje ||
    String(a.producto.nombre).localeCompare(String(b.producto.nombre), 'es', { sensitivity: 'base' }))

  const ordenados = resultados.map(r => r.producto)
  return limite ? ordenados.slice(0, limite) : ordenados
}

// Filtro simple para listas que no son de productos (proveedores, deudores).
function coincideTexto (consulta, ...campos) {
  const q = normalizarBusqueda(consulta)
  if (!q) return true
  const texto = normalizarBusqueda(campos.join(' '))
  return q.split(' ').every(token => texto.includes(token))
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
    } else if (nombre === 'deudores') {
      if (typeof cargarDeudores === 'function') await cargarDeudores()
      if (typeof renderDeudores === 'function') renderDeudores()
    } else if (nombre === 'proveedores') {
      if (typeof cargarProveedores === 'function') await cargarProveedores()
      if (typeof renderProveedores === 'function') renderProveedores()
    } else if (nombre === 'reposicion') {
      if (typeof cargarProveedores === 'function') await cargarProveedores()
      if (typeof buscarCompras === 'function') await buscarCompras()
    } else if (nombre === 'reportes') {
      if (typeof renderReportes === 'function') renderReportes()
    } else if (nombre === 'configuracion') {
      cargarConfigForm()
      cargarEstadoBackup()
      cargarInfoSistema()
      if (typeof renderAtajos === 'function') renderAtajos()
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
  construirAtajos()
  return App.settings
}

function construirAtajos () {
  if (typeof mapaAtajos !== 'function') return
  App.atajos = mapaAtajos(App.settings)
  actualizarTitulosAtajos()
}

function actualizarTitulosAtajos () {
  const botones = {
    'abrir-cobro': '#btn-cobrar',
    'limpiar-venta': '#btn-limpiar',
    'confirmar-cobro': '#btn-confirmar-cobro',
    'nuevo-producto': '#btn-nuevo-producto'
  }
  for (const [id, sel] of Object.entries(botones)) {
    const el = $(sel)
    if (!el) continue
    const combo = (App.atajos || {})[id]
    if (el.dataset.baseHtml === undefined) el.dataset.baseHtml = el.innerHTML
    el.innerHTML = el.dataset.baseHtml + (combo ? ` <span class="atajo-tag">(${esc(combo)})</span>` : '')
  }
  const titulos = {
    'abrir-cobro': '#btn-cobrar',
    'limpiar-venta': '#btn-limpiar',
    'foco-buscador': '#buscador-venta'
  }
  const nombres = { 'abrir-cobro': 'Cobrar', 'limpiar-venta': 'Limpiar venta', 'foco-buscador': 'Buscar producto' }
  for (const [id, sel] of Object.entries(titulos)) {
    const el = $(sel)
    if (!el) continue
    const combo = (App.atajos || {})[id]
    el.title = combo ? `${nombres[id]} (${combo})` : nombres[id]
  }
}

function ejecutarAtajo (id) {
  if (id === 'confirmar-cobro') {
    const modal = $('#modal-cobro')
    if (!modal || modal.classList.contains('oculto')) return
    const btn = $('#btn-confirmar-cobro')
    if (btn && !btn.disabled) btn.click()
    return
  }
  if (id === 'nuevo-producto') {
    if (hayModalAbierto()) return
    if (typeof abrirModalProducto === 'function') abrirModalProducto()
    return
  }
  // el resto solo tiene sentido en la seccion venta y sin modales
  if (App.seccionActual !== 'venta' || hayModalAbierto()) return
  if (id === 'foco-buscador') {
    const b = $('#buscador-venta')
    if (b) b.focus()
  } else if (id === 'abrir-cobro') {
    const btn = $('#btn-cobrar')
    if (btn && !btn.disabled) btn.click()
  } else if (id === 'limpiar-venta') {
    const btn = $('#btn-limpiar')
    if (btn) btn.click()
  }
}

function manejarAtajos (e) {
  if (typeof normalizarCombinacion !== 'function') return
  const combo = normalizarCombinacion(e)
  if (!combo) return
  const mapa = App.atajos || {}
  for (const [id, c] of Object.entries(mapa)) {
    if (c && c === combo) {
      e.preventDefault()
      ejecutarAtajo(id)
      return
    }
  }
}

async function cargarProductos () {
  const r = await window.api.productos.listar()
  if (r.ok) App.productosCache = r.datos
  return App.productosCache
}

async function cargarDeudores () {
  if (typeof window !== 'undefined' && window.api && window.api.deudores) {
    const r = await window.api.deudores.listar()
    if (r.ok) App.deudoresCache = r.datos
    return App.deudoresCache
  }
  return App.deudoresCache
}

async function cargarProveedores () {
  if (typeof window !== 'undefined' && window.api && window.api.proveedores) {
    const r = await window.api.proveedores.listar()
    if (r.ok) App.proveedoresCache = r.datos
    return App.proveedoresCache
  }
  return App.proveedoresCache
}

function initCommon () {
  $$('.nav-item').forEach(b => b.addEventListener('click', () => mostrarSeccion(b.dataset.seccion)))
  $$('[data-cerrar]').forEach(b => b.addEventListener('click', () => modalCerrar(b.dataset.cerrar)))
  $$('.modal-overlay').forEach(m => m.addEventListener('click', (e) => {
    if (e.target === m) { m.classList.add('oculto'); refocusVenta() }
  }))
  // lo que se tipea fuera de un campo va derecho al buscador de venta
  window.addEventListener('keydown', capturaTeclasGlobales)
  window.addEventListener('keydown', manejarAtajos)
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