'use strict'

// Logica pura de atajos de teclado (sin acceso al DOM en la carga,
// para poder probarla con node --test).

const ATAJOS_ACCIONES = [
  { id: 'foco-buscador', nombre: 'Ir al buscador de venta', defecto: 'F3' },
  { id: 'abrir-cobro', nombre: 'Abrir cobro', defecto: 'F1' },
  { id: 'limpiar-venta', nombre: 'Limpiar venta', defecto: 'Ctrl+L' },
  { id: 'confirmar-cobro', nombre: 'Confirmar cobro', defecto: '' },
  { id: 'nuevo-producto', nombre: 'Nuevo producto', defecto: '' }
]

// Combinaciones que el navegador/SO necesitan: no se pueden asignar
const ATAJOS_RESERVADOS = ['F5', 'F11', 'F12', 'Ctrl+R', 'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+S', 'Alt+F4']
// Teclas que romperian formularios si se asignaran
const ATAJOS_NO_ASIGNABLES = ['Enter', 'Tab', 'Escape']

// Normaliza un evento keydown a 'F1' | 'Ctrl+L' | ... ; null si es solo modificador
function normalizarCombinacion (e) {
  if (!e || typeof e.key !== 'string') return null
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const partes = []
  if (e.ctrlKey || e.metaKey) partes.push('Ctrl')
  if (e.altKey) partes.push('Alt')
  if (e.shiftKey) partes.push('Shift')
  let tecla = e.key
  if (/^F\d{1,2}$/i.test(tecla)) tecla = tecla.toUpperCase()
  else if (tecla === ' ') tecla = 'Espacio'
  else if (tecla.length === 1) tecla = tecla.toUpperCase()
  partes.push(tecla)
  return partes.join('+')
}

function esAsignable (combo) {
  if (!combo) return false
  if (ATAJOS_RESERVADOS.includes(combo)) return false
  const tecla = combo.split('+').pop()
  if (ATAJOS_NO_ASIGNABLES.includes(tecla)) return false
  return true
}

// Mezcla defectos + lo guardado en settings.atajos (JSON). '' limpia el atajo.
function mapaAtajos (settings) {
  const mapa = {}
  for (const a of ATAJOS_ACCIONES) mapa[a.id] = a.defecto
  let guardado = null
  try { guardado = JSON.parse((settings || {}).atajos || 'null') } catch (_) { guardado = null }
  if (guardado && typeof guardado === 'object') {
    for (const a of ATAJOS_ACCIONES) {
      if (typeof guardado[a.id] === 'string') mapa[a.id] = guardado[a.id]
    }
  }
  return mapa
}

function hayConflicto (mapa, id, combo) {
  if (!combo) return false
  return Object.entries(mapa).some(([otraId, otra]) => otraId !== id && otra === combo)
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ATAJOS_ACCIONES, ATAJOS_RESERVADOS, normalizarCombinacion, esAsignable, mapaAtajos, hayConflicto }
}
