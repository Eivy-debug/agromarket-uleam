// ──────────────────────────────────────────────────────
// db.js — Capa de acceso a Firestore
// Todas las operaciones de base de datos en un solo lugar
// ──────────────────────────────────────────────────────

// ── USUARIOS ──────────────────────────────────────────────

async function crearUsuarioDB(uid, datos) {
  await db.collection("usuarios").doc(uid).set({
    ...datos,
    activo: true,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function obtenerUsuario(uid) {
  const doc = await db.collection("usuarios").doc(uid).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function listarUsuarios() {
  const snap = await db.collection("usuarios")
    .orderBy("nombre").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function actualizarUsuario(uid, campos) {
  await db.collection("usuarios").doc(uid).update(campos);
}

// ── CATEGORÍAS ────────────────────────────────────────────

async function listarCategorias() {
  const snap = await db.collection("categorias")
    .where("activo", "==", true).orderBy("nombre").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function crearCategoria(nombre, descripcion = "") {
  return await db.collection("categorias").add({
    nombre, descripcion, activo: true,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ── PRODUCTOS ─────────────────────────────────────────────

async function listarProductos(filtros = {}) {
  let query = db.collection("productos");
  if (filtros.activo !== undefined) query = query.where("activo", "==", filtros.activo);
  if (filtros.categoria_id) query = query.where("categoria_id", "==", filtros.categoria_id);
  const snap = await query.orderBy("nombre").get();
  let prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (filtros.busqueda) {
    const b = filtros.busqueda.toLowerCase();
    prods = prods.filter(p => p.nombre.toLowerCase().includes(b));
  }
  return prods;
}

async function obtenerProducto(id) {
  const doc = await db.collection("productos").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function crearProducto(datos) {
  return await db.collection("productos").add({
    ...datos,
    activo: true,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function actualizarProducto(id, campos) {
  await db.collection("productos").doc(id).update(campos);
}

async function toggleProducto(id, estadoActual) {
  await db.collection("productos").doc(id).update({ activo: !estadoActual });
}

// Descontar stock con transacción (evita duplicados simultáneos)
async function descontarStock(productoId, cantidad, motivo, usuarioId) {
  await db.runTransaction(async (transaction) => {
    const ref = db.collection("productos").doc(productoId);
    const doc = await transaction.get(ref);
    const stockActual = doc.data().stock_actual || 0;
    if (stockActual < cantidad) throw new Error("Stock insuficiente");
    transaction.update(ref, { stock_actual: stockActual - cantidad });
  });
  // Registrar movimiento
  await db.collection("movimientos_stock").add({
    producto_id: productoId, tipo: "salida",
    cantidad, motivo, usuario_id: usuarioId,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function agregarStock(productoId, cantidad, motivo, usuarioId) {
  const ref = db.collection("productos").doc(productoId);
  await ref.update({
    stock_actual: firebase.firestore.FieldValue.increment(cantidad)
  });
  await db.collection("movimientos_stock").add({
    producto_id: productoId, tipo: "entrada",
    cantidad, motivo, usuario_id: usuarioId,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ── ZONAS DELIVERY ────────────────────────────────────────

async function listarZonas() {
  const snap = await db.collection("zonas_delivery")
    .where("activo", "==", true).orderBy("nombre").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function obtenerZona(id) {
  const doc = await db.collection("zonas_delivery").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function crearZona(nombre, tarifa, descripcion = "") {
  return await db.collection("zonas_delivery").add({
    nombre, tarifa: parseFloat(tarifa), descripcion, activo: true,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ── PEDIDOS ───────────────────────────────────────────────

async function crearPedido(datos) {
  const ahora = firebase.firestore.FieldValue.serverTimestamp();
  return await db.collection("pedidos").add({
    ...datos,
    estado: "pendiente",
    historial: [{
      estado_anterior: null, estado_nuevo: "pendiente",
      usuario_id: datos.cliente_id, nota: "Pedido creado",
      fecha: new Date().toISOString()
    }],
    created_at: ahora, updated_at: ahora
  });
}

async function obtenerPedido(id) {
  const doc = await db.collection("pedidos").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function listarPedidosCliente(clienteId) {
  const snap = await db.collection("pedidos")
    .where("cliente_id", "==", clienteId)
    .orderBy("created_at", "desc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function listarTodosPedidos(estado = null) {
  let query = db.collection("pedidos").orderBy("created_at", "desc");
  if (estado) query = db.collection("pedidos").where("estado", "==", estado);
  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function listarPedidosRepartidor(repartidorId) {
  const snap = await db.collection("pedidos")
    .where("repartidor_id", "==", repartidorId).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => ["en_camino","confirmado","en_preparacion"].includes(p.estado));
}

async function cambiarEstadoPedido(pedidoId, pedido, nuevoEstado, usuarioId, nota = "") {
  if (!puedeTransicionar(pedido.estado, nuevoEstado)) {
    throw new Error(`No se puede cambiar de "${pedido.estado}" a "${nuevoEstado}"`);
  }
  const nuevoHistorial = [...(pedido.historial || []), {
    estado_anterior: pedido.estado,
    estado_nuevo: nuevoEstado,
    usuario_id: usuarioId,
    nota,
    fecha: new Date().toISOString()
  }];
  await db.collection("pedidos").doc(pedidoId).update({
    estado: nuevoEstado,
    historial: nuevoHistorial,
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function asignarRepartidor(pedidoId, repartidorId) {
  await db.collection("pedidos").doc(pedidoId).update({
    repartidor_id: repartidorId
  });
}

// ── STORAGE — Subida de imágenes ──────────────────────────

async function subirImagen(archivo, carpeta) {
  const nombre = `${carpeta}/${Date.now()}_${archivo.name}`;
  const ref = storage.ref(nombre);
  await ref.put(archivo);
  return await ref.getDownloadURL();
}

// ── DATOS INICIALES (ejecutar una sola vez) ───────────────

async function cargarDatosIniciales() {
  const CATEGORIAS = [
    "Verduras", "Frutas", "Lácteos",
    "Granos y Legumbres", "Tubérculos", "Hierbas aromáticas"
  ];
  const ZONAS = [
    { nombre: "Bloque A - Tecnología",     tarifa: 0.50 },
    { nombre: "Bloque B - Administración", tarifa: 0.50 },
    { nombre: "Bloque C - Medicina",       tarifa: 0.75 },
    { nombre: "Área deportiva",            tarifa: 0.75 },
    { nombre: "Fuera del campus",          tarifa: 1.00 },
  ];
  for (const nombre of CATEGORIAS) {
    const ex = await db.collection("categorias").where("nombre","==",nombre).get();
    if (ex.empty) await crearCategoria(nombre);
  }
  for (const z of ZONAS) {
    const ex = await db.collection("zonas_delivery").where("nombre","==",z.nombre).get();
    if (ex.empty) await crearZona(z.nombre, z.tarifa);
  }
  alert("✅ Datos iniciales cargados. Recarga la página.");
}
