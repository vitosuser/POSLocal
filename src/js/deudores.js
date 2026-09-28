'use strict'

let deudoresFiltro = ''
let deudoresSoloDeuda = false
let deudorEditando = null
let deudorPago = null

function initDeudores () {
  const btnNuevo = $('#btn-nuevo-deudor')
  if (btnNuevo) btnNuevo.addEventListener('click', () => abrirModalDeudor())
  const btnGuardar = $('#btn-guardar-deudor')
  if (btnGuardar) btnGuardar.addEventListener('click', guardarDeudorForm)
  const buscar = $('#buscar-deudores')
  if (buscar) buscar.addEventListener('input', (e) => {
    deudoresFiltro = e.target.value.trim().toLowerCase()
    renderDeudores()
  })
  const solo = $('#solo-con-deuda')
  if (solo) solo.addEventListener('change', (e) => {
    deudoresSoloDeuda = e.target.checked
    renderDeudores()
  })
  const btnPago = $('#btn-guardar-pago')
  if (btnPago) btnPago.addEventListener('click', aplicarPagoDeudor)
  const btnCancelar = $('#btn-cancelar-deuda')
  if (btnCancelar) btnCancelar.addEventListener('click', cancelarDeudaDeudor)
  renderDeudores()
}

function abrirModalDeudor (f) {
  deudorEditando = f ? f.dni : null
  $('#deudor-modal-titulo').textContent = f ? `Editar: ${f.nombre}` : 'Nuevo deudor'
  $('#f-dni').value = f ? f.dni : ''
  $('#f-dni').disabled = !!f
  $('#f-nombre').value = f ? f.nombre : ''
  $('#f-nota').value = f ? (f.nota || '') : ''
  $('#f-deuda-info').innerHTML = f
    ? `Deuda actual: <strong>${fmtMoneda(f.deuda)}</strong> · ${Number(f.debe) === 1 ? 'Debe' : 'Sin deuda'}`
    : ''
  modalAbrir('modal-deudor')
  setTimeout(() => (f ? $('#f-nombre') : $('#f-dni')).focus(), 30)
}

async function guardarDeudorForm () {
  const datos = {
    dni: $('#f-dni').value.trim(),
    nombre: $('#f-nombre').value.trim(),
    nota: $('#f-nota').value.trim()
  }
  if (!datos.dni) return toast('El DNI es obligatorio', 'error')
  if (!datos.nombre) return toast('El nombre es obligatorio', 'error')
  const r = await window.api.deudores.guardar(datos)
  if (!r.ok) { toast(r.error, 'error'); return }
  modalCerrar('modal-deudor')
  toast('Deudor guardado ✓')
  await cargarDeudores()
  renderDeudores()
}

async function eliminarDeudor (f) {
  if (!confirm(`¿Eliminar al deudor "${f.nombre}"? Solo se puede si no debe nada.`)) return
  const r = await window.api.deudores.eliminar(f.dni)
  if (!r.ok) { toast(r.error, 'error'); return }
  toast('Deudor eliminado')
  await cargarDeudores()
  renderDeudores()
}

function abrirPagoDeudor (f) {
  deudorPago = f
  $('#fp-titulo').textContent = `Ajustar deuda: ${f.nombre}`
  $('#fp-info').innerHTML = `<strong>${esc(f.nombre)}</strong> (${esc(f.dni)}) — debe <strong>${fmtMoneda(f.deuda)}</strong>`
  $('#fp-monto').value = String(Number(f.deuda) / 100)
  modalAbrir('modal-pago-deudor')
  setTimeout(() => $('#fp-monto').focus(), 30)
}

async function aplicarPagoDeudor () {
  if (!deudorPago) return
  const monto = aCentavos($('#fp-monto').value)
  if (!(monto > 0)) return toast('Ingresá un monto mayor a cero', 'error')
  const r = await window.api.deudores.pago({ dni: deudorPago.dni, monto })
  if (!r.ok) { toast(r.error, 'error'); return }
  modalCerrar('modal-pago-deudor')
  toast(`Pago registrado ✓ · Deuda: ${fmtMoneda(r.datos.deuda)}`)
  await cargarDeudores()
  renderDeudores()
}

async function cancelarDeudaDeudor () {
  if (!deudorPago) return
  if (!confirm(`¿Cancelar toda la deuda de "${deudorPago.nombre}" (${fmtMoneda(deudorPago.deuda)})?`)) return
  const r = await window.api.deudores.pago({ dni: deudorPago.dni, monto: deudorPago.deuda })
  if (!r.ok) { toast(r.error, 'error'); return }
  modalCerrar('modal-pago-deudor')
  toast('Deuda cancelada ✓')
  await cargarDeudores()
  renderDeudores()
}

function renderDeudores () {
  const body = $('#deudores-body')
  const vacio = $('#deudores-vacio')
  if (!body) return
  body.innerHTML = ''
  const cache = App.deudoresCache || []
  const lista = cache.filter(f => {
    if (deudoresSoloDeuda && !(Number(f.deuda) > 0)) return false
    if (deudoresFiltro && !(
      String(f.nombre).toLowerCase().includes(deudoresFiltro) ||
      String(f.dni).includes(deudoresFiltro)
    )) return false
    return true
  })

  let totalDeuda = 0
  let conDeuda = 0
  for (const f of cache) {
    if (Number(f.deuda) > 0) { totalDeuda += Number(f.deuda); conDeuda++ }
  }
  const res = $('#deudores-resumen')
  if (res) {
    res.innerHTML = `
      <div class="hist-rcard"><span>Deudores</span><strong>${cache.length}</strong></div>
      <div class="hist-rcard"><span>Con deuda</span><strong>${conDeuda}</strong></div>
      <div class="hist-rcard"><span>Deuda total</span><strong>${fmtMoneda(totalDeuda)}</strong></div>`
  }

  for (const f of lista) {
    const debe = Number(f.deuda) > 0
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td class="mono">${esc(f.dni)}</td>
      <td><strong>${esc(f.nombre)}</strong></td>
      <td>${esc(f.nota || '—')}</td>
      <td class="num"><strong>${fmtMoneda(f.deuda)}</strong></td>
      <td>${debe ? '<span class="badge ambar">Debe</span>' : '<span class="estado-chip completada">Sin deuda</span>'}</td>
      <td class="acciones">
        <button type="button" class="btn btn-small" data-accion="pago">Ajustar</button>
        <button type="button" class="btn btn-small" data-accion="editar">Editar</button>
        <button type="button" class="btn btn-small btn-danger-ghost" data-accion="borrar">✕</button>
      </td>`
    tr.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModalDeudor(f))
    tr.querySelector('[data-accion="borrar"]').addEventListener('click', () => eliminarDeudor(f))
    const btnPago = tr.querySelector('[data-accion="pago"]')
    btnPago.disabled = !debe
    btnPago.addEventListener('click', () => abrirPagoDeudor(f))
    body.appendChild(tr)
  }

  if (vacio) vacio.classList.toggle('oculto', lista.length > 0)
}
