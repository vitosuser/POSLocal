'use strict'

const REP_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const Reportes = { tipo: 'semana', offset: 0 }

function repParseDia (s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function repAFecha (d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function repSumarDias (fechaStr, n) {
  const d = repParseDia(fechaStr)
  d.setDate(d.getDate() + n)
  return repAFecha(d)
}

function repLunesDe (fechaStr) {
  const d = repParseDia(fechaStr)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return repAFecha(d)
}

function initReportes () {
  $('#rep-tipo').addEventListener('change', (e) => {
    Reportes.tipo = e.target.value
    Reportes.offset = 0
    const esRango = Reportes.tipo === 'rango'
    $('#rep-desde').classList.toggle('oculto', !esRango)
    $('#rep-hasta').classList.toggle('oculto', !esRango)
    if (!esRango) { $('#rep-prev').classList.remove('oculto'); $('#rep-next').classList.remove('oculto'); $('#rep-hoy').classList.remove('oculto') } else { $('#rep-prev').classList.add('oculto'); $('#rep-next').classList.add('oculto'); $('#rep-hoy').classList.add('oculto') }
    renderReportes()
  })
  $('#rep-prev').addEventListener('click', () => { Reportes.offset--; renderReportes() })
  $('#rep-next').addEventListener('click', () => { Reportes.offset++; renderReportes() })
  $('#rep-hoy').addEventListener('click', () => { Reportes.offset = 0; renderReportes() })
  $('#rep-desde').addEventListener('change', renderReportes)
  $('#rep-hasta').addEventListener('change', renderReportes)
  $('#rep-pdf').addEventListener('click', exportarPdfReporte)
  renderReportes()
}

function repRangoActual () {
  const hoy = hoyLocal()
  if (Reportes.tipo === 'semana') {
    const desde = repSumarDias(repLunesDe(hoy), Reportes.offset * 7)
    return { desde, hasta: repSumarDias(desde, 6) }
  }
  if (Reportes.tipo === 'mes') {
    const base = repParseDia(hoy)
    const d = new Date(base.getFullYear(), base.getMonth() + Reportes.offset, 1)
    const hasta = repAFecha(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    return { desde: repAFecha(d), hasta }
  }
  const desde = $('#rep-desde').value || hoy
  const hasta = $('#rep-hasta').value || hoy
  return { desde: desde <= hasta ? desde : hasta, hasta }
}

async function renderReportes () {
  const { desde, hasta } = repRangoActual()
  pintarPeriodoLabel(desde, hasta)

  const r = await window.api.reportes.generar({ desde, hasta })
  if (!r.ok) { toast(r.error, 'error'); return }
  pintarReporte(r.datos)
}

function pintarPeriodoLabel (desde, hasta) {
  let texto
  if (Reportes.tipo === 'semana') {
    texto = `Semana del ${desde.slice(8)}/${desde.slice(5, 7)} al ${hasta.slice(8)}/${hasta.slice(5, 7)}`
  } else if (Reportes.tipo === 'mes') {
    const d = repParseDia(desde)
    texto = `${REP_MESES[d.getMonth()]} ${d.getFullYear()}`
  } else {
    texto = `${desde} → ${hasta}`
  }
  $('#rep-label').textContent = texto
  $('#rep-next').disabled = Reportes.tipo !== 'rango' && Reportes.offset >= 0
}

function pintarReporte (rep) {
  const r = rep.resumen
  const variacion = r.variacionPct == null
    ? '<span class="rep-var">sin datos del período anterior</span>'
    : `<span class="rep-var ${r.variacionPct >= 0 ? 'sube' : 'baja'}">${r.variacionPct >= 0 ? '▲' : '▼'} ${Math.abs(r.variacionPct)}% vs anterior</span>`

  $('#rep-resumen').innerHTML = `
    <div class="rep-card"><span>Facturado</span><strong>${fmtMoneda(r.facturado)}</strong></div>
    <div class="rep-card"><span>Ventas</span><strong>${r.ventas}</strong></div>
    <div class="rep-card"><span>Ticket promedio</span><strong>${fmtMoneda(r.ticketPromedio)}</strong></div>
    <div class="rep-card"><span>Promedio diario</span><strong>${fmtMoneda(r.promedioDiario)}</strong></div>
    <div class="rep-card"><span>Unidades</span><strong>${fmtStock(r.unidades)}</strong></div>
    <div class="rep-card"><span>Utilidad estimada</span><strong>${fmtMoneda(r.utilidad)}</strong>${variacion}</div>`

  // grafico por dia
  const mapaDias = new Map(rep.porDia.map(d => [d.fecha, d]))
  const dias = []
  for (let f = rep.periodo.desde; f <= rep.periodo.hasta && dias.length < 62; f = repSumarDias(f, 1)) {
    dias.push(mapaDias.get(f) || { fecha: f, facturado: 0, unidades: 0, ventas: 0 })
  }
  const maxDia = Math.max(1, ...dias.map(d => d.facturado))
  $('#rep-chart').innerHTML = dias.map(d => `
    <div class="rep-col" title="${d.fecha}: ${fmtMoneda(d.facturado)} (${d.ventas} ventas)">
      <div class="rep-barra" style="height:${Math.max(2, Math.round((d.facturado / maxDia) * 100))}%"></div>
      <span>${d.fecha.slice(8)}</span>
    </div>`).join('')

  // dias de la semana
  const maxSem = Math.max(1, ...rep.porDiaSemana.map(d => d.facturado))
  $('#rep-dias').innerHTML = rep.porDiaSemana.map(d => `
    <div class="rep-fila">
      <span class="rep-etq">${esc(d.nombre)}</span>
      <div class="rep-track"><div class="rep-rell" style="width:${Math.round((d.facturado / maxSem) * 100)}%"></div></div>
      <span class="rep-val">${fmtMoneda(d.facturado)}</span>
    </div>`).join('')

  const filaVacia = (cols) => `<tr><td colspan="${cols}" class="vacio" style="padding:14px">Sin datos en el período</td></tr>`
  const celdaMarca = (m) => esc(m || '—')

  $('#rep-topfac-body').innerHTML = rep.topProductos.map(p => `
    <tr><td><strong>${esc(p.nombre)}</strong></td><td>${celdaMarca(p.marca)}</td>
    <td class="num">${fmtStock(p.unidades)}</td><td class="num">${fmtMoneda(p.facturado)}</td>
    <td class="num">${fmtMoneda(p.utilidad)}</td></tr>`).join('') || filaVacia(5)

  $('#rep-topuni-body').innerHTML = rep.topUnidades.map(p => `
    <tr><td><strong>${esc(p.nombre)}</strong></td><td>${celdaMarca(p.marca)}</td>
    <td class="num">${fmtStock(p.unidades)}</td><td class="num">${fmtMoneda(p.facturado)}</td></tr>`).join('') || filaVacia(4)

  $('#rep-marcas-body').innerHTML = rep.porMarca.map(m => `
    <tr><td>${esc(m.nombre)}</td><td class="num">${fmtStock(m.unidades)}</td><td class="num">${fmtMoneda(m.facturado)}</td></tr>`).join('') || filaVacia(3)

  $('#rep-categorias-body').innerHTML = rep.porCategoria.map(c => `
    <tr><td>${esc(c.nombre)}</td><td class="num">${fmtStock(c.unidades)}</td><td class="num">${fmtMoneda(c.facturado)}</td></tr>`).join('') || filaVacia(3)

  $('#rep-metodos-body').innerHTML = rep.porMetodoPago.map(m => `
    <tr><td>${esc(m.nombre)}</td><td class="num">${m.ventas}</td><td class="num">${fmtMoneda(m.facturado)}</td></tr>`).join('') || filaVacia(3)
}

async function exportarPdfReporte () {
  const { desde, hasta } = repRangoActual()
  const btn = $('#rep-pdf')
  btn.disabled = true
  try {
    const r = await window.api.reportes.exportarPdf({ desde, hasta })
    if (!r.ok) { toast(r.error, 'error'); return }
    if (r.datos.cancelado) return
    toast(`PDF guardado ✓`, 'ok')
  } finally {
    btn.disabled = false
  }
}