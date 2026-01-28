// =====================================================
// CONFIGURACIÓN GENERAL (MODO PRUEBA)
// =====================================================
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

// =====================================================
// SUPABASE CLIENT (SIN JWT)
// =====================================================
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

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

// =====================================================
// INIT
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
    .select(`
      id,
      institution_name,
      email,
      observation,
      region:regions(name),
      comuna:comunas(name)
    `)
    .order("institution_name");

  if (searchIdInput.value.trim()) {
    query = query.eq("id", searchIdInput.value.trim());
  }

  if (searchTextInput.value.trim()) {
    query = query.ilike(
      "institution_name",
      `%${searchTextInput.value.trim()}%`
    );
  }

  if (regionFilter.value) query = query.eq("region_id", regionFilter.value);
  if (comunaFilter.value) query = query.eq("comuna_id", comunaFilter.value);

  const { data, error } = await query;

  if (error) {
    console.error(error);
    alert("Error al buscar instituciones");
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
// RENDER
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
      <button class="btn btn-sm btn-outline-secondary"
              onclick="copyEmail('${record.email}')">
        Copiar
      </button>
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
