// ──────────────────────────────────────────────────────
// auth.js — Funciones compartidas de autenticación
// Incluir en TODAS las páginas después de firebase-config.js
// ──────────────────────────────────────────────────────

// Obtener datos del usuario actual desde Firestore
async function obtenerUsuarioActual() {
  const user = auth.currentUser;
  if (!user) return null;
  const doc = await db.collection("usuarios").doc(user.uid).get();
  if (!doc.exists) return null;
  return { id: user.uid, ...doc.data() };
}

// Proteger páginas que requieren autenticación
function protegerPagina(rolesPermitidos = []) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "/login.html";
      return;
    }
    if (rolesPermitidos.length > 0) {
      const datos = await obtenerUsuarioActual();
      if (!datos || !rolesPermitidos.includes(datos.rol)) {
        window.location.href = "/catalogo.html";
        return;
      }
    }
    // Inicializar la página
    if (typeof iniciarPagina === "function") iniciarPagina();
  });
}

// Cerrar sesión
function cerrarSesion() {
  auth.signOut().then(() => {
    window.location.href = "/login.html";
  });
}

// Atajo de teclado Ctrl+Shift+A → solo para admins
document.addEventListener("keydown", async (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === "A") {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    const datos = await obtenerUsuarioActual();
    if (datos && datos.rol === "administrador") {
      window.location.href = "/admin/dashboard.html";
    }
  }
});

// Mostrar nombre del usuario en el navbar
async function cargarNavbar() {
  const datos = await obtenerUsuarioActual();
  if (!datos) return;
  const el = document.getElementById("usuario-nombre");
  if (el) el.textContent = datos.nombre;
  const rol = document.getElementById("usuario-rol");
  if (rol) rol.textContent = datos.rol;
}

// Toast de notificaciones
function mostrarToast(mensaje, tipo = "success") {
  const colores = {
    success: "bg-success", danger: "bg-danger",
    warning: "bg-warning text-dark", info: "bg-info text-dark"
  };
  const toast = document.createElement("div");
  toast.className = `toast align-items-center text-white ${colores[tipo] || "bg-success"} border-0 show`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${mensaje}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto"
              onclick="this.closest('.toast').remove()"></button>
    </div>`;
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Formatear precio
function fmt(num) {
  return "$" + parseFloat(num || 0).toFixed(2);
}

// Etiquetas y colores de estado
const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente", confirmado: "Confirmado",
  en_preparacion: "En Preparación", en_camino: "En Camino",
  listo_para_retirar: "Listo para Retirar",
  entregado: "Entregado", cancelado: "Cancelado"
};
const COLORES_ESTADO = {
  pendiente: "warning", confirmado: "info",
  en_preparacion: "primary", en_camino: "secondary",
  listo_para_retirar: "success", entregado: "success", cancelado: "danger"
};

// Verificar si una transición de estado es válida (Patrón State)
const TRANSICIONES_VALIDAS = {
  pendiente:          ["confirmado", "cancelado"],
  confirmado:         ["en_preparacion", "cancelado"],
  en_preparacion:     ["en_camino", "listo_para_retirar"],
  en_camino:          ["entregado"],
  listo_para_retirar: ["entregado"],
  entregado:          [],
  cancelado:          []
};

function puedeTransicionar(estadoActual, nuevoEstado) {
  return (TRANSICIONES_VALIDAS[estadoActual] || []).includes(nuevoEstado);
}
