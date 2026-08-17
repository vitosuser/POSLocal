'use strict'

let stockFiltro = ''
let stockSoloBajo = false
let stockActual = null
let stockNuevo = false

function initStock () {
  $('#buscar-stock').addEventListener('input', (e) => {
    stockFiltro = e.target.value.trim().toLowerCase()
    renderStock()
  })
  $('#solo-bajo-stock').addEventListener('change', (e) => {
    stockSoloBajo = e.target.checked
    renderStock()
  })
  $('#btn-guardar-ajuste').addEventListener('click', aplicarAjuste)
  renderStock()
}

function abrirAjuste (p, tipo) {
  stockActual = p
  const nombre = {
    compra: 'Compra / reposición',
    ajuste: 'Ajuste manual',
    salida: 'Salida / merma'
  }[tipo] || 'Ajuste'
  $('#mj-titulo').textContent = nombre
  $('#mj-tipo').value = tipo
  $('#mj-cantidad').value = ''
  $('#mj-nota').value = ''
  $('#mj-producto').innerHTML = `<strong>${esc(p.nombre)}</strong> — stock actual: ${fmtStock(p.stock)}`
  modalAbrir('modal-ajuste-stock')
  setTimeout(() => $('#mj-cantidad').focus(), 30)
}

function verMovimientos (p) {
  window.api.stock.movimientos({ codigo_barras: p.codigo_barras, limite: 80 }).then(r => {
    if (!r.ok) return toast(r.error, 'error')
    $('#mm-titulo').textContent = `Movimientos de ${p.nombre}`
    $('#mm-body').innerHTML = r.datos.map(m => {
      const signo = m.cantidad >= 0 ? '+' : ''
      const tipo = m.tipo === 'venta' ? 'Venta'
        : m.tipo === 'anulacion' ? 'Anulación'
          : m.tipo === 'compra' ? 'Compra'
            : m.tipo === 'salida' ? 'Salida' : 'Ajuste'
      return `<tr>
        <td>${esc(m.fecha)}</td>
        <td>${tipo}</td>
        <td class="num ${m.cantidad < 0 ? 'rojo-menos' : ''}">${signo}${fmtStock(m.cantidad)}</td>
        <td class="num">${fmtStock(m.stock_resultante)}</td>
        <td>${esc(m.nota || '—')}</td>
      </tr>`
    }).join('') || '<tr><td colspan="5" class="vacio">Sin movimientos</td></tr>'
    modalAbrir('modal-movimientos')
  })
}

async function aplicarAjuste () {
  if (!stockActual) return
  const tipo = $('#mj-tipo').value
  const cantInput = Number($('#mj-cantidad').value)
  if (!Number.isFinite(cantInput) || cantInput === 0) {
    return toast('Ingresá una cantidad diferente de cero', 'error')
  }
  let cantidad
  if (tipo === 'compra') cantidad = Math.abs(cantInput)
  else if (tipo === 'salida') cantidad = -Math.abs(cantInput)
  else cantidad = cantInput

  const r = await window.api.stock.ajustar({
    codigo_barras: stockActual.codigo_barras,
    cantidad,
    tipo,
    nota: $('#mj-nota').value.trim()
  })
  if (!r.ok) { toast(r.error, 'error'); return }
  modalCerrar('modal-ajuste-stock')
  toast(r.datos ? `Stock actualizado: ${fmtStock(r.datos.stock)} ✓` : 'Stock actualizado ✓')
  await cargarProductos()
  renderStock()
}

function renderStock () {
  const body = $('#stock-body')
  const vacio = $('#stock-vacio')
  body.innerHTML = ''
  const lista = App.productosCache.filter(p => {
    if (stockFiltro && !(
      p.nombre.toLowerCase().includes(stockFiltro) ||
      String(p.codigo_barras).includes(stockFiltro) ||
      String(p.categoria).toLowerCase().includes(stockFiltro)
    )) return false
    if (stockSoloBajo && !(p.stock <= p.stock_minimo)) return false
    return true
  })

  for (const p of lista) {
    const bajo = p.stock <= p.stock_minimo
    const tr = document.createElement('tr')
    const estado = p.stock <= 0
      ? '<span class="badge rojo">Sin stock</span>'
      : bajo
        ? '<span class="badge ambar">Bajo</span>'
        : '<span class="badge">Ok</span>'
    tr.innerHTML = `
      <td class="mono">${esc(p.codigo_barras)}</td>
      <td><strong>${esc(p.nombre)}</strong> ${p.activo ? '' : '<em class="inactivo">(inactivo)</em>'}</td>
      <td>${esc(p.categoria || '—')}</td>
      <td class="num"><strong class="${bajo ? 'bajo-num' : ''}">${fmtStock(p.stock)}</strong></td>
      <td class="num">${fmtStock(p.stock_minimo)}</td>
      <td>${estado}</td>
      <td class="acciones">
        <button type="button" class="btn btn-small" data-accion="reponer">Reponer</button>
        <button type="button" class="btn btn-small" data-accion="ajustar">Ajustar</button>
        <button type="button" class="btn btn-small" data-accion="mov">Mov.</button>
      </td>`
    tr.querySelector('[data-accion="reponer"]').addEventListener('click', () => abrirAjuste(p, 'compra'))
    tr.querySelector('[data-accion="ajustar"]').addEventListener('click', () => abrirAjuste(p, 'ajuste'))
    tr.querySelector('[data-accion="mov"]').addEventListener('click', () => verMovimientos(p))
    body.appendChild(tr)
  }

  vacio.classList.toggle('oculto', lista.length > 0)
}