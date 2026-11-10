'use strict'

let productosFiltro = ''
let productosCategoria = ''
let categoriasFirma = ''
let productoEditando = null // codigo_barras original mientras se edita

function initProductos () {
  $('#btn-nuevo-producto').addEventListener('click', () => abrirModalProducto())
  $('#btn-guardar-producto').addEventListener('click', guardarProductoForm)
  $('#buscar-productos').addEventListener('input', (e) => {
    productosFiltro = e.target.value.trim()
    renderProductos()
  })
  const filtroCategoria = $('#filtro-categoria-productos')
  if (filtroCategoria) {
    filtroCategoria.addEventListener('change', (e) => {
      productosCategoria = e.target.value
      renderProductos()
    })
  }
  $('#p-codigo').addEventListener('keydown', (e) => {
    // Enter en codigo salta a nombre (scan rápido de producto nuevo)
    if (e.key === 'Enter') { e.preventDefault(); $('#p-nombre').focus() }
  })
  poblarCategoriasProductos()
  renderProductos()
}

function poblarCategoriasProductos () {
  const select = $('#filtro-categoria-productos')
  if (!select) return
  const categorias = [...new Set(App.productosCache.map(p => p.categoria).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base' }))
  const firma = categorias.join('|')
  if (firma !== categoriasFirma) {
    categoriasFirma = firma
    select.innerHTML = '<option value="">Todas las categorías</option>' +
      categorias.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')
  }
  if (productosCategoria && !categorias.includes(productosCategoria)) {
    productosCategoria = ''
  }
  select.value = productosCategoria
}

function abrirModalProducto (codigoPrecargado = '') {
  const categorias = [...new Set(App.productosCache.map(p => p.categoria).filter(Boolean))].sort()
  $('#lista-categorias').innerHTML = categorias.map(c => `<option value="${esc(c)}">`).join('')
  const marcas = [...new Set(App.productosCache.map(p => p.marca).filter(Boolean))].sort()
  $('#lista-marcas').innerHTML = marcas.map(c => `<option value="${esc(c)}">`).join('')

  const modal = $('#modal-producto')
  productoEditando = null
  if (codigoPrecargado) {
    $('#p-codigo').value = codigoPrecargado
    $('#modal-producto-titulo').textContent = 'Nuevo producto'
    // si ya existe, editar
    const p = App.productosCache.find(x => x.codigo_barras === codigoPrecargado)
    if (p) return editarProducto(p)
    $('#p-nombre').value = ''
  } else {
    $('#p-codigo').value = ''
    $('#modal-producto-titulo').textContent = 'Nuevo producto'
  }
  $('#p-nombre').value = ''
  $('#p-categoria').value = ''
  $('#p-marca').value = ''
  $('#p-stock').value = ''
  $('#p-stock-minimo').value = ''
  $('#p-precio').value = ''
  $('#p-costo').value = ''
  $('#p-activo').value = '1'
  modal.classList.remove('oculto')
  setTimeout(() => $('#p-codigo').focus(), 30)
}

function editarProducto (p) {
  productoEditando = p.codigo_barras
  $('#modal-producto-titulo').textContent = `Editar: ${p.nombre}`
  $('#p-codigo').value = p.codigo_barras
  $('#p-nombre').value = p.nombre
  $('#p-categoria').value = p.categoria || ''
  $('#p-marca').value = p.marca || ''
  $('#p-stock').value = p.stock
  $('#p-stock-minimo').value = p.stock_minimo
  $('#p-precio').value = p.precio / 100
  $('#p-costo').value = p.costo / 100
  $('#p-activo').value = p.activo ? '1' : '0'
  $('#modal-producto').classList.remove('oculto')
  setTimeout(() => $('#p-nombre').select(), 30)
}

async function guardarProductoForm () {
  const datos = {
    codigo_barras: $('#p-codigo').value.trim(),
    nombre: $('#p-nombre').value.trim(),
    categoria: $('#p-categoria').value.trim(),
    marca: $('#p-marca').value.trim(),
    stock: $('#p-stock').value,
    stock_minimo: $('#p-stock-minimo').value,
    precio: aCentavos($('#p-precio').value),
    costo: aCentavos($('#p-costo').value),
    activo: $('#p-activo').value === '1'
  }
  if (productoEditando) datos.codigo_original = productoEditando
  if (!datos.codigo_barras) return toast('El código de barras es obligatorio', 'error')
  if (!datos.nombre) return toast('El nombre es obligatorio', 'error')

  const r = await window.api.productos.guardar(datos)
  if (!r.ok) { toast(r.error, 'error'); return }
  const codigoViejo = productoEditando
  productoEditando = null
  // si se renombro un producto que esta en alguna pestana, actualizar su clave
  if (codigoViejo && codigoViejo !== datos.codigo_barras && typeof Venta !== 'undefined') {
    const tabs = Venta.pestanas && Venta.pestanas.length ? Venta.pestanas : [{ carrito: Venta.carrito }]
    let toco = false
    for (const tab of tabs) {
      if (!tab.carrito.has(codigoViejo)) continue
      const item = tab.carrito.get(codigoViejo)
      tab.carrito.delete(codigoViejo)
      item.producto = r.datos
      tab.carrito.set(datos.codigo_barras, item)
      toco = true
    }
    if (toco && typeof renderCarrito === 'function') renderCarrito()
  }
  modalCerrar('modal-producto')
  toast('Producto guardado ✓')
  await cargarProductos()
  renderProductos()
  $('#buscador-venta').focus()
}

async function eliminarProducto (p) {
  if (!confirm(`¿Eliminar "${p.nombre}"? Los historiales de ventas se conservan.`)) return
  const r = await window.api.productos.eliminar(p.codigo_barras)
  if (!r.ok) { toast(r.error, 'error'); return }
  toast('Producto eliminado')
  await cargarProductos()
  renderProductos()
}

function renderProductos () {
  const body = $('#productos-body')
  const vacio = $('#productos-vacio')
  body.innerHTML = ''
  poblarCategoriasProductos()
  const categoria = normalizarBusqueda(productosCategoria)
  const lista = buscarProductos(App.productosCache, productosFiltro)
    .filter(p => !categoria || normalizarBusqueda(p.categoria) === categoria)

  for (const p of lista) {
    const tr = document.createElement('tr')
    const stockBajo = p.activo && p.stock <= p.stock_minimo && p.stock > 0
    const sinStock = p.activo && p.stock <= 0
    const chip = !p.activo
      ? '<span class="estado-chip anulada">Inactivo</span>'
      : sinStock
        ? '<span class="badge rojo">Sin stock</span>'
        : stockBajo
          ? '<span class="badge ambar">Bajo</span>'
          : '<span class="estado-chip completada">Activo</span>'
    tr.innerHTML = `
      <td class="mono">${esc(p.codigo_barras)}</td>
      <td><strong>${esc(p.nombre)}</strong></td>
      <td>${esc(p.marca || '—')}</td>
      <td>${esc(p.categoria || '—')}</td>
      <td class="num">${fmtMoneda(p.precio)}</td>
      <td class="num">${fmtMoneda(p.costo)}</td>
      <td class="num">${fmtStock(p.stock)}</td>
      <td class="num">${fmtStock(p.stock_minimo)}</td>
      <td>${chip}</td>
      <td class="acciones">
        <button type="button" class="btn btn-small" data-accion="editar">Editar</button>
        <button type="button" class="btn btn-small btn-danger-ghost" data-accion="borrar">✕</button>
      </td>`
    tr.querySelector('[data-accion="editar"]').addEventListener('click', () => editarProducto(p))
    tr.querySelector('[data-accion="borrar"]').addEventListener('click', () => eliminarProducto(p))
    body.appendChild(tr)
  }

  vacio.classList.toggle('oculto', lista.length > 0)
}