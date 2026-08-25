'use strict'

const fs = require('fs')
const path = require('path')
const { BrowserWindow, dialog } = require('electron')

function esc (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function moneda (cents, simbolo) {
  const n = (Number(cents) || 0) / 100
  return `${simbolo} ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fechaLarga (s) {
  const [y, m, d] = String(s).slice(0, 10).split('-')
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${Number(d)} de ${meses[Number(m) - 1]} ${y}`
}

function tabla (titulo, columnas, filas) {
  if (!filas.length) return ''
  const th = columnas.map(c => `<th${c.num ? ' class="num"' : ''}>${esc(c.t)}</th>`).join('')
  const trs = filas.map(f => `<tr>${columnas.map(c => {
    const v = typeof c.v === 'function' ? c.v(f) : f[c.v]
    return `<td${c.num ? ' class="num"' : ''}>${esc(v)}</td>`
  }).join('')}</tr>`).join('')
  return `<div class="bloque"><h2>${esc(titulo)}</h2><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`
}

function barrasDia (rep) {
  // completa los dias sin ventas para que el grafico sea continuo
  const mapa = new Map(rep.porDia.map(d => [d.fecha, d]))
  const dias = []
  let d = new Date(rep.periodo.desde.slice(0, 10) + 'T00:00:00')
  const fin = new Date(rep.periodo.hasta.slice(0, 10) + 'T00:00:00')
  while (d <= fin && dias.length < 62) {
    const p = (n) => String(n).padStart(2, '0')
    const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    dias.push(mapa.get(iso) || { fecha: iso, facturado: 0, unidades: 0, ventas: 0 })
    d.setDate(d.getDate() + 1)
  }
  const max = Math.max(1, ...dias.map(x => x.facturado))
  const cols = dias.map(x => `
    <div class="col" title="${esc(x.fecha)}: ${esc(moneda(x.facturado, rep.moneda))}">
      <div class="barra" style="height:${Math.max(2, Math.round((x.facturado / max) * 100))}%"></div>
      <span>${x.fecha.slice(8)}</span>
    </div>`).join('')
  return `<div class="chart">${cols}</div>`
}

function barrasSemana (rep) {
  const max = Math.max(1, ...rep.porDiaSemana.map(x => x.facturado))
  return rep.porDiaSemana.map(x => `
    <div class="fila-h">
      <span class="etq">${esc(x.nombre)}</span>
      <div class="track"><div class="rell" style="width:${Math.round((x.facturado / max) * 100)}%"></div></div>
      <span class="val">${esc(moneda(x.facturado, rep.moneda))}</span>
    </div>`).join('')
}

function reporteHtml (rep) {
  const r = rep.resumen
  const variacion = r.variacionPct == null
    ? '<em>sin datos del período anterior</em>'
    : `${r.variacionPct >= 0 ? '+' : ''}${r.variacionPct}% vs período anterior`
  const cards = [
    ['Facturado', moneda(r.facturado, rep.moneda)],
    ['Ventas', String(r.ventas)],
    ['Ticket promedio', moneda(r.ticketPromedio, rep.moneda)],
    ['Promedio diario', moneda(r.promedioDiario, rep.moneda)],
    ['Unidades vendidas', String(r.unidades)],
    ['Utilidad estimada', moneda(r.utilidad, rep.moneda)]
  ].map(([t, v]) => `<div class="card"><span>${esc(t)}</span><strong>${esc(v)}</strong></div>`).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1c2b27; font-size: 12px; padding: 26px 30px; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0e8a6d; padding-bottom: 10px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #0a6b55; }
    .sub { color: #68807a; font-size: 11px; margin-top: 2px; }
    .fecha { text-align: right; color: #68807a; font-size: 11px; }
    h2 { font-size: 13px; color: #0a6b55; margin-bottom: 6px; border-left: 4px solid #0e8a6d; padding-left: 7px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
    .card { background: #f0f7f4; border: 1px solid #d9e8e2; border-radius: 8px; padding: 8px 12px; }
    .card span { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: #68807a; }
    .card strong { font-size: 15px; color: #12332c; }
    .variacion { grid-column: 1 / -1; font-size: 11px; color: #68807a; }
    .dos-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 16px; }
    .panel { border: 1px solid #dde6e3; border-radius: 8px; padding: 10px 12px; }
    .chart { display: flex; align-items: flex-end; gap: 3px; height: 120px; padding-top: 4px; }
    .col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
    .barra { width: 100%; background: linear-gradient(180deg, #14b884, #0a6b55); border-radius: 3px 3px 0 0; min-height: 2px; }
    .col span { font-size: 8.5px; color: #68807a; margin-top: 3px; }
    .fila-h { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
    .etq { width: 74px; font-size: 11px; color: #40564f; }
    .track { flex: 1; background: #edf3f1; border-radius: 5px; height: 13px; overflow: hidden; }
    .rell { height: 100%; background: linear-gradient(90deg, #14b884, #0a6b55); }
    .val { width: 92px; text-align: right; font-size: 11px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f0f7f4; color: #40564f; text-align: left; padding: 5px 7px; border-bottom: 2px solid #0e8a6d; font-size: 10px; text-transform: uppercase; }
    td { padding: 4px 7px; border-bottom: 1px solid #edf3f1; }
    td.num, th.num { text-align: right; }
    .bloque { margin-bottom: 14px; }
    footer { margin-top: 18px; color: #9ab8b0; font-size: 10px; text-align: center; }
  </style></head><body>
    <header>
      <div>
        <h1>Reporte de ventas</h1>
        <div class="sub">Período: ${esc(fechaLarga(rep.periodo.desde))} — ${esc(fechaLarga(rep.periodo.hasta))}</div>
      </div>
      <div class="fecha">Generado el ${esc(new Date().toLocaleString('es-AR'))}<br>VitPos</div>
    </header>

    <div class="cards">${cards}<div class="variacion">${esc(variacion)} · Descuentos aplicados: ${esc(moneda(r.descuentos, rep.moneda))}</div></div>

    <div class="dos-col">
      <div class="panel"><h2>Ventas por día</h2>${barrasDia(rep)}</div>
      <div class="panel"><h2>Días más vendidos</h2>${barrasSemana(rep)}</div>
    </div>

    <div class="dos-col">
      <div>${tabla('Top productos por facturación', [
        { t: 'Producto', v: 'nombre' },
        { t: 'Marca', v: (f) => f.marca || '—' },
        { t: 'Un.', v: (f) => f.unidades, num: true },
        { t: 'Facturado', v: (f) => moneda(f.facturado, rep.moneda), num: true },
        { t: 'Utilidad', v: (f) => moneda(f.utilidad, rep.moneda), num: true }
      ], rep.topProductos)}</div>
      <div>${tabla('Top productos por unidades', [
        { t: 'Producto', v: 'nombre' },
        { t: 'Marca', v: (f) => f.marca || '—' },
        { t: 'Un.', v: (f) => f.unidades, num: true },
        { t: 'Facturado', v: (f) => moneda(f.facturado, rep.moneda), num: true }
      ], rep.topUnidades)}</div>
    </div>

    <div class="dos-col">
      <div>${tabla('Por marca', [
        { t: 'Marca', v: 'nombre' },
        { t: 'Un.', v: (f) => f.unidades, num: true },
        { t: 'Facturado', v: (f) => moneda(f.facturado, rep.moneda), num: true },
        { t: 'Utilidad', v: (f) => moneda(f.utilidad, rep.moneda), num: true }
      ], rep.porMarca)}</div>
      <div>${tabla('Por categoría', [
        { t: 'Categoría', v: 'nombre' },
        { t: 'Un.', v: (f) => f.unidades, num: true },
        { t: 'Facturado', v: (f) => moneda(f.facturado, rep.moneda), num: true },
        { t: 'Utilidad', v: (f) => moneda(f.utilidad, rep.moneda), num: true }
      ], rep.porCategoria)}</div>
    </div>

    ${tabla('Por método de pago', [
      { t: 'Método', v: 'nombre' },
      { t: 'Ventas', v: 'ventas', num: true },
      { t: 'Facturado', v: (f) => moneda(f.facturado, rep.moneda), num: true }
    ], rep.porMetodoPago)}

    <footer>Utilidad estimada calculada sobre el costo registrado de cada producto al momento de la venta.</footer>
  </body></html>`
}

async function exportarReportePdf (rep, app) {
  const html = reporteHtml(rep)
  const win = new BrowserWindow({ show: false })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.5, bottom: 0.5, left: 0.45, right: 0.45 }
    })

    const documentos = app.getPath('documents')
    const nombre = `vitpos-reporte-${rep.periodo.desde}_${rep.periodo.hasta}.pdf`
    const r = await dialog.showSaveDialog({
      title: 'Guardar reporte en PDF',
      defaultPath: path.join(documentos, nombre),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false, cancelado: true }

    fs.writeFileSync(r.filePath, pdf)
    return { ok: true, archivo: r.filePath }
  } finally {
    try { win.destroy() } catch (_) {}
  }
}

module.exports = { reporteHtml, exportarReportePdf }