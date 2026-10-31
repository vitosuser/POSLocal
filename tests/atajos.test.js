'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  ATAJOS_ACCIONES, normalizarCombinacion, esAsignable, mapaAtajos, hayConflicto
} = require('../src/js/atajos.js')

const ev = (key, mods = {}) => ({ key, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: !!mods.meta })

test('normaliza teclas de funcion y letras', () => {
  assert.equal(normalizarCombinacion(ev('F1')), 'F1')
  assert.equal(normalizarCombinacion(ev('f3')), 'F3')
  assert.equal(normalizarCombinacion(ev('l', { ctrl: true })), 'Ctrl+L')
  assert.equal(normalizarCombinacion(ev('x', { ctrl: true, shift: true })), 'Ctrl+Shift+X')
  assert.equal(normalizarCombinacion(ev('F4', { alt: true })), 'Alt+F4')
  assert.equal(normalizarCombinacion(ev(' ')), 'Espacio')
  assert.equal(normalizarCombinacion(ev('Control')), null)
  assert.equal(normalizarCombinacion(ev('Shift')), null)
  assert.equal(normalizarCombinacion({}), null)
})

test('rechaza reservadas y teclas de formulario', () => {
  assert.equal(esAsignable('F1'), true)
  assert.equal(esAsignable('Ctrl+L'), true)
  assert.equal(esAsignable('F5'), false)
  assert.equal(esAsignable('Ctrl+R'), false)
  assert.equal(esAsignable('Alt+F4'), false)
  assert.equal(esAsignable('Enter'), false)
  assert.equal(esAsignable('Tab'), false)
  assert.equal(esAsignable('Escape'), false)
  assert.equal(esAsignable(''), false)
})

test('mapa mezcla defectos y guardados', () => {
  const base = mapaAtajos({})
  assert.equal(base['foco-buscador'], 'F3')
  assert.equal(base['abrir-cobro'], 'F1')
  assert.equal(base['limpiar-venta'], 'Ctrl+L')
  assert.equal(base['confirmar-cobro'], '')

  const custom = mapaAtajos({ atajos: JSON.stringify({ 'abrir-cobro': 'F2', 'confirmar-cobro': 'Ctrl+Enter' }) })
  assert.equal(custom['abrir-cobro'], 'F2')
  assert.equal(custom['confirmar-cobro'], 'Ctrl+Enter')
  assert.equal(custom['foco-buscador'], 'F3', 'los demas conservan el defecto')

  const cleared = mapaAtajos({ atajos: JSON.stringify({ 'abrir-cobro': '' }) })
  assert.equal(cleared['abrir-cobro'], '')

  const roto = mapaAtajos({ atajos: '{invalido' })
  assert.equal(roto['abrir-cobro'], 'F1', 'JSON roto usa defectos')
})

test('detecta conflictos entre acciones', () => {
  const mapa = mapaAtajos({})
  assert.equal(hayConflicto(mapa, 'abrir-cobro', 'F3'), true)
  assert.equal(hayConflicto(mapa, 'abrir-cobro', 'F1'), false, 'su propio combo no es conflicto')
  assert.equal(hayConflicto(mapa, 'confirmar-cobro', 'F9'), false)
  assert.equal(hayConflicto(mapa, 'confirmar-cobro', ''), false)
})

test('expone las acciones iniciales pedidas', () => {
  const ids = Object.fromEntries(ATAJOS_ACCIONES.map(a => [a.id, a.defecto]))
  assert.equal(ids['foco-buscador'], 'F3')
  assert.equal(ids['abrir-cobro'], 'F1')
  assert.equal(ids['limpiar-venta'], 'Ctrl+L')
})
