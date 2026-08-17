'use strict'

// Generador de tickets ESC/POS. Normaliza acentos a ASCII para
// compatibilidad con la mayoria de impresoras termicas.

const ESC = '\x1b'
const GS = '\x1d'

function cmd (bytes) { return Buffer.from(bytes) }
function txt (s) { return Buffer.from(normalizar(String(s)), 'ascii') }
function linea (s, nl = true) { return Buffer.concat([txt(s), nl ? Buffer.from([0x0a]) : Buffer.alloc(0)]) }

function normalizar (s) {
  const mapa = {
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n',
    Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N',
    ü: 'u', Ü: 'U', 'º': ' ', '°': ' ', 'ª': ' '
  }
  return s.replace(/[áéíóúñÁÉÍÓÚÑüÜº°ª]/g, (c) => mapa[c] || c)
}

function anchoEnCaracteres (anchoMm) {
  return anchoMm === 80 ? 48 : 32
}

function chars (n, c) {
  const out = []
  for (let i = 0; i < n; i++) out.push(c === undefined ? '' : c)
  return out.join('')
}

function padDerecha (s, w) { return s + chars(Math.max(0, w - s.length)) }
function padCentrado (s, w) { const l = Math.max(0, Math.floor((w - s.length) / 2)); return chars(l, ' ') + s }
function moneda (cents, simbolo) { return `${simbolo} ${(cents / 100).toFixed(2)}` }

function initImpresora () { return cmd([0x1b, 0x40]) }

function centradoOn () { return cmd([0x1b, 0x61, 0x01]) }
function izquierdaOn () { return cmd([0x1b, 0x61, 0x00]) }

function negritaOn () { return cmd([0x1b, 0x45, 0x01]) }
function negritaOff () { return cmd([0x1b, 0x45, 0x00]) }

function dobleAltoOn () { return cmd([0x1b, 0x21, 0x10]) }
function normalSize () { return cmd([0x1b, 0x21, 0x00]) }

function feed (n = 1) { return cmd([0x1b, 0x64, n]) }
function cortar () { return cmd([0x1d, 0x56, 0x01]) }

function separador (w, c = '=') { return linea(chars(w, c)) }
function enBlanco (n = 1) { return cmd(new Array(n * 3).fill(0x00)) }

function lineaItem (nombre, cantidad, pu, total, w) {
  const out = [linea(nombre)]
  const unaUnidad = cantidad === 1 || cantidad === 1.0
  let der = unaUnidad ? moneda(total, '') : `${cantidad} x ${moneda(pu, '')} = ${moneda(total, '')}`
  der = der.trim()
  out.push(linea(padDerecha(der, w)))
  return Buffer.concat(out)
}

// ------- Ticket de venta -------

function ticketVenta (datos) {
  const s = datos.settings
  const w = anchoEnCaracteres(Number(s.imp_ancho) || 58)
  const simbolo = s.simbolo_moneda || '$'
  const pie = s.pie_ticket || ''

  const partes = []

  partes.push(initImpresora())
  partes.push(centradoOn(), dobleAltoOn(), linea(s.nombre_negocio || 'VITPOS'), normalSize(), izquierdaOn())
  if (s.direccion) { partes.push(centradoOn(), linea(s.direccion), izquierdaOn()) }
  if (s.telefono) { partes.push(centradoOn(), linea(`Tel: ${s.telefono}`), izquierdaOn()) }
  partes.push(separador(w))

  const fecha = datos.fecha.replace('T', ' ')
  partes.push(linea(`Venta N° ${datos.ventaId}`))
  partes.push(linea(`Fecha: ${fecha}`))
  partes.push(linea(`Operador: ${datos.operador || '-'}`))
  partes.push(separador(w))

  for (const it of datos.items) {
    partes.push(lineaItem(it.nombre, it.cantidad, it.precio_unitario, it.total_linea, w))
  }

  partes.push(separador(w))
  partes.push(linea(padDerecha(`Subtotal: ${moneda(datos.subtotal, simbolo)}`, w)))
  if (datos.descuento > 0) {
    partes.push(negritaOn(), linea(padDerecha(`Descuento: -${moneda(datos.descuento, simbolo)}`, w)), negritaOff())
  }
  partes.push(negritaOn(), dobleAltoOn(), linea(padDerecha(`TOTAL: ${moneda(datos.total, simbolo)}`, w)), normalSize(), negritaOff())
  partes.push(linea(padDerecha(`Pagado: ${moneda(datos.recibido, simbolo)}`, w)))
  if (datos.cambio > 0) {
    partes.push(linea(padDerecha(`Cambio: ${moneda(datos.cambio, simbolo)}`, w)))
  }
  partes.push(linea(`Metodo: ${datos.metodo_pago}`))
  partes.push(separador(w))

  if (pie) { partes.push(centradoOn(), linea(pie), izquierdaOn()) }
  partes.push(enBlanco(2))
  partes.push(feed(2))
  partes.push(cortar())

  return Buffer.concat(partes)
}

