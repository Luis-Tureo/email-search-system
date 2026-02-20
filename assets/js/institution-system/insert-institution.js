/* =====================================================
   VISTA: INGRESO DE INSTITUCIONES
   - Variables y funciones en inglés
   - Comentarios en español
   - Mensajes al usuario en español
   - Toast solamente (sin alert/confirm)
   ===================================================== */

/* =========================
   CONFIGURACIÓN GENERAL
   ========================= */
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

/* Valores "No definidos" (mismos IDs usados en app.js) */
const ZONE_NO_DEFINIDA_ID = 5;
const REGION_NO_DEFINIDA_ID = 17;
const COMUNA_NO_DEFINIDA_ID = 30;

/* =========================
   SUPABASE CLIENT
   ========================= */
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

/* =========================
   DOM
   ========================= */
let loginScreen;
let appContent;

const regionSelect = document.getElementById("region-select");
const comunaSelect = document.getElementById("comuna-select");
const zoneReadonly = document.getElementById("zone-readonly");

const institutionNameInput = document.getElementById("institution-name");
const institutionEmailInput = document.getElementById("institution-email");
const submissionMethodSelect = document.getElementById(
  "submission-method-select",
);
const validationStatusSelect = document.getElementById(
  "validation-status-select",
);
const institutionGroupSelect = document.getElementById(
  "institution-group-select",
);
const institutionObservationInput = document.getElementById(
  "institution-observation",
);
const institutionPdfInput = document.getElementById("institution-pdf");

const noPermissionBox = document.getElementById("no-permission");
const btnSave = document.getElementById("btn-save");
const btnClear = document.getElementById("btn-clear");

/* =========================
   INIT
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  loginScreen = document.getElementById("login-screen");
  appContent = document.getElementById("app-content");

  const passInput = document.getElementById("login-password");
  passInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doLogin();
    }
  });

  passInput?.addEventListener("input", () => {
    document.getElementById("login-error")?.classList.add("d-none");
  });

  document.getElementById("btn-login")?.addEventListener("click", doLogin);
  document.getElementById("logout-link")?.addEventListener("click", logout);

  btnSave?.addEventListener("click", createInstitution);
  btnClear?.addEventListener("click", clearForm);

  // Si ya hay sesión activa, mostrar directo
  if (sessionStorage.getItem("logged") === "true") {
    showApp();
    applyRoleUI(sessionStorage.getItem("role"));

    // Cargar catálogos (esperar para evitar selects vacíos)
    await loadRegions();
    await loadSubmissionMethods();
    await loadValidationStatuses();
    await loadInstitutionGroups(); // ✅ FALTABA
  } else {
    loginScreen.classList.remove("d-none");
    appContent.classList.add("d-none");
  }
});

/* =========================
   LOGIN
   ========================= */
async function doLogin() {
  const btn = document.getElementById("btn-login");
  const errorMsg = document.getElementById("login-error");
  btn.disabled = true;

  try {
    const pass = document.getElementById("login-password").value.trim();

    const { data, error } = await supabaseClient
      .from("system_credentials")
      .select("password_hash, role")
      .eq("active", true)
      .eq("password_hash", pass)
      .limit(1);

    if (error || !data || data.length === 0) {
      errorMsg.classList.remove("d-none");
      return;
    }

    sessionStorage.setItem("logged", "true");
    sessionStorage.setItem("role", data[0].role);

    showApp();
    applyRoleUI(data[0].role);

    // Cargar catálogos
    await loadRegions();
    await loadSubmissionMethods();
    await loadValidationStatuses();
    await loadInstitutionGroups();

    showToast("Sesión iniciada");
  } catch (err) {
    console.error(err);
    errorMsg.classList.remove("d-none");
  } finally {
    btn.disabled = false;
  }
}

function showApp() {
  loginScreen.classList.add("d-none");
  appContent.classList.remove("d-none");
}

function logout() {
  // elimina sesión
  sessionStorage.removeItem("logged");
  sessionStorage.removeItem("role");

  //intenta limpiar campos si existen (por si se reutiliza en index)
  const passInput = document.getElementById("login-password");
  if (passInput) passInput.value = "";

  const loginError = document.getElementById("login-error");
  if (loginError) loginError.classList.add("d-none");

  window.location.href = "/index.html";
}

/* =========================
   ROLES
   ========================= */
function applyRoleUI(role) {
  const isAdmin = role === "admin";

  noPermissionBox.classList.toggle("d-none", isAdmin);
  btnSave.disabled = !isAdmin;

  // Igual dejamos cargar catálogos para que el usuario vea la vista,
  // pero el botón Guardar queda bloqueado si no es admin.
}

/* =========================
   TOAST
   ========================= */
let toastTimeout;
function showToast(msg) {
  const t = document.getElementById("toast-copiar");
  if (!t) return;

  t.textContent = msg;
  t.classList.remove("show");
  void t.offsetWidth;
  t.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove("show"), 2500);
}

/* =========================
   CATÁLOGOS REGIÓN/COMUNA
   ========================= */
async function loadRegions() {
  try {
    regionSelect.disabled = true;
    comunaSelect.disabled = true;

    const { data, error } = await supabaseClient
      .from("regions")
      .select("id, name, zones(name)")
      .order("name");

    if (error) {
      console.error(error);
      showToast("No se pudieron cargar regiones");
      return;
    }

    regionSelect.innerHTML = `<option value="">Seleccione región</option>`;
    data.forEach((r) => {
      const opt = new Option(r.name, r.id);
      opt.dataset.zoneName = r.zones?.name || "";
      regionSelect.add(opt);
    });

    regionSelect.disabled = false;

    // Evento: al cambiar región, cargar comunas y setear zona
    regionSelect.onchange = async () => {
      const selectedOpt = regionSelect.options[regionSelect.selectedIndex];
      zoneReadonly.value = selectedOpt?.dataset?.zoneName || "";

      comunaSelect.value = "";
      comunaSelect.disabled = !regionSelect.value;

      if (!regionSelect.value) {
        comunaSelect.innerHTML = `<option value="">Seleccione comuna</option>`;
        zoneReadonly.value = "";
        return;
      }

      await loadComunas(regionSelect.value);
    };

    // Evento: al cambiar comuna, recalcular zona desde comuna->region->zone
    comunaSelect.onchange = async () => {
      if (!comunaSelect.value) return;
      await syncZoneFromComuna(comunaSelect.value);
    };
  } catch (e) {
    console.error(e);
    showToast("Error al cargar catálogos");
  }
}

async function loadComunas(regionId) {
  try {
    comunaSelect.innerHTML = `<option value="">Seleccione comuna</option>`;

    const { data, error } = await supabaseClient
      .from("comunas")
      .select("id, name")
      .eq("region_id", regionId)
      .order("name");

    if (error) {
      console.error(error);
      showToast("No se pudieron cargar comunas");
      return;
    }

    data.forEach((c) => {
      const opt = new Option(c.name, c.id);
      comunaSelect.add(opt);
    });

    comunaSelect.disabled = false;
  } catch (e) {
    console.error(e);
    showToast("Error al cargar comunas");
  }
}

async function syncZoneFromComuna(comunaId) {
  try {
    const { data, error } = await supabaseClient
      .from("comunas")
      .select("id, region_id, regions(zones(name), zone_id)")
      .eq("id", comunaId)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    // Setear región si corresponde
    if (data?.region_id && regionSelect.value !== String(data.region_id)) {
      regionSelect.value = String(data.region_id);
      await loadComunas(data.region_id);
      comunaSelect.value = String(comunaId);
    }

    zoneReadonly.value = data?.regions?.zones?.name || "";
  } catch (e) {
    console.error(e);
  }
}

/* =========================
   CREAR INSTITUCIÓN
   ========================= */
async function createInstitution() {
  // Validación simple sin alert nativo
  if (sessionStorage.getItem("role") !== "admin") {
    showToast("No tiene permisos para guardar");
    return;
  }

  const name = institutionNameInput.value.trim();
  const email = institutionEmailInput.value.trim();
  const observation = institutionObservationInput.value.trim();

  const submissionMethodId = submissionMethodSelect?.value || "";
  const validationStatusId = validationStatusSelect?.value || "";
  const institutionGroupId = institutionGroupSelect?.value || "";

  if (!institutionGroupId) return showToast("Debe seleccionar el grupo");
  if (!name) return showToast("Debe ingresar el nombre de la institución");
  if (!email) return showToast("Debe ingresar al menos un correo");
  if (!submissionMethodId)
    return showToast("Debe seleccionar el método de ingreso");
  if (!validationStatusId)
    return showToast("Debe seleccionar el estado de validación");

  const originalBtnHtml = btnSave.innerHTML;

  try {
    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Guardando...`;

    // Normalización de región/comuna/zona (misma lógica base que tu app.js)
    let regionId = regionSelect.value || null;
    let comunaId = comunaSelect.value || null;

    let finalRegion = REGION_NO_DEFINIDA_ID;
    let finalComuna = COMUNA_NO_DEFINIDA_ID;
    let finalZone = ZONE_NO_DEFINIDA_ID;

    // Si hay comuna, domina todo (zona y región se derivan)
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
    } else if (regionId) {
      // Solo región
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

    // 1) Insertar institución
    const { data: inserted, error: insertError } = await supabaseClient
      .from("institutions")
      .insert({
        institution_name: name,
        email: email,
        observation: observation,

        // Campos NOT NULL (catálogos)
        submission_method_id: parseInt(submissionMethodId, 10),
        validation_status_id: parseInt(validationStatusId, 10),
        institution_group_id: parseInt(institutionGroupId, 10),

        // Campos NOT NULL (geografía)
        region_id: finalRegion,
        comuna_id: finalComuna,
        zone_id: finalZone,

        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(insertError);
      showToast(`Error: ${insertError.message}`);
      return;
    }

    const institutionId = inserted.id;

    // 2) Subir PDF opcional
    if (institutionPdfInput.files && institutionPdfInput.files.length) {
      const file = institutionPdfInput.files[0];

      if (file.type !== "application/pdf") {
        showToast("El archivo debe ser PDF");
      } else {
        await uploadInstitutionPdf(institutionId, file);
      }
    }

    showToast("Institución guardada correctamente");
    clearForm();
  } catch (e) {
    console.error(e);
    showToast("Error inesperado al guardar");
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = originalBtnHtml;
  }
}

/* =========================
   SUBIR PDF + REGISTRO
   ========================= */
async function uploadInstitutionPdf(institutionId, file) {
  try {
    // Sanitizar nombre para evitar InvalidKey
    const safeName = generateSafeFileName(file.name);
    const filePath = `institution_${institutionId}/${safeName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("institution-files")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/pdf",
      });

    if (uploadError) {
      console.error(uploadError);
      showToast(`Error al subir PDF: ${uploadError.message}`);
      return;
    }

    const { error: dbError } = await supabaseClient
      .from("institution_files")
      .insert({
        institution_id: parseInt(institutionId),
        file_name: file.name,
        file_path: filePath,
        uploaded_at: new Date().toISOString(),
      });

    if (dbError) {
      console.error(dbError);

      // Si falla el registro, intentamos limpiar el archivo subido
      try {
        await supabaseClient.storage
          .from("institution-files")
          .remove([filePath]);
      } catch (cleanupErr) {
        console.error("Error limpiando PDF:", cleanupErr);
      }

      showToast(`Error al registrar PDF: ${dbError.message}`);
      return;
    }

    showToast("PDF subido correctamente");
  } catch (e) {
    console.error(e);
    showToast("Error inesperado al subir PDF");
  }
}

/* =========================
   UTILIDADES
   ========================= */
function clearForm() {
  institutionNameInput.value = "";
  institutionEmailInput.value = "";
  institutionObservationInput.value = "";
  institutionPdfInput.value = "";

  // Reset selects obligatorios
  if (submissionMethodSelect) submissionMethodSelect.value = "";
  if (institutionGroupSelect) institutionGroupSelect.value = "";
  if (validationStatusSelect) validationStatusSelect.value = "";

  regionSelect.value = "";
  comunaSelect.innerHTML = `<option value="">Seleccione comuna</option>`;
  comunaSelect.value = "";
  comunaSelect.disabled = true;

  zoneReadonly.value = "";
}

function generateSafeFileName(filename) {
  // Comentarios en español: nombre seguro para storage (sin tildes/espacios raros)
  const ext = filename.includes(".")
    ? "." + filename.split(".").pop().toLowerCase()
    : ".pdf";

  const base = filename.includes(".")
    ? filename.substring(0, filename.lastIndexOf("."))
    : filename;

  const normalized = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const finalBase = normalized || `documento_${Date.now()}`;
  return `${finalBase}${ext}`;
}

/* =========================
   CATÁLOGOS MÉTODO / ESTADO
   ========================= */
async function loadSubmissionMethods() {
  try {
    if (!submissionMethodSelect) return;

    submissionMethodSelect.disabled = true;
    submissionMethodSelect.innerHTML = `<option value="">Seleccione método</option>`;

    const { data, error } = await supabaseClient
      .from("submission_methods")
      .select("id, name")
      .order("name");

    if (error) {
      console.error(error);
      showToast("No se pudieron cargar métodos de ingreso");
      return;
    }

    data.forEach((m) => submissionMethodSelect.add(new Option(m.name, m.id)));
    submissionMethodSelect.disabled = false;
  } catch (e) {
    console.error(e);
    showToast("Error al cargar métodos de ingreso");
  }
}

async function loadValidationStatuses() {
  try {
    if (!validationStatusSelect) return;

    validationStatusSelect.disabled = true;
    validationStatusSelect.innerHTML = `<option value="">Seleccione estado</option>`;

    const { data, error } = await supabaseClient
      .from("validation_statuses")
      .select("id, name")
      .order("name");

    if (error) {
      console.error(error);
      showToast("No se pudieron cargar estados de validación");
      return;
    }

    data.forEach((s) => validationStatusSelect.add(new Option(s.name, s.id)));
    validationStatusSelect.disabled = false;
  } catch (e) {
    console.error(e);
    showToast("Error al cargar estados de validación");
  }
}

/* =========================
   CATÁLOGO GRUPOS
   ========================= */
async function loadInstitutionGroups() {
  try {
    if (!institutionGroupSelect) return;

    institutionGroupSelect.disabled = true;
    institutionGroupSelect.innerHTML = `<option value="">Seleccione grupo</option>`;

    const { data, error } = await supabaseClient
      .from("institution_groups")
      .select("id, name")
      .eq("active", true)
      .order("name");

    if (error) {
      console.error(error);
      showToast("No se pudieron cargar grupos");
      return;
    }

    data.forEach((g) => institutionGroupSelect.add(new Option(g.name, g.id)));
    institutionGroupSelect.disabled = false;
  } catch (e) {
    console.error(e);
    showToast("Error al cargar grupos");
  }
}
