// =====================================================
// CONFIGURACIÓN GENERAL
// =====================================================
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

// Valores "No definidos"
const ZONE_NO_DEFINIDA_ID = 5;
const REGION_NO_DEFINIDA_ID = 17;
const COMUNA_NO_DEFINIDA_ID = 30;

// =====================================================
// SUPABASE CLIENT
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
// MODAL EDICIÓN
// =====================================================
const editModalEl = document.getElementById("editInstitutionModal");
const editModal = new bootstrap.Modal(editModalEl);

const editIdInput = document.getElementById("edit-id");
const editInstitutionName = document.getElementById("edit-institution-name");
const editEmail = document.getElementById("edit-email");
const editRegion = document.getElementById("edit-region");
const editComuna = document.getElementById("edit-comuna");
const editObservation = document.getElementById("edit-observation");
const editFilesList = document.getElementById("edit-files-list");
const editNewFileInput = document.getElementById("edit-new-file");

// =====================================================
// INIT
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  loadCatalogs();
  searchInstitutions();

  document
    .getElementById("btn-save-institution")
    .addEventListener("click", saveInstitutionChanges);
});

// =====================================================
// EVENTOS FILTROS
// =====================================================
searchIdInput.addEventListener("keyup", searchInstitutions);
searchTextInput.addEventListener("keyup", searchInstitutions);
zoneFilter.addEventListener("change", searchInstitutions);
regionFilter.addEventListener("change", searchInstitutions);
comunaFilter.addEventListener("change", searchInstitutions);

// =====================================================
// CARGAR CATÁLOGOS FILTROS
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
  data?.forEach(i => {
    const opt = document.createElement("option");
    opt.value = i.id;
    opt.textContent = i.name;
    select.appendChild(opt);
  });
  select.disabled = false;
}

// =====================================================
// BUSCAR INSTITUCIONES
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
      comuna:comunas(name),
      files:institution_files(file_name, file_path)
    `)
    .order("id");

  if (searchIdInput.value) query = query.eq("id", searchIdInput.value);
  if (searchTextInput.value)
    query = query.ilike("institution_name", `%${searchTextInput.value}%`);
  if (regionFilter.value) query = query.eq("region_id", regionFilter.value);
  if (comunaFilter.value) query = query.eq("comuna_id", comunaFilter.value);

  const { data, error } = await query;
  if (error) return showCopyToast("Error al buscar");

  resultsCounter.textContent = `Registros encontrados: ${data.length}`;
  data.forEach(renderRow);
}

// =====================================================
// STORAGE
// =====================================================
function getPublicFileUrl(path) {
  return supabaseClient.storage
    .from("institution-files")
    .getPublicUrl(path).data.publicUrl;
}

// =====================================================
// RENDER TABLA
// =====================================================
function renderRow(r) {
  const tr = document.createElement("tr");

  let pdfHtml = "";
  if (r.files?.length) {
    const pdfs = r.files.filter(f => f.file_name.endsWith(".pdf"));
    if (pdfs.length) {
      pdfHtml = `
        <a href="${getPublicFileUrl(pdfs[0].file_path)}"
           target="_blank"
           class="pdf-preview">
          <i class="bi bi-file-earmark-pdf-fill pdf-icon"></i>
          ${pdfs.length > 1 ? `<span class="pdf-badge">${pdfs.length}</span>` : ""}
        </a>`;
    }
  }

  tr.innerHTML = `
    <td class="col-center">${r.id}</td>
    <td>${r.institution_name}</td>
    <td>${r.email.replaceAll(";", "<br>")}</td>
    <td>${r.zone?.name || "No definida"}</td>
    <td>${r.region?.name || "No definida"}</td>
    <td>${r.comuna?.name || "No definida"}</td>
    <td>${r.observation || ""}</td>
    <td class="col-center">${pdfHtml}</td>
    <td class="col-center">
      <button class="btn btn-sm btn-copiar"
              onclick="copyEmail('${r.email}')">
        Copiar
      </button>
    </td>
    <td class="col-center">
      <button class="btn btn-sm btn-outline-primary"
              onclick="editInstitution(${r.id})">
        <i class="bi bi-pencil-square"></i>
      </button>
    </td>`;
  resultsBody.appendChild(tr);
}

// =====================================================
// EDITAR INSTITUCIÓN
// =====================================================
async function editInstitution(id) {
  const { data, error } = await supabaseClient
    .from("institutions")
    .select(`
      id, institution_name, email, observation, region_id, comuna_id,
      files:institution_files(id, file_name, file_path, uploaded_at, institution_id)
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error('Error al cargar institución:', error);
    return showCopyToast("Error al cargar los datos");
  }

  editIdInput.value = data.id;
  editInstitutionName.value = data.institution_name || "";
  editEmail.value = data.email || "";
  editObservation.value = data.observation || "";

  await loadEditRegions(data.region_id, data.comuna_id);
  renderEditFiles(data.files || []);
  editModal.show();
}

// =====================================================
// REGIÓN / COMUNA UX
// =====================================================
async function loadEditRegions(regionId, comunaId) {
  const { data: regions } = await supabaseClient
    .from("regions")
    .select("id, name")
    .order("name");

  editRegion.innerHTML = `<option value="">No definida</option>`;
  regions.forEach(r => {
    const opt = new Option(r.name, r.id, false, r.id === regionId);
    editRegion.add(opt);
  });

  editComuna.disabled = !regionId;
  await loadEditComunas(regionId, comunaId);

  editRegion.onchange = () => {
    editComuna.value = "";
    editComuna.disabled = !editRegion.value;
    showCopyToast("Zona asignada automáticamente");
    loadEditComunas(editRegion.value, null);
  };
}

async function loadEditComunas(regionId, comunaId) {
  editComuna.innerHTML = `<option value="">No definida</option>`;
  if (!regionId) return;

  const { data } = await supabaseClient
    .from("comunas")
    .select("id, name")
    .eq("region_id", regionId)
    .order("name");

  data.forEach(c => {
    const opt = new Option(c.name, c.id, false, c.id === comunaId);
    editComuna.add(opt);
  });
}

// =====================================================
// GUARDAR CAMBIOS (NORMALIZADO)
// =====================================================
async function saveInstitutionChanges() {
  const btn = document.getElementById("btn-save-institution");
  const originalText = btn.innerHTML;
  
  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';

    let regionId = editRegion.value || null;
    let comunaId = editComuna.value || null;

    let finalRegion = REGION_NO_DEFINIDA_ID;
    let finalComuna = COMUNA_NO_DEFINIDA_ID;
    let finalZone = ZONE_NO_DEFINIDA_ID;

    // 🔵 Comuna seleccionada → domina todo
    if (comunaId) {
      const { data } = await supabaseClient
        .from("comunas")
        .select("id, region_id, regions(zone_id)")
        .eq("id", comunaId)
        .single();

      if (data) {
        finalComuna = data.id;
        finalRegion = data.region_id;
        finalZone = data.regions.zone_id;
      }
    }

    // 🟡 Solo región
    else if (regionId) {
      const { data } = await supabaseClient
        .from("regions")
        .select("id, zone_id")
        .eq("id", regionId)
        .single();

      if (data) {
        finalRegion = data.id;
        finalZone = data.zone_id;
        finalComuna = COMUNA_NO_DEFINIDA_ID;
      }
    }

    // Actualizar institución
    const { error: updateError } = await supabaseClient
      .from("institutions")
      .update({
        institution_name: editInstitutionName.value,
        email: editEmail.value,
        observation: editObservation.value,
        region_id: finalRegion,
        comuna_id: finalComuna,
        zone_id: finalZone,
        updated_at: new Date().toISOString()
      })
      .eq("id", editIdInput.value);

    if (updateError) {
      console.error('Error al actualizar institución:', updateError);
      showCopyToast(`Error: ${updateError.message}`);
      return;
    }

    // Subir archivo si hay uno nuevo
    if (editNewFileInput.files.length) {
      await uploadNewPdf(editIdInput.value);
    }

    editModal.hide();
    showCopyToast("Cambios guardados correctamente");
    searchInstitutions();

  } catch (error) {
    console.error('Error en saveInstitutionChanges:', error);
    showCopyToast("Error al guardar cambios");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// =====================================================
// FUNCIONES PDF (CORREGIDAS - SIN DUPLICADOS)
// =====================================================

async function uploadNewPdf(id) {
  const file = editNewFileInput.files[0];
  if (!file) return;

  // Sanitizar nombre del archivo
  const sanitizedName = file.name
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '');
  
  const fileName = `${Date.now()}_${sanitizedName}`;
  const path = `institution_${id}/${fileName}`;

  try {
    // 1. Subir archivo al Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from("institution-files")
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Error al subir el archivo:', uploadError);
      showCopyToast(`Error al subir: ${uploadError.message}`);
      return;
    }

    // 2. Insertar registro en la tabla
    const { data: insertData, error: insertError } = await supabaseClient
      .from("institution_files")
      .insert({
        institution_id: parseInt(id),
        file_name: file.name,
        file_path: path
      });

    if (insertError) {
      console.error('Error al insertar registro:', insertError);
      showCopyToast(`Error al guardar registro: ${insertError.message}`);
      
      // Rollback: eliminar archivo si falla la inserción
      await supabaseClient.storage
        .from("institution-files")
        .remove([path]);
      
      return;
    }

    // 3. Actualizar lista de archivos EN EL MODAL
    await refreshEditFiles(parseInt(id));
    showCopyToast("Archivo subido correctamente");
    editNewFileInput.value = "";

  } catch (error) {
    console.error('Error inesperado:', error);
    showCopyToast("Error inesperado al procesar el archivo");
  }
}

async function refreshEditFiles(institutionId) {
  if (!institutionId) return;
  
  const { data: updatedFiles, error } = await supabaseClient
    .from("institution_files")
    .select("id, file_name, file_path, uploaded_at, institution_id")
    .eq("institution_id", institutionId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error('Error al cargar archivos:', error);
    return;
  }

  renderEditFiles(updatedFiles || []);
}

function renderEditFiles(files) {
  editFilesList.innerHTML = files.length
    ? files.map(f => `
        <div class="d-flex align-items-center gap-2 mb-2 p-2 border rounded">
          <i class="bi bi-file-earmark-pdf-fill pdf-icon"></i>
          <div class="flex-grow-1">
            <a href="${getPublicFileUrl(f.file_path)}" 
               target="_blank" 
               class="d-block text-truncate" style="max-width: 200px;">
              ${f.file_name}
            </a>
            <small class="text-muted">
              ${new Date(f.uploaded_at).toLocaleDateString('es-CL')}
            </small>
          </div>
          <button class="btn btn-sm btn-outline-danger" 
                  onclick="deleteFile(${f.id}, '${f.file_path}', ${f.institution_id})"
                  title="Eliminar archivo">
            <i class="bi bi-trash"></i>
          </button>
        </div>`).join("")
    : `<div class="text-muted p-2 text-center">No hay documentos adjuntos</div>`;
}

async function deleteFile(fileId, filePath, institutionId) {
  if (!confirm("¿Estás seguro de eliminar este archivo?")) return;

  try {
    // 1. Eliminar de Storage
    const { error: storageError } = await supabaseClient.storage
      .from("institution-files")
      .remove([filePath]);

    if (storageError) throw storageError;

    // 2. Eliminar registro de la tabla
    const { error: dbError } = await supabaseClient
      .from("institution_files")
      .delete()
      .eq("id", fileId);

    if (dbError) throw dbError;

    // 3. Actualizar lista
    await refreshEditFiles(institutionId);
    showCopyToast("Archivo eliminado");

  } catch (error) {
    console.error('Error al eliminar:', error);
    showCopyToast(`Error: ${error.message}`);
  }
}

// =====================================================
// TOAST
// =====================================================
let toastTimeout;
function showCopyToast(msg) {
  const t = document.getElementById("toast-copiar");
  t.textContent = msg;
  t.classList.remove("show");
  void t.offsetWidth;
  t.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove("show"), 2500);
}

// =====================================================
// COPIAR
// =====================================================
function copyEmail(email) {
  navigator.clipboard
    .writeText(email)
    .then(() => showCopyToast("Correo copiado"))
    .catch(() => showCopyToast("No se pudo copiar"));
}