'use strict'

let historialActual = null

function initHistorial () {
  $('#h-desde').value = hoyLocal()
  $('#h-hasta').value = hoyLocal()
  $('#btn-filtrar-historial').addEventListener('click', buscarHistorial)
  $('#btn-anular-venta').addEventListener('click', anularVentaActual)
  buscarHistorial()
}

async function buscarHistorial () {
  const desde = $('#h-desde').value || undefined
  const hasta = $('#h-hasta').value || undefined
  const estado = $('#h-estado').value || undefined
  const r = await window.api.ventas.listar({ desde, hasta, estado })
  if (!r.ok) { toast(r.error, 'error'); return }
  renderHistorial(r.datos, { desde, hasta })
}

function renderHistorial (ventas, rango) {
  const body = $('#historial-body')
  const vacio = $('#historial-vacio')
  body.innerHTML = ''

  let totalNeto = 0
  let anuladas = 0
  const porMetodo = {}
  for (const v of ventas) {
    if (v.estado === 'completada') {
      if (v.total > 0) totalNeto += v.total
      porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] || 0) + v.total
    }
  }

  const res = $('#historial-resumen')
  const metHtml = Object.entries(porMetodo)
    .map(([m, t]) => `<div class="hist-rcard"><span>${esc(m)}</span><strong>${fmtMoneda(t)}</strong></div>`)
    .join('')
  res.innerHTML = `
    <div class="hist-rcard"><span>Ventas</span><strong>${ventas.filter(v => v.estado === 'completada').length}</strong></div>
    <div class="hist-rcard"><span>Total</span><strong>${fmtMoneda(totalNeto)}</strong></div>
    ${metHtml}
    ${anuladas > 0 ? `<div class="hist-rcard"><span>Anuladas</span><strong>${anuladas}</strong></div>` : ''}
  `

  for (const v of ventas) {
    const f = v.fecha_hora
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td class="mono">${v.id}</td>
      <td>${esc(f)}</td>
      <td>${esc(v.metodo_pago || '—')}</td>
      <td class="num">${v.items.length}</td>
      <td class="num"><strong>${fmtMoneda(v.total)}</strong></td>
      <td><span class="estado-chip ${v.estado}">${v.estado === 'completada' ? 'Completada' : 'Anulada'}</span></td>
      <td class="acciones"><button type="button" class="btn btn-small">Ver</button></td>`
    tr.querySelector('button').addEventListener('click', () => verVenta(v.id))
    body.appendChild(tr)
  }

  vacio.classList.toggle('oculto', ventas.length > 0)
}

async function verVenta (id) {
  const r = await window.api.ventas.detalle(id)
  if (!r.ok) return toast(r.error, 'error')
  const v = r.datos
  historialActual = v
  $('#mv-titulo').textContent = `Venta N° ${v.id}`
  $('#mv-info').innerHTML = `
    <strong>${new Date(v.fecha_hora.replace(' ', 'T')).toLocaleString()}</strong><br>
    Método: ${esc(v.metodo_pago)} · Operador: ${esc(v.operador || '—')}<br>
    Subtotal: ${fmtMoneda(v.subtotal)} · Descuento: ${fmtMoneda(v.descuento)} · <strong>Total: ${fmtMoneda(v.total)}</strong><br>
    <span class="estado-chip ${v.estado}">${v.estado === 'completada' ? 'Completada' : 'Anulada'}</span>`
  $('#mv-body').innerHTML = v.items.map(it => `<tr>
    <td>${esc(it.nombre)} <span class="mono muted">${esc(it.codigo_barras)}</span></td>
    <td class="num">${fmtStock(it.cantidad)}</td>
    <td class="num">${fmtMoneda(it.precio_unitario)}</td>
    <td class="num"><strong>${fmtMoneda(it.total_linea)}</strong></td>
  </tr>`).join('')
  $('#btn-anular-venta').disabled = v.estado !== 'completada'
  modalAbrir('modal-venta')
}

async function anularVentaActual () {
  if (!historialActual || historialActual.estado !== 'completada') return
  if (!confirm(`¿Anular la venta N° ${historialActual.id}? Se repondrá el stock.`)) return
  const r = await window.api.ventas.anular(historialActual.id)
  if (!r.ok) { toast(r.error, 'error'); return }
  toast('Venta anulada')
  modalCerrar('modal-venta')
  await cargarProductos()
  buscarHistorial()
}