// ------- Ticket de prueba -------

function ticketPrueba (settings) {
  const s = settings
  const w = anchoEnCaracteres(Number(s.imp_ancho) || 58)
  const simbolo = s.simbolo_moneda || '$'
  const partes = []
  partes.push(initImpresora())
  partes.push(centradoOn(), dobleAltoOn(), linea('PRUEBA DE IMPRESION'), normalSize())
  partes.push(centradoOn(), linea(s.nombre_negocio || 'VITPOS'), izquierdaOn())
  partes.push(separador(w))
  partes.push(linea('Si lees este texto,'))
  partes.push(linea('la impresora funciona.'))
  partes.push(separador(w))
  partes.push(linea(padDerecha(`Total de prueba: ${moneda(12345, simbolo)}`, w)))
  partes.push(enBlanco(2))
  partes.push(feed(2))
  partes.push(cortar())
  return Buffer.concat(partes)
}

// ------- Ticket HTML (para impresora del sistema) -------

function ticketVentaHtml (datos) {
  const s = datos.settings
  const simbolo = s.simbolo_moneda || '$'
  const filas = datos.items.map(it => `
    <tr>
      <td>${esc(it.nombre)}</td>
      <td class="num">${it.cantidad}</td>
      <td class="num">${moneda(it.precio_unitario, simbolo)}</td>
      <td class="num">${moneda(it.total_linea, simbolo)}</td>
    </tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: 'Consolas','Courier New',monospace; width: ${(Number(s.imp_ancho) || 58) * 3.4}px; margin: 0 auto; font-size: 12px; }
    .cent { text-align: center; } h1 { font-size: 16px; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; } td.num { text-align: right; white-space: nowrap; }
    .doble { font-size: 16px; font-weight: bold; }
    hr { border: 1px dashed #000; }
  </style></head><body>
    <div class="cent"><h1>${esc(s.nombre_negocio || 'VITPOS')}</h1>
    ${s.direccion ? `<div>${esc(s.direccion)}</div>` : ''}
    ${s.telefono ? `<div>Tel: ${esc(s.telefono)}</div>` : ''}</div>
    <hr><div>Venta N&deg; ${datos.ventaId} &nbsp; Fecha: ${esc(datos.fecha)}</div>
    <div>Operador: ${esc(datos.operador || '-')}</div>
    <hr>
    <table><thead><tr><th>Producto</th><th class="num">Cant</th><th class="num">P.U.</th><th class="num">Total</th></tr></thead>
    <tbody>${filas}</tbody></table>
    <hr>
    <div>Subtotal: ${moneda(datos.subtotal, simbolo)}</div>
    ${datos.descuento > 0 ? `<div>Descuento: -${moneda(datos.descuento, simbolo)}</div>` : ''}
    <div class="doble">TOTAL: ${moneda(datos.total, simbolo)}</div>
    <div>Pagado: ${moneda(datos.recibido, simbolo)}</div>
    ${datos.cambio > 0 ? `<div>Cambio: ${moneda(datos.cambio, simbolo)}</div>` : ''}
    <div>Metodo: ${esc(datos.metodo_pago)}</div>
    <div class="cent"><br>${esc(s.pie_ticket || '')}</div>
  </body></html>`
}

function esc (s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

module.exports = {
  ticketVenta, ticketPrueba, ticketVentaHtml,
  normalizar, anchoEnCaracteres, moneda
}