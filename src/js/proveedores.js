'use strict'

let proveedoresFiltro = ''
let proveedorEditando = null

function initProveedores () {
  const btnNuevo = $('#btn-nuevo-proveedor')
  if (btnNuevo) btnNuevo.addEventListener('click', () => abrirModalProveedor())
  const btnGuardar = $('#btn-guardar-proveedor')
  if (btnGuardar) btnGuardar.addEventListener('click', guardarProveedorForm)
  const buscar = $('#buscar-proveedores')
  if (buscar) buscar.addEventListener('input', (e) => {
    proveedoresFiltro = e.target.value.trim().toLowerCase()
    renderProveedores()
  })
  renderProveedores()
}

function abrirModalProveedor (p) {
  proveedorEditando = p ? p.id : null
  $('#proveedor-modal-titulo').textContent = p ? `Editar: ${p.nombre}` : 'Nuevo proveedor'
  $('#pr-nombre').value = p ? p.nombre : ''
  $('#pr-rubro').value = p ? (p.rubro || '') : ''
  $('#pr-contacto').value = p ? (p.contacto || '') : ''
  $('#pr-nota').value = p ? (p.nota || '') : ''
  modalAbrir('modal-proveedor')
  setTimeout(() => $('#pr-nombre').focus(), 30)
}

async function guardarProveedorForm () {
  const datos = {
    nombre: $('#pr-nombre').value.trim(),
    rubro: $('#pr-rubro').value.trim(),
    contacto: $('#pr-contacto').value.trim(),
    nota: $('#pr-nota').value.trim()
  }
  if (proveedorEditando !== null) datos.id = proveedorEditando
  if (!datos.nombre) return toast('El nombre es obligatorio', 'error')
  const r = await window.api.proveedores.guardar(datos)
  if (!r.ok) { toast(r.error, 'error'); return }
  proveedorEditando = null
  modalCerrar('modal-proveedor')
  toast('Proveedor guardado ✓')
  await cargarProveedores()
  renderProveedores()
}

async function eliminarProveedor (p) {
  if (!confirm(`¿Eliminar al proveedor "${p.nombre}"?`)) return
  const r = await window.api.proveedores.eliminar(p.id)
  if (!r.ok) { toast(r.error, 'error'); return }
  toast('Proveedor eliminado')
  await cargarProveedores()
  renderProveedores()
}

function renderProveedores () {
  const body = $('#proveedores-body')
  const vacio = $('#proveedores-vacio')
  if (!body) return
  body.innerHTML = ''
  const cache = App.proveedoresCache || []
  const lista = cache.filter(p => {
    if (!proveedoresFiltro) return true
    return (
      String(p.nombre).toLowerCase().includes(proveedoresFiltro) ||
      String(p.rubro || '').toLowerCase().includes(proveedoresFiltro) ||
      String(p.contacto || '').toLowerCase().includes(proveedoresFiltro)
    )
  })

  for (const p of lista) {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td class="num mono">${p.id}</td>
      <td><strong>${esc(p.nombre)}</strong></td>
      <td>${esc(p.rubro || '—')}</td>
      <td>${esc(p.contacto || '—')}</td>
      <td>${esc(p.nota || '—')}</td>
      <td class="acciones">
        <button type="button" class="btn btn-small" data-accion="editar">Editar</button>
        <button type="button" class="btn btn-small btn-danger-ghost" data-accion="borrar">✕</button>
      </td>`
    tr.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModalProveedor(p))
    tr.querySelector('[data-accion="borrar"]').addEventListener('click', () => eliminarProveedor(p))
    body.appendChild(tr)
  }

  if (vacio) vacio.classList.toggle('oculto', lista.length > 0)
}
