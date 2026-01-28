// =====================================================
// CONFIGURACIÓN GENERAL
// =====================================================
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
const jwtToken = localStorage.getItem("jwt");

// =====================================================
// VALIDACIÓN DE SESIÓN
// =====================================================
if (!jwtToken) {
  window.location.href = "/acceso.html";
}

// =====================================================
// SUPABASE CLIENT (API KEY + JWT)
// =====================================================
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    global: {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    },
  },
);

// =====================================================
// DECODIFICAR JWT (ROL)
// =====================================================
function parseJwt(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

const sessionData = parseJwt(jwtToken);
const isAdmin =
  sessionData.is_admin === true || sessionData.is_admin === "true";

// =====================================================
// ELEMENTOS DOM
// =====================================================
const searchIdInput = document.getElementById("search-id");
const searchTextInput = document.getElementById("search-text");

const zoneFilter = document.getElementById("zone-filter");
const regionFilter = document.getElementById("region-filter");
const comunaFilter = document.getElementById("comuna-filter");

const resultsBody = document.getElementById("results-body");
const resultsCounter = document.getElementById("results-counter");

const logoutLink = document.getElementById("logout-link");

// =====================================================
// LOGOUT
// =====================================================
logoutLink.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("jwt");
  window.location.href = "/acceso.html";
});

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  loadCatalogs();
  searchInstitutions();
});

// =====================================================
// EVENTOS
// =====================================================
searchIdInput.addEventListener("keyup", searchInstitutions);
searchTextInput.addEventListener("keyup", searchInstitutions);
zoneFilter.addEventListener("change", searchInstitutions);
regionFilter.addEventListener("change", searchInstitutions);
comunaFilter.addEventListener("change", searchInstitutions);

// =====================================================
// CARGAR CATÁLOGOS
// =====================================================
async function loadCatalogs() {
  const { data: zones } = await supabaseClient
    .from("zones")
    .select("id, name")
    .order("name");

  fillSelect(zoneFilter, zones);

  const { data: regions } = await supabaseClient
    .from("regions")
    .select("id, name")
    .order("name");

  fillSelect(regionFilter, regions);

  const { data: comunas } = await supabaseClient
    .from("comunas")
    .select("id, name")
    .order("name");

  fillSelect(comunaFilter, comunas);
}

function fillSelect(select, data) {
  select.innerHTML = `<option value="">${select.options[0].text}</option>`;
  if (!data) return;

  data.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.name;
    select.appendChild(opt);
  });

  select.disabled = false;
}

// =====================================================
// BUSCAR INSTITUCIONES (READ)
// =====================================================
async function searchInstitutions() {
  resultsBody.innerHTML = "";

  let query = supabaseClient
    .from("institutions")
    .select(
      `
      id,
      institution_name,
      email,
      observation,
      zone:zones(name),
      region:regions(name),
      comuna:comunas(name)
    `,
    )
    .order("institution_name");

  if (searchIdInput.value.trim()) {
    query = query.eq("id", searchIdInput.value.trim());
  }

  if (searchTextInput.value.trim()) {
    query = query.ilike(
      "institution_name",
      `%${searchTextInput.value.trim()}%`,
    );
  }

  if (zoneFilter.value) query = query.eq("zone_id", zoneFilter.value);
  if (regionFilter.value) query = query.eq("region_id", regionFilter.value);
  if (comunaFilter.value) query = query.eq("comuna_id", comunaFilter.value);

  const { data, error } = await query;

  if (error) {
    alert("Error al buscar instituciones");
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    resultsCounter.textContent = "Registros encontrados: 0";
    return;
  }

  data.forEach(renderRow);
  resultsCounter.textContent = `Registros encontrados: ${data.length}`;
}

// =====================================================
// RENDER FILA
// =====================================================
function renderRow(record) {
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td>${record.id}</td>
    <td>${record.institution_name}</td>
    <td>${record.email.replaceAll(";", "<br>")}</td>
    <td>${record.region?.name || ""}</td>
    <td>${record.comuna?.name || ""}</td>
    <td>${record.observation || ""}</td>
    <td>—</td>
    <td>
      ${
        isAdmin
          ? `
        <button class="btn btn-sm btn-warning"
                onclick="editInstitution(${record.id})">
          Editar
        </button>
        <button class="btn btn-sm btn-danger"
                onclick="deleteInstitution(${record.id})">
          Eliminar
        </button>
      `
          : `
        <button class="btn btn-sm btn-outline-secondary"
                onclick="copyEmail('${record.email}')">
          Copiar
        </button>
      `
      }
    </td>
  `;

  resultsBody.appendChild(tr);
}

// =====================================================
// COPIAR CORREO
// =====================================================
function copyEmail(email) {
  navigator.clipboard
    .writeText(email)
    .then(() => alert("Correo copiado"))
    .catch(() => alert("No se pudo copiar"));
}

// =====================================================
// CREATE (ADMIN)
// =====================================================
async function createInstitution(payload) {
  if (!isAdmin) return;

  const { error } = await supabaseClient.from("institutions").insert(payload);

  if (error) {
    alert("Error al crear institución");
  } else {
    searchInstitutions();
  }
}

// =====================================================
// UPDATE (ADMIN)
// =====================================================
async function editInstitution(id) {
  if (!isAdmin) return;

  const newName = prompt("Nuevo nombre de la institución:");
  if (!newName) return;

  const { error } = await supabaseClient
    .from("institutions")
    .update({ institution_name: newName })
    .eq("id", id);

  if (error) {
    alert("Error al actualizar");
  } else {
    searchInstitutions();
  }
}

// =====================================================
// DELETE (ADMIN)
// =====================================================
async function deleteInstitution(id) {
  if (!isAdmin) return;

  if (!confirm("¿Eliminar esta institución?")) return;

  const { error } = await supabaseClient
    .from("institutions")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Error al eliminar");
  } else {
    searchInstitutions();
  }
}
// =====================================================
