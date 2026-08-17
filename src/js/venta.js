'use strict'

const METODOS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'QR', 'Mercado Pago']

const Venta = {
  carrito: new Map(),
  metodoSeleccionado: 'Efectivo'
}

function initVenta () {
  const input = $('#buscador-venta')
  const btnNuevo = $('#btn-agregar-lista')

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      manejarEntrada(input.value.trim())
    }
  })

  input.addEventListener('input', () => buscarSugerencias(input.value.trim()))

  btnNuevo.addEventListener('click', () => abrirModalProducto())

  // métodos de pago: selector principal
  const msel = $('#metodos-pago')
  msel.innerHTML = ''
  METODOS.forEach(m => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'metodo-btn'
    b.textContent = m
    b.addEventListener('click', () => {
      Venta.metodoSeleccionado = m
      $$('#metodos-pago .metodo-btn').forEach(x => x.classList.remove('seleccionado'))
      b.classList.add('seleccionado')
    })
    msel.appendChild(b)
  })
  Venta.metodoSeleccionado = METODOS.includes(App.settings.metodo_pago_default)
    ? App.settings.metodo_pago_default
    : (App.settings.metodo_pago_default || METODOS[0])
  $$('#metodos-pago .metodo-btn').find(b => b.textContent === Venta.metodoSeleccionado)?.classList.add('seleccionado')

  $('#btn-limpiar').addEventListener('click', () => {
    if (Venta.carrito.size && !confirm('¿Vaciar toda la venta?')) return
    limpiarCarrito()
    input.focus()
  })
  $('#btn-cobrar').addEventListener('click', abrirCobro)

  // modal de cobro
  $('#c-metodo-pago').innerHTML = METODOS.map(m => `<option>${m}</option>`).join('')
  $('#c-metodo-pago').value = Venta.metodoSeleccionado
  $('#c-recibido').addEventListener('input', recalcularCambio)
  $('#c-descuento').addEventListener('input', recalcularCambio)
  $('#btn-confirmar-cobro').addEventListener('click', confirmarCobro)

  actualizarVentasDelDia()
}

// ---------- entrada (escanear / escribir) ----------

async function manejarEntrada (valor) {
  ocultarSugerencias()
  if (!valor) return
  const input = $('#buscador-venta')

  if (valor.length <= 24 && /^\d+$/.test(valor)) {
    const ok = await agregarPorCodigo(valor)
    if (ok) { input.value = ''; input.focus(); return }
    // código desconocido → ofrecer crearlo
    const crear = confirm(`El código ${valor} no existe. ¿Crear el producto ahora?`)
    if (crear) {
      abrirModalProducto(valor)
      input.value = ''
    }
    return
  }

  const res = await buscarEnCache(valor)
  if (res.length === 0) {
    toast('No se encontró ningún producto con ese nombre', 'error')
    return
  }
  if (res.length === 1) {
    agregar(res[0])
    input.value = ''
    input.focus()
    return
  }
  mostrarSugerencias(res)
}

async function agregarPorCodigo (codigo) {
  const enCarrito = Venta.carrito.get(codigo)
  if (enCarrito) { incrementar(codigo, 1); return true }
  const r = await window.api.productos.obtener(codigo)
  if (!r.ok || !r.datos) return false
  const p = r.datos
  if (!p.activo) { toast(`"${p.nombre}" está desactivado`, 'error'); return true }
  agregar(p)
  return true
}

function agregar (producto) {
  const actual = Venta.carrito.get(producto.codigo_barras)
  if (actual) {
    incrementar(producto.codigo_barras, 1)
    return
  }
  Venta.carrito.set(producto.codigo_barras, { producto, cantidad: 1 })
  fooToast(producto)
  renderCarrito()
}

function fooToast (producto) {
  const s = producto.stock
  if (s <= 0) toast(`Sin stock: ${producto.nombre}`, 'error')
  else if (s <= producto.stock_minimo) toast(`Stock bajo: ${producto.nombre}`, '')
}

function incrementar (codigo, delta) {
  const item = Venta.carrito.get(codigo)
  if (!item) return
  const nueva = item.cantidad + delta
  if (nueva <= 0) { Venta.carrito.delete(codigo) }
  else if (nueva > item.producto.stock) { toast(`Stock insuficiente (disponible: ${fmtStock(item.producto.stock)})`, 'error') }
  else item.cantidad = nueva
  renderCarrito()
}

// ---------- sugerencias ----------

function buscarEnCache (texto) {
  const t = texto.toLowerCase()
  return Promise.resolve(App.productosCache.filter(p =>
    p.activo && (p.nombre.toLowerCase().includes(t) || String(p.codigo_barras).includes(t))
  ).slice(0, 8))
}

function mostrarSugerencias (lista) {
  const caja = $('#sugerencias')
  caja.innerHTML = ''
  if (!lista.length) { caja.classList.add('oculto'); return }
  lista.forEach(p => {
    const d = document.createElement('div')
    d.className = 'sug-item'
    const st = p.stock <= 0 ? 'sin stock' : `stock: ${fmtStock(p.stock)}`
    d.innerHTML = `<span class="sug-nombre">${esc(p.nombre)}</span>
      <span class="sug-precio">${fmtMoneda(p.precio)}</span>
      <span class="sug-stock">${st}</span>`
    d.addEventListener('click', () => { agregar(p); ocultarSugerencias(); $('#buscador-venta').value = '' })
    caja.appendChild(d)
  })
  caja.classList.remove('oculto')
}

function ocultarSugerencias () { $('#sugerencias').classList.add('oculto') }

function buscarSugerencias (texto) {
  if (!texto || /^\d+$/.test(texto)) {
    if (!texto) ocultarSugerencias()
    else {
      // mostrar candidatos por dígitos (scan dice código)
      buscarEnCache(texto).then(l => {
        if (l.length && String(l[0].codigo_barras) !== texto) mostrarSugerencias(l)
        else ocultarSugerencias()
      })
    }
    return
  }
  buscarEnCache(texto).then(mostrarSugerencias)
}

// ---------- carrito ----------

function renderCarrito () {
  const body = $('#carrito-body')
  const vacio = $('#carrito-vacio')
  body.innerHTML = ''
  let total = 0
  let cantidad = 0

  Venta.carrito.forEach((item, codigo) => {
    const linea = item.cantidad * item.producto.precio
    total += linea
    cantidad += item.cantidad

    const tr = document.createElement('tr')
    const f = fmtMoneda
    tr.innerHTML = `
      <td><strong>${esc(item.producto.nombre)}</strong>
        <div class="estado-info" style="display:inline-block;padding:2px 8px;font-size:11px;margin-left:6px">${esc(item.producto.codigo_barras)}</div></td>
      <td class="num">${f(item.producto.precio)}</td>
      <td class="num"><div class="cantidad-control">
        <button type="button" data-accion="menos">−</button>
        <input type="number" min="0.001" step="0.001" value="${item.cantidad}" data-codigo="${esc(codigo)}">
        <button type="button" data-accion="mas">+</button>
      </div></td>
      <td class="num"><strong>${f(linea)}</strong></td>
      <td><button type="button" class="btn btn-flat btn-x" data-accion="quitar">✕</button></td>`
    tr.querySelector('[data-accion="quitar"]').addEventListener('click', () => {
      Venta.carrito.delete(codigo)
      renderCarrito()
    })
    tr.querySelector('[data-accion="mas"]').addEventListener('click', () => incrementar(codigo, 1))
    tr.querySelector('[data-accion="menos"]').addEventListener('click', () => incrementar(codigo, -1))
    tr.querySelector('input').addEventListener('change', (e) => {
      const v = Number(e.target.value)
      if (!(v > 0)) { Venta.carrito.delete(codigo) }
      else if (v > item.producto.stock) { toast(`Stock insuficiente (disponible: ${fmtStock(item.producto.stock)})`, 'error'); e.target.value = item.cantidad }
      else item.cantidad = v
      renderCarrito()
    })
    body.appendChild(tr)
  })

  $('#total-carrito').textContent = fmtMoneda(total)
  $('#carrito-conteo').textContent = `${cantidad} artículos`
  vacio.classList.toggle('oculto', Venta.carrito.size > 0)
  $('#btn-cobrar').disabled = Venta.carrito.size === 0
}

function limpiarCarrito () {
  Venta.carrito.clear()
  renderCarrito()
}

