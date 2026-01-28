document.addEventListener("DOMContentLoaded", function () {
  const tooltipTriggerList = [].slice.call(
    document.querySelectorAll('[data-bs-toggle="tooltip"]'),
  );

  tooltipTriggerList.forEach(function (tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Carga inicial segura
  loadFilters();
  performSearch();
});

// =====================================================
// ELEMENTOS PRINCIPALES DE LA INTERFAZ
// =====================================================

// Campos de búsqueda
const searchIdInput = document.getElementById("buscar-id");
const searchInput = document.getElementById("buscar");

// Filtros
const zoneFilter = document.getElementById("zona");
const regionFilter = document.getElementById("region");
const comunaFilter = document.getElementById("comuna");

// Tabla y contador
const tableBody = document.getElementById("tabla-body");
const counterLabel = document.getElementById("counter");

// =====================================================
// RUTA BASE CORRECTA HACIA search.php
// =====================================================

// app/assets/js/app.js  →  app/search.php
const API_URL = "../../search.php";

// =====================================================
// EVENTOS DE BÚSQUEDA
// =====================================================

if (searchIdInput) searchIdInput.addEventListener("keyup", performSearch);
if (searchInput) searchInput.addEventListener("keyup", performSearch);

if (zoneFilter) zoneFilter.addEventListener("change", performSearch);
if (regionFilter) regionFilter.addEventListener("change", performSearch);
if (comunaFilter) comunaFilter.addEventListener("change", performSearch);

// =====================================================
// CARGA DINÁMICA DE FILTROS DESDE BASE DE DATOS
// =====================================================

function loadFilters() {
  // ZONAS
  fetch(`${API_URL}?action=zones`)
    .then((res) => res.json())
    .then((data) => fillSelect(zoneFilter, data));

  // REGIONES
  fetch(`${API_URL}?action=regions`)
    .then((res) => res.json())
    .then((data) => fillSelect(regionFilter, data));

  // COMUNAS
  fetch(`${API_URL}?action=comunas`)
    .then((res) => res.json())
    .then((data) => fillSelect(comunaFilter, data));
}

// =====================================================
// LLENAR SELECT NORMAL
// =====================================================

function fillSelect(select, data) {
  if (!select) return;

  // Limpiar opciones previas (excepto la primera)
  select
    .querySelectorAll("option:not(:first-child)")
    .forEach((o) => o.remove());

  data.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  select.disabled = false;
}

// =====================================================
// FUNCIÓN PRINCIPAL DE BÚSQUEDA
// =====================================================

function performSearch() {
  const params = new URLSearchParams();

  // 🔹 Búsqueda por ID
  if (searchIdInput && searchIdInput.value.trim() !== "") {
    params.append("id", searchIdInput.value.trim());
  }

  // 🔹 Búsqueda por texto
  if (searchInput && searchInput.value.trim() !== "") {
    params.append("q", searchInput.value.trim());
  }

  // Filtros
  if (zoneFilter && zoneFilter.value !== "") {
    params.append("zone", zoneFilter.value);
  }

  if (regionFilter && regionFilter.value !== "") {
    params.append("region", regionFilter.value);
  }

  if (comunaFilter && comunaFilter.value !== "") {
    params.append("comuna", comunaFilter.value);
  }

  fetch(`${API_URL}?${params.toString()}`)
    .then((response) => response.json())
    .then((data) => {
      renderResults(data);
    })
    .catch((error) => {
      console.error("Error búsqueda:", error);
      showToast("Error al realizar la búsqueda", "error");
    });
}

// =====================================================
// MOSTRAR RESULTADOS EN LA TABLA
// =====================================================

function renderResults(records) {
  tableBody.innerHTML = "";

  if (!records || records.length === 0) {
    counterLabel.innerText = "Registros encontrados: 0";
    return;
  }

  // Ordenar por ID ascendente
  records.sort((a, b) => parseInt(a.id) - parseInt(b.id));

  records.forEach((record) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td class="col-center">${record.id}</td>
      <td>${record.institution_name}</td>
      <td class="correo">${record.email}</td>
      <td>${record.region || ""}</td>
      <td>${record.comuna || ""}</td>
      <td>${record.observation || ""}</td>
      <td class="col-center">
        ${
          record.file_path
            ? `<button class="btn btn-sm btn-secondary"
                     onclick="openFile('${record.file_path}')"
                     data-bs-toggle="tooltip"
                     title="Abrir documento">
                Abrir
               </button>`
            : "—"
        }
      </td>
      <td class="col-center">
        <button class="btn btn-sm btn-copiar"
                onclick="copyEmail('${record.email}')">
          Copiar
        </button>
      </td>
    `;

    tableBody.appendChild(row);
  });

  counterLabel.innerText = "Registros encontrados: " + records.length;
}

// =====================================================
// COPIAR CORREO
// =====================================================

function copyEmail(email) {
  if (!email) {
    showToast("Este registro no tiene correo válido", "warning");
    return;
  }

  navigator.clipboard
    .writeText(email)
    .then(() => showToast("Correo copiado con éxito", "success"))
    .catch(() => showToast("No se pudo copiar el correo", "error"));
}

// =====================================================
// ABRIR ARCHIVO (CORREGIDO → usa ?ruta= como espera PHP)
// =====================================================

function openFile(path) {
  if (!path || path === "") {
    showToast("Este registro no tiene documento asociado", "warning");
    return;
  }

  window.open("/open_file.php?ruta=" + encodeURIComponent(path), "_blank");
}

// =====================================================
// MENSAJE TOAST INSTITUCIONAL
// =====================================================

function showToast(message, type) {
  const oldToast = document.querySelector(".toast-copiar");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = "toast-copiar";

  if (type === "success") toast.classList.add("toast-success");
  else if (type === "warning") toast.classList.add("toast-warning");
  else if (type === "error") toast.classList.add("toast-error");
  else toast.classList.add("toast-info");

  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 50);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 1400);
}

// =====================================================
// CERRAR SISTEMA COMPLETO
// Ejecuta stop.vbs y cierra la pestaña directamente
// =====================================================

function closeSystem() {
  // Enviar señal de apagado SIN esperar respuesta
  navigator.sendBeacon("close_system.php");

  // Cerrar pestaña inmediatamente
  setTimeout(() => {
    window.open("", "_self");
    window.close();
  }, 150);
}
