'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const ticket = require('../electron/printer/ticket.js')
const red = require('../electron/printer/red.js')

const settings = {
  nombre_negocio: 'PETSHOP VITO',
  direccion: 'Av. Siempre Viva 123',
  telefono: '11 5555 0000',
  pie_ticket: 'Gracias por su compra',
  simbolo_moneda: '$',
  imp_ancho: '58'
}

test('genera ticket de venta en ESC/POS', () => {
  const buf = ticket.ticketVenta({
    settings,
    ventaId: 10,
    fecha: '2026-08-16 12:00:00',
    operador: 'Vito',
    items: [
      { nombre: 'Croquetas Perro 3kg (papelón)', cantidad: 1, precio_unitario: 15000, total_linea: 15000 },
      { nombre: 'Detergente 1L', cantidad: 2, precio_unitario: 2400, total_linea: 4800 }
    ],
    subtotal: 19800, descuento: 800, total: 19000,
    recibido: 20000, cambio: 1000, metodo_pago: 'Efectivo'
  })
  assert.ok(buf.length > 50)
  const texto = buf.toString('ascii')
  assert.match(texto, /PETSHOP VITO/)
  assert.match(texto, /Venta N/)
  // acentos normalizados a ascii
  assert.ok(!texto.includes('ñ'))   // "papelón" -> "papelon"
  assert.ok(texto.includes('papelon'))
  assert.match(texto, /TOTAL/)
})

test('red: error claro cuando no hay IP configurada', async () => {
  await assert.rejects(
    () => red.imprimirPorRed('', 9100, Buffer.from('x')),
    /Falta la direccion IP/
  )
})

test('red: error al conectar a IP inaccesible', async () => {
  await assert.rejects(
    () => red.imprimirPorRed('10.255.255.1', 9100, Buffer.from('x'), 3000),
    (e) => /No se pudo conectar|agotado|Timeout|Tiempo/.test(e.message)
  )
})