// ---------- cobro ----------

function totalCarrito () {
  let t = 0
  Venta.carrito.forEach(item => { t += item.cantidad * item.producto.precio })
  return t
}

function abrirCobro () {
  if (!Venta.carrito.size) return
  const total = totalCarrito()
  $('#modal-total').textContent = fmtMoneda(total)
  $('#c-metodo-pago').value = Venta.metodoSeleccionado
  $('#c-descuento').value = ''
  $('#c-recibido').value = String(total / 100)
  recalcularCambio()
  $('#cobro-rapido').innerHTML = ''
  const rapidos = calcRapidos(total)
  rapidos.forEach(v => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = v === total ? 'Exacto' : fmtMoneda(v)
    b.addEventListener('click', () => {
      $('#c-recibido').value = String(v / 100)
      recalcularCambio()
    })
    $('#cobro-rapido').appendChild(b)
  })
  modalAbrir('modal-cobro')
  $('#c-descuento').focus()
}

function calcRapidos (total) {
  const set = new Set([total])
  const ceil100 = Math.ceil(total / 100) * 100
  const ceil500 = Math.ceil(total / 500) * 500
  const ceil1000 = Math.ceil(total / 1000) * 1000
  ;[ceil100, ceil500, ceil1000, ceil1000 + 1000].forEach(v => set.add(v))
  return Array.from(set).slice(0, 5)
}

function recalcularCambio () {
  const total = totalCarrito()
  const desc = aCentavos($('#c-descuento').value)
  const rec = aCentavos($('#c-recibido').value)
  const neto = Math.max(0, total - desc)
  const cambio = rec - neto
  $('#c-cambio').textContent = fmtMoneda(cambio < 0 ? 0 : cambio)
}

async function confirmarCobro () {
  const btn = $('#btn-confirmar-cobro')
  btn.disabled = true
  try {
    const items = []
    Venta.carrito.forEach((item, codigo) => items.push({ codigo, cantidad: item.cantidad }))
    const r = await window.api.ventas.crear({
      items,
      metodo_pago: $('#c-metodo-pago').value,
      descuento: aCentavos($('#c-descuento').value),
      recibido: aCentavos($('#c-recibido').value)
    })
    if (!r.ok) { toast(r.error, 'error'); return }

    modalCerrar('modal-cobro')
    limpiarCarrito()
    actualizarVentasDelDia()
    await cargarProductos()

    // impresión (solo si está configurada)
    const est = await window.api.impresora.estado()
    if (est.ok && est.datos.papel !== 'desactivada') {
      const imp = await window.api.impresora.imprimirVenta(r.datos.ventaId)
      if (imp.ok) toast('Ticket impreso ✓')
      else toast(`Venta guardada, pero no se imprimió: ${imp.error}`, 'error')
    }

    if (r.datos.cambio > 0) {
      $('#cambio-venta-id').textContent = r.datos.ventaId
      $('#cambio-resultado').textContent = fmtMoneda(r.datos.cambio)
      modalAbrir('modal-cambio')
    } else {
      toast(`Venta N° ${r.datos.ventaId} registrada ✓`)
    }
  } finally {
    btn.disabled = false
    setTimeout(() => $('#buscador-venta').focus(), 30)
  }
}

// ---------- resumen del día ----------

async function actualizarVentasDelDia () {
  const hoy = hoyLocal()
  const r = await window.api.ventas.totales({ desde: hoy, hasta: hoy })
  if (!r.ok) return
  const t = r.datos
  $('#ventas-hoy-cant').textContent = t.cantidad
  $('#ventas-hoy-total').textContent = fmtMoneda(t.total)
  const met = METODOS.includes(Venta.metodoSeleccionado) ? Venta.metodoSeleccionado : null
  if (met) {
    $('#tot-mtd-nombre').textContent = met
    $('#tot-mtd-valor').textContent = fmtMoneda(t.porMetodo[met] || 0)
  } else {
    $('#tot-mtd-nombre').textContent = 'Por pago'
    $('#tot-mtd-valor').textContent = '-'
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await cargarConfig()
  await cargarProductos()
  initCommon()
  initVenta()
  initProductos()
  initStock()
  initHistorial()
  initConfiguracion()
})