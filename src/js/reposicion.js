'use strict'

let compraEditando = null
let compraDetalle = null
const coItems = new Map()

function initReposicion () {
  const btnFiltrar = $('#btn-filtrar-compras')
  if (btnFiltrar) btnFiltrar.addEventListener('click', buscarCompras)
  const btnNueva = $('#btn-nueva-compra')
  if (btnNueva) btnNueva.addEventListener('click', () => abrirModalCompra())
  const btnGuardar = $('#btn-guardar-compra')
  if (btnGuardar) btnGuardar.addEventListener('click', guardarCompraForm)
  const btnEditar = $('#btn-editar-compra')
  if (btnEditar) btnEditar.addEventListener('click', () => {
    if (!compraDetalle) return
    const c = compraDetalle
    modalCerrar('modal-detalle-compra')
    abrirModalCompra(c)
  })
  const btnEliminar = $('#btn-eliminar-compra')
  if (btnEliminar) btnEliminar.addEventListener('click', eliminarCompraActual)
  const btnVer = $('#btn-ver-factura')
  if (btnVer) btnVer.addEventListener('click', verFacturaActual)
  const btnAdjuntar = $('#btn-adjuntar-factura')
  if (btnAdjuntar) btnAdjuntar.addEventListener('click', adjuntarFacturaActual)

  const buscador = $('#co-buscador')
  if (buscador) {
    buscador.addEventListener('input', () => {
      const valor = buscador.value.trim().toLowerCase()
      if (!valor) { $('#co-sugerencias').classList.add('oculto'); return }
      const res = App.productosCache.filter(p =>
        p.nombre.toLowerCase().includes(valor) || String(p.codigo_barras).includes(valor)
      ).slice(0, 8)
      mostrarCoSugerencias(res)
    })
    buscador.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      const valor = buscador.value.trim().toLowerCase()
      if (!valor) return
      const res = App.productosCache.filter(p =>
        p.nombre.toLowerCase().includes(valor) || String(p.codigo_barras).includes(valor)
      ).slice(0, 8)
      if (res.length) { agregarCoItem(res[0]); buscador.value = ''; $('#co-sugerencias').classList.add('oculto') }
      else toast('No se encontró ningún producto con ese criterio', 'error')
    })
  }

  cargarProveedoresSelect()
  buscarCompras()
}

async function cargarProveedoresSelect () {
  await cargarProveedores()
  const lista = App.proveedoresCache || []
  const filtro = $('#repo-proveedor')
  if (filtro) {
    const actual = filtro.value
    filtro.innerHTML = '<option value="">Todos los proveedores</option>' +
      lista.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')
    if (actual) filtro.value = actual
  }
  const sel = $('#co-proveedor')
  if (sel) {
    sel.innerHTML = lista.length
      ? lista.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')
      : '<option value="">(sin proveedores, creá uno en Proveedores)</option>'
  }
}

async function buscarCompras () {
  const filtro = {
    proveedor_id: ($('#repo-proveedor') || {}).value || undefined,
    desde: ($('#repo-desde') || {}).value || undefined,
    hasta: ($('#repo-hasta') || {}).value || undefined,
    soloSinFactura: !!($('#repo-sin-factura') || {}).checked
  }
  if (!filtro.proveedor_id) delete filtro.proveedor_id
  if (!filtro.desde) delete filtro.desde
  if (!filtro.hasta) delete filtro.hasta
  const r = await window.api.compras.listar(filtro)
  if (!r.ok) { toast(r.error, 'error'); return }
  renderCompras(r.datos || [])
}

function renderCompras (compras) {
  const body = $('#compras-body')
  const vacio = $('#compras-vacio')
  if (!body) return
  body.innerHTML = ''

  let total = 0
  for (const c of compras) total += c.total
  const res = $('#compras-resumen')
  if (res) {
    const sinFac = compras.filter(c => !c.factura_archivo).length
    res.innerHTML = `
      <div class="hist-rcard"><span>Compras</span><strong>${compras.length}</strong></div>
      <div class="hist-rcard"><span>Total</span><strong>${fmtMoneda(total)}</strong></div>
      <div class="hist-rcard"><span>Sin factura</span><strong>${sinFac}</strong></div>`
  }

  for (const c of compras) {
    const tr = document.createElement('tr')
    const fac = c.factura_archivo
      ? `<span class="estado-chip completada">✓ ${esc(c.factura_nombre || 'Factura')}</span>`
      : '<span class="badge ambar">Sin factura</span>'
    tr.innerHTML = `
      <td class="mono">${c.id}</td>
      <td>${esc(String(c.fecha).slice(0, 10))}</td>
      <td>${esc(c.proveedor_nombre || '—')}</td>
      <td class="num">${(c.items || []).length}</td>
      <td class="num"><strong>${fmtMoneda(c.total)}</strong></td>
      <td>${fac}</td>
      <td class="acciones"><button type="button" class="btn btn-small">Ver</button></td>`
    tr.querySelector('button').addEventListener('click', () => verCompra(c.id))
    body.appendChild(tr)
  }

  if (vacio) vacio.classList.toggle('oculto', compras.length > 0)
}

function mostrarCoSugerencias (lista) {
  const caja = $('#co-sugerencias')
  caja.innerHTML = ''
  if (!lista.length) { caja.classList.add('oculto'); return }
  for (const p of lista) {
    const d = document.createElement('div')
    d.className = 'sug-item'
    d.innerHTML = `<span class="sug-codigo">${esc(p.codigo_barras)}</span>
      <span class="sug-nombre">${esc(p.nombre)}</span>
      <span class="sug-precio">${fmtMoneda(p.costo)}</span>`
    d.addEventListener('click', () => {
      agregarCoItem(p)
      $('#co-buscador').value = ''
      caja.classList.add('oculto')
    })
    caja.appendChild(d)
  }
  caja.classList.remove('oculto')
}

function agregarCoItem (p) {
  const actual = coItems.get(p.codigo_barras)
  if (actual) { actual.cantidad = Number((actual.cantidad + 1).toFixed(3)); renderCoItems(); return }
  coItems.set(p.codigo_barras, { producto: p, cantidad: 1, costo: String(Number(p.costo || 0) / 100) })
  renderCoItems()
}

function renderCoItems () {
  const body = $('#co-items-body')
  if (!body) return
  body.innerHTML = ''
  let total = 0
  coItems.forEach((item, codigo) => {
    const costoCents = aCentavos(item.costo)
    const linea = Math.round(costoCents * item.cantidad)
    total += linea
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td><strong>${esc(item.producto.nombre)}</strong>
        <div class="estado-info" style="display:inline-block;padding:2px 8px;font-size:11px;margin-left:6px">${esc(codigo)}</div></td>
      <td class="num"><input type="number" min="0.001" step="0.001" value="${item.cantidad}" style="width:80px"></td>
      <td class="num"><input type="number" min="0" step="0.01" value="${esc(item.costo)}" style="width:100px"></td>
      <td class="num"><strong>${fmtMoneda(linea)}</strong></td>
      <td><button type="button" class="btn btn-flat btn-x">✕</button></td>`
    const [inpCant, inpCosto] = tr.querySelectorAll('input')
    inpCant.addEventListener('change', (e) => {
      const v = Number(e.target.value)
      if (!(v > 0)) { coItems.delete(codigo); renderCoItems(); return }
      item.cantidad = v
      renderCoItems()
    })
    inpCosto.addEventListener('change', (e) => {
      const v = Number(e.target.value)
      if (!Number.isFinite(v) || v < 0) { e.target.value = item.costo; return }
      item.costo = e.target.value
      renderCoItems()
    })
    tr.querySelector('button').addEventListener('click', () => { coItems.delete(codigo); renderCoItems() })
    body.appendChild(tr)
  })
  const t = $('#co-total')
  if (t) t.textContent = fmtMoneda(total)
}

async function abrirModalCompra (compra) {
  await cargarProveedoresSelect()
  compraEditando = compra ? compra.id : null
  $('#compra-modal-titulo').textContent = compra ? `Editar compra N° ${compra.id}` : 'Nueva compra'
  coItems.clear()
  if (compra) {
    $('#co-proveedor').value = String(compra.proveedor_id)
    $('#co-fecha').value = String(compra.fecha).slice(0, 10)
    $('#co-nota').value = compra.nota || ''
    for (const it of compra.items || []) {
      const p = App.productosCache.find(x => x.codigo_barras === it.codigo_barras)
      coItems.set(it.codigo_barras, {
        producto: p || { codigo_barras: it.codigo_barras, nombre: it.nombre },
        cantidad: it.cantidad,
        costo: String(Number(it.costo_unitario || 0) / 100)
      })
    }
  } else {
    $('#co-fecha').value = hoyLocal()
    $('#co-nota').value = ''
    const filtroProv = ($('#repo-proveedor') || {}).value
    if (filtroProv) $('#co-proveedor').value = filtroProv
  }
  $('#co-buscador').value = ''
  $('#co-sugerencias').classList.add('oculto')
  renderCoItems()
  modalAbrir('modal-compra')
  setTimeout(() => $('#co-buscador').focus(), 30)
}

async function guardarCompraForm () {
  if (!coItems.size) return toast('Agregá al menos un producto', 'error')
  const proveedorId = Number(($('#co-proveedor') || {}).value)
  if (!(proveedorId > 0)) return toast('Seleccioná un proveedor', 'error')
  const items = []
  coItems.forEach((item, codigo) => {
    items.push({ codigo, cantidad: item.cantidad, costo_unitario: aCentavos(item.costo) })
  })
  const datos = {
    proveedor_id: proveedorId,
    fecha: $('#co-fecha').value || undefined,
    nota: $('#co-nota').value.trim(),
    items
  }
  if (compraEditando !== null) datos.id = compraEditando
  const r = await window.api.compras.guardar(datos)
  if (!r.ok) { toast(r.error, 'error'); return }
  compraEditando = null
  modalCerrar('modal-compra')
  toast(`Compra N° ${r.datos.id} guardada ✓`)
  buscarCompras()
}

async function verCompra (id) {
  const r = await window.api.compras.obtener(id)
  if (!r.ok) return toast(r.error, 'error')
  if (!r.datos) return toast('Compra no encontrada', 'error')
  const c = r.datos
  compraDetalle = c
  $('#dc-titulo').textContent = `Compra N° ${c.id}`
  $('#dc-info').innerHTML = `
    <strong>${esc(String(c.fecha).slice(0, 10))}</strong> · Proveedor: <strong>${esc(c.proveedor_nombre || '—')}</strong><br>
    Ítems: ${c.items.length} · <strong>Total: ${fmtMoneda(c.total)}</strong>
    ${c.nota ? `<br>Nota: ${esc(c.nota)}` : ''}`
  $('#dc-body').innerHTML = c.items.map(it => `<tr>
    <td>${esc(it.nombre)} <span class="mono muted">${esc(it.codigo_barras)}</span></td>
    <td class="num">${fmtStock(it.cantidad)}</td>
    <td class="num">${fmtMoneda(it.costo_unitario)}</td>
    <td class="num"><strong>${fmtMoneda(it.total_linea)}</strong></td>
  </tr>`).join('')
  pintarFacturaDetalle(c)
  modalAbrir('modal-detalle-compra')
}

function pintarFacturaDetalle (c) {
  const box = $('#dc-factura')
  const btnVer = $('#btn-ver-factura')
  if (c.factura_archivo) {
    box.innerHTML = `Factura: <strong>${esc(c.factura_nombre || 'adjunta')}</strong><br><span class="mono">${esc(c.factura_archivo)}</span>`
    if (btnVer) btnVer.disabled = false
  } else {
    box.innerHTML = '<span class="badge ambar">Sin factura</span> Todavía no se adjuntó la factura de esta compra.'
    if (btnVer) btnVer.disabled = true
  }
}

async function adjuntarFacturaActual () {
  if (!compraDetalle) return
  const r = await window.api.compras.adjuntarFactura(compraDetalle.id)
  if (!r.ok) { toast(r.error, 'error'); return }
  if (r.datos && r.datos.cancelado) return
  compraDetalle = r.datos
  pintarFacturaDetalle(r.datos)
  toast('Factura adjunta ✓')
  buscarCompras()
}

async function verFacturaActual () {
  if (!compraDetalle) return
  const r = await window.api.compras.verFactura(compraDetalle.id)
  if (!r.ok) { toast(r.error, 'error'); return }
}

async function eliminarCompraActual () {
  if (!compraDetalle) return
  if (!confirm(`¿Eliminar la compra N° ${compraDetalle.id}? Se borrará también su factura adjunta.`)) return
  const r = await window.api.compras.eliminar(compraDetalle.id)
  if (!r.ok) { toast(r.error, 'error'); return }
  toast('Compra eliminada')
  modalCerrar('modal-detalle-compra')
  buscarCompras()
}
