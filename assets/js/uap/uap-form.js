/***************************************************
 * CONFIGURACIÓN GENERAL
 ***************************************************/
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

/***************************************************
 * SUPABASE CLIENT (v2)
 ***************************************************/
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

/***************************************************
 * ESTADO DEL FORMULARIO
 ***************************************************/
let formState = {
  procedureType: null, // 'vif' | 'mp'
  status: "draft",
};

const ACTIVITY_OPTIONS = [
  "Sin actividad",
  "Trabajador/a dependiente",
  "Trabajador/a independiente",
  "Dueña/o de casa",
  "Estudiante",
  "Cesante",
  "Jubilado/a",
  "Otro",
];

/***************************************************
 * INICIO DEL FLUJO (VIF / MP)
 ***************************************************/
function startProcedure(type) {
  formState.procedureType = type;

  // Ocultar selector
  document.getElementById("procedure-selection")?.classList.add("d-none");

  // Mostrar solo VIF
  document.getElementById("form-uap")?.classList.remove("d-none");
  document.getElementById("form-mp")?.classList.add("d-none");

  // Mostrar acciones compartidas
  document.getElementById("procedure-actions")?.classList.remove("d-none");

  // Inicializaciones VIF
  initActivitySelects?.();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/***************************************************
 * UTILIDADES RUT
 ***************************************************/
function cleanRut(rut) {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function validateRut(rut) {
  rut = cleanRut(rut);
  if (rut.length < 8) return false;

  const body = rut.slice(0, -1);
  const dv = rut.slice(-1);
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += multiplier * parseInt(body[i], 10);
    multiplier = multiplier < 7 ? multiplier + 1 : 2;
  }

  const expected = 11 - (sum % 11);
  const finalDv =
    expected === 11 ? "0" : expected === 10 ? "K" : expected.toString();
  return dv === finalDv;
}

/***************************************************
 * AUTOCOMPLETADO (SUPABASE)
 ***************************************************/
async function fetchRutFromSupabase(rut) {
  const { data } = await supabaseClient
    .from("uap_registros")
    .select("datos")
    .eq("datos->>applicant_rut", cleanRut(rut))
    .limit(1);

  return data?.length ? data[0].datos : null;
}

async function autocompletePerson(rut) {
  return fetchRutFromSupabase(rut);
}

function showClearToast() {
  const toast = document.createElement("div");
  toast.className = "toast-copiar show";
  toast.textContent = "Formulario limpiado correctamente";

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function openClearFormModal() {
  const modal = new bootstrap.Modal(document.getElementById("clearFormModal"));
  modal.show();
}

function confirmClearForm() {
  // Limpiar según el tipo de trámite activo
  if (formState.procedureType === "mp") {
    clearProtectionMeasureForm(); // MP (función nueva)
  } else {
    const form = document.getElementById("form-uap");
    form?.reset();
    formState.status = "draft";
  }

  // Cerrar modal
  const modalEl = document.getElementById("clearFormModal");
  const instance = bootstrap.Modal.getInstance(modalEl);
  if (instance) instance.hide();

  // Toast
  showClearToast();
}

/***************************************************
 * FORM DATA
 ***************************************************/
function collectFormData() {
  const data = {};
  document
    .querySelectorAll("#form-uap input, #form-uap select, #form-uap textarea")
    .forEach((el) => {
      if (el.name) data[el.name] = el.value;
    });
  return data;
}

/***************************************************
 * GUARDAR REGISTRO
 ***************************************************/
async function saveRecord() {
  if (!formState.procedureType) {
    showCopyToast("Debe seleccionar el tipo de trámite.");
    throw new Error("Tipo de trámite no seleccionado");
  }

  const { data, error } = await supabaseClient
    .from("uap_registros")
    .insert([
      {
        tipo_tramite: formState.procedureType,
        datos: collectFormData(),
        estado: "confirmado",
      },
    ])
    .select("id")
    .single();

  if (error) {
    showCopyToast("Error al guardar el registro.");
    throw error;
  }

  showCopyToast("Registro guardado correctamente.");
  return data.id;
}

/***************************************************
 * PDF
 ***************************************************/
async function uploadPdfToStorage(blob, recordId) {
  const year = new Date().getFullYear();
  const path = `${year}/${formState.procedureType}/uap_${recordId}.pdf`;

  const { error } = await supabaseClient.storage
    .from("uap-pdf")
    .upload(path, blob, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) throw error;
  return path;
}

function buildPersonTable(title, fields) {
  const body = [[{ text: title, bold: true, colSpan: 2 }, {}]];

  Object.entries(fields).forEach(([k, v]) => {
    body.push([{ text: k, bold: true }, { text: v || " " }]);
  });

  return {
    table: { widths: ["30%", "70%"], body },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => "#000",
      vLineColor: () => "#000",
    },
    margin: [0, 0, 0, 15],
  };
}

async function generatePdfAndStore(recordId = null) {
  const data = collectFormData();

  // Fecha y hora Chile
  const nowText = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const conectaUrl = "https://conecta.pjud.cl/";

  // Helpers internos
  function safeText(v) {
    const t = (v ?? "").toString().trim();
    return t.length ? t : " ";
  }

  function pick(prefix, map) {
    const obj = {};
    Object.entries(map).forEach(([label, key]) => {
      obj[label] = safeText(data[`${prefix}_${key}`]);
    });
    return obj;
  }

  const applicantTableObj = pick("applicant", {
    "Nombre completo": "name",
    RUN: "rut",
    Teléfono: "phone",
    "Correo electrónico": "email",
    Domicilio: "address",
    Actividad: "activity",
  });

  const victimTableObj = pick("victim", {
    "Nombre completo": "name",
    RUN: "rut",
    "Fecha de nacimiento": "birthdate",
    Edad: "age",
    Teléfono: "phone",
    "Correo electrónico": "email",
    Domicilio: "address",
    Actividad: "activity",
  });

  const accusedTableObj = {
    ...pick("accused", {
      "Nombre completo": "name",
      RUN: "rut",
      Teléfono: "phone",
      "Correo electrónico": "email",
      Domicilio: "address",
      Actividad: "activity",
    }),
    "Vínculo / parentesco": safeText(data.relationship),
  };

  const docDefinition = {
    // ✅ Más margen abajo para que el footer NO se corte y se vea el QR
    pageMargins: [40, 90, 40, 95],

    header: function () {
      return {
        margin: [40, 18, 40, 0],
        columns: [
          { width: "*", text: "" },
          {
            width: "auto",
            stack: [
              // ✅ Logo SOLO a la derecha
              { image: PJUD_LOGO_BASE64, width: 170, alignment: "right" },
              {
                text: "PODER JUDICIAL",
                bold: true,
                fontSize: 10,
                alignment: "right",
                margin: [0, 4, 0, 0],
              },
              { text: "Conecta PJUD", fontSize: 8, alignment: "right" },
            ],
            alignment: "right",
          },
        ],
      };
    },

    footer: function (currentPage, pageCount) {
      return {
        margin: [40, 0, 40, 25],
        columns: [
          {
            width: "*",
            stack: [
              {
                text: "Pudeto 201, Ancud, Chiloé",
                fontSize: 8,
                margin: [0, 0, 0, 1],
              },
              {
                text: "Fono: (65) 262 6424 / Anexo 100",
                fontSize: 8,
                margin: [0, 0, 0, 1],
              },
              {
                text: "E-mail: jfancud@pjud.cl",
                fontSize: 8,
                margin: [0, 0, 0, 1],
              },
              { text: "www.pjud.cl", fontSize: 9, margin: [0, 0, 0, 4] },
              {
                text: `Fecha y hora: ${nowText}`,
                fontSize: 8,
                margin: [0, 0, 0, 0],
              },
              ...(pageCount > 1
                ? [
                    {
                      text: `Página ${currentPage} de ${pageCount}`,
                      fontSize: 8,
                      margin: [0, 2, 0, 0],
                    },
                  ]
                : []),
            ],
          },
          {
            width: 70,
            stack: [
              { qr: conectaUrl, fit: 50, alignment: "right" },
              {
                text: "Conecta PJUD",
                fontSize: 7,
                alignment: "right",
                margin: [0, 2, 0, 0],
              },
            ],
            alignment: "right",
          },
        ],
      };
    },

    content: [
      {
        text: "DENUNCIA VIOLENCIA INTRAFAMILIAR (UAP)",
        alignment: "center",
        bold: true,
        margin: [0, 35, 0, 18],
      },
      buildPersonTable("DATOS DEL DENUNCIANTE", applicantTableObj),
      buildPersonTable("DATOS DE LA VÍCTIMA", victimTableObj),
      buildPersonTable("DATOS DEL DENUNCIADO", accusedTableObj),
      {
        margin: [0, 45, 0, 0],
        columns: [
          {
            width: "50%",
            stack: [
              { text: "_______________________________", alignment: "center" },
              {
                text: "DENUNCIANTE",
                bold: true,
                alignment: "center",
                margin: [0, 6, 0, 0],
              },
            ],
          },
          {
            width: "50%",
            stack: [
              { text: "_______________________________", alignment: "center" },
              {
                text: "FUNCIONARIO/A QUE INGRESA",
                bold: true,
                alignment: "center",
                margin: [0, 6, 0, 0],
              },
            ],
          },
        ],
      },
    ],
    defaultStyle: { fontSize: 12 },
  };

  // Vista rápida sin guardar
  if (!recordId) {
    pdfMake.createPdf(docDefinition).open();
    return;
  }

  showCopyToast("Generando PDF...");

  pdfMake.createPdf(docDefinition).getBlob(async (blob) => {
    try {
      showCopyToast("Guardando PDF...");

      const path = await uploadPdfToStorage(blob, recordId);

      await supabaseClient
        .from("uap_registros")
        .update({ pdf_path: path })
        .eq("id", recordId);

      const iframe = document.getElementById("pdf-preview");
      const modalEl = document.getElementById("pdfModal");

      if (!iframe || !modalEl) {
        showCopyToast("PDF guardado, pero falta el modal PDF en el HTML.");
        return;
      }

      iframe.src = URL.createObjectURL(blob);
      bootstrap.Modal.getOrCreateInstance(modalEl).show();

      showCopyToast("PDF listo.");
    } catch (err) {
      console.error(err);
      showCopyToast("Error al guardar/mostrar el PDF.");
    }
  });
}

function initRutAutocompleteUI() {
  // =========================================
  // Helpers internos (comentarios en español)
  // =========================================

  const formEl = document.getElementById("form-uap");

  function showToast(message) {
    // Toast reutilizando la clase existente "toast-copiar"
    const toast = document.createElement("div");
    toast.className = "toast-copiar show";
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function setFormBlocked(isBlocked) {
    // Bloquea/desbloquea todos los campos del formulario durante la búsqueda
    if (!formEl) return;

    formEl.querySelectorAll("input, select, textarea, button").forEach((el) => {
      // Permitimos que el usuario pueda volver a editar el RUN/DV cuando termine la búsqueda
      el.disabled = isBlocked;
    });
  }

  function getRutPartsFromUI(hiddenRutInput) {
    // hiddenRutInput = input original name="*_rut" (se mantiene como fuente de verdad para guardar)
    const baseId = hiddenRutInput.id;
    const bodyInput = document.getElementById(`${baseId}_body`);
    const dvInput = document.getElementById(`${baseId}_dv`);

    const body = (bodyInput?.value || "").replace(/[^0-9]/g, "");
    const dv = (dvInput?.value || "").replace(/[^0-9kK]/g, "").toUpperCase();

    return { body, dv };
  }

  function setHiddenRutValue(hiddenRutInput) {
    const { body, dv } = getRutPartsFromUI(hiddenRutInput);
    // Guardamos con guion para que validateRut / cleanRut funcionen igual
    hiddenRutInput.value = body && dv ? `${body}-${dv}` : body;
  }

  function applyAutocompleteDataToForm(result, prefix) {
    // Carga automática: copia todas las keys que empiecen con "prefix_"
    // Ej: applicant_name -> input/select/textarea [name="applicant_name"]
    if (!result || !prefix) return;

    Object.entries(result).forEach(([key, value]) => {
      if (!key.startsWith(`${prefix}_`)) return;

      const field = formEl?.querySelector(`[name="${key}"]`);
      if (!field) return;

      field.value = value ?? "";
      // Dispara change para selects (por si en el futuro hay lógica atada)
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  async function searchByRutFromDvTab(hiddenRutInput) {
    // Actualiza el valor oculto antes de validar/buscar
    setHiddenRutValue(hiddenRutInput);

    if (!validateRut(hiddenRutInput.value)) {
      showToast("RUN inválido. Verifique el número y dígito verificador.");
      return;
    }

    setFormBlocked(true);

    try {
      const result = await autocompletePerson(hiddenRutInput.value);

      if (!result) {
        showToast("El RUN ingresado no fue encontrado en los registros.");
        return;
      }

      // Detecta prefijo según name/id: applicant_rut -> applicant
      const prefix = (hiddenRutInput.name || hiddenRutInput.id || "").split(
        "_rut",
      )[0];

      applyAutocompleteDataToForm(result, prefix);
    } catch (err) {
      console.error(err);
      showToast("Ocurrió un error al buscar el RUN. Intente nuevamente.");
    } finally {
      // Siempre se desbloquea para que el usuario pueda seguir sin problema
      setFormBlocked(false);
    }
  }

  function ensureRutSplitUI(rutInput) {
    // Transforma el input existente (name="*_rut") en:
    // - hidden: mantiene name/id original para guardado y validación
    // - visible body + visible dv: para el usuario
    if (!rutInput || rutInput.dataset.rutSplitDone === "1") return;

    // 1) Eliminar botón buscar rut asociado (si existe en el mismo contenedor)
    const wrapper = rutInput.closest(".d-flex");
    if (wrapper) {
      wrapper
        .querySelectorAll(".btn-search-rut")
        .forEach((btn) => btn.remove());
    }

    // 2) Crear input oculto que conserva el name/id original
    rutInput.type = "hidden";
    rutInput.dataset.rutSplitDone = "1";

    const baseId = rutInput.id;

    // 3) Crear UI visible: cuerpo + DV
    const bodyInput = document.createElement("input");
    bodyInput.type = "text";
    bodyInput.className = "form-control rut-field";
    bodyInput.id = `${baseId}_body`;
    bodyInput.autocomplete = "off";
    bodyInput.inputMode = "numeric";
    bodyInput.placeholder = "RUN";
    bodyInput.maxLength = 8;

    const dvInput = document.createElement("input");
    dvInput.type = "text";
    dvInput.className = "form-control";
    dvInput.id = `${baseId}_dv`;
    dvInput.autocomplete = "off";
    dvInput.placeholder = "DV";
    dvInput.maxLength = 1;
    dvInput.style.width = "70px";
    dvInput.style.maxWidth = "70px";
    dvInput.style.textAlign = "center";

    // 4) Si ya venía con valor (ej: loadTestData), lo dividimos
    const existing = cleanRut(rutInput.value || "");
    if (existing.length >= 2) {
      bodyInput.value = existing.slice(0, -1);
      dvInput.value = existing.slice(-1);
      setHiddenRutValue(rutInput);
    }

    // 5) Sanitización de entrada
    bodyInput.addEventListener("input", () => {
      bodyInput.value = bodyInput.value.replace(/[^0-9]/g, "").slice(0, 8);
      setHiddenRutValue(rutInput);
    });

    dvInput.addEventListener("input", () => {
      dvInput.value = dvInput.value
        .replace(/[^0-9kK]/g, "")
        .toUpperCase()
        .slice(0, 1);
      setHiddenRutValue(rutInput);
    });

    // 6) Evento clave: al presionar TAB en DV -> buscar
    dvInput.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        // No prevenimos el tab; solo disparamos la búsqueda y bloqueamos el form
        // El bloqueo ocurre inmediatamente en searchByRutFromDvTab
        void searchByRutFromDvTab(rutInput);
      }
    });

    // 7) Insertar en DOM (body + dv + hidden original)
    // Reutilizamos el mismo wrapper flex si existe; si no, lo creamos
    if (wrapper) {
      // Limpia por si habían nodos previos
      wrapper.innerHTML = "";
      wrapper.classList.add("gap-2");

      wrapper.appendChild(bodyInput);
      wrapper.appendChild(dvInput);
      wrapper.appendChild(rutInput);
    } else {
      // Fallback: insertar justo después del rutInput oculto
      rutInput.insertAdjacentElement("afterend", dvInput);
      rutInput.insertAdjacentElement("afterend", bodyInput);
    }
  }

  // =========================================
  // Inicialización: aplica a los 3 RUN del formulario
  // applicant_rut, victim_rut, accused_rut (existen en el HTML) :contentReference[oaicite:4]{index=4} :contentReference[oaicite:5]{index=5}
  // =========================================
  ["applicant_rut", "victim_rut", "accused_rut"].forEach((id) => {
    const rutInput = document.getElementById(id);
    if (rutInput) ensureRutSplitUI(rutInput);
  });

  // Por seguridad, elimina cualquier botón buscar rut que haya quedado
  document.querySelectorAll(".btn-search-rut").forEach((btn) => btn.remove());
}

function initAgeIndependentField() {
  // =========================================
  // Permite ingresar EDAD manual
  // o calcularla desde fecha de nacimiento
  // =========================================

  const birthdateInput = document.querySelector("[name='victim_birthdate']");
  const ageInput = document.querySelector("[name='victim_age']");

  if (!birthdateInput || !ageInput) return;

  // Permitir ingreso manual
  ageInput.removeAttribute("readonly");

  // Evitar listeners duplicados
  if (birthdateInput.dataset.ageIndependentBound === "1") return;
  birthdateInput.dataset.ageIndependentBound = "1";

  const syncAgeFromBirthdate = () => {
    if (!birthdateInput.value) return;
    const age = calculateAgeFromBirthdate(birthdateInput.value);
    if (age !== "") ageInput.value = age;
  };

  birthdateInput.addEventListener("input", syncAgeFromBirthdate);
  birthdateInput.addEventListener("change", syncAgeFromBirthdate);

  ageInput.addEventListener("input", () => {
    ageInput.value = ageInput.value.replace(/[^0-9]/g, "").slice(0, 3);
  });
}

function initVictimLifeStageAutoSelect() {
  // =========================================
  // Selección automática de "Etapa de vida"
  // según edad o fecha de nacimiento
  // =========================================

  const birthdateInput = document.querySelector("[name='victim_birthdate']");
  const ageInput = document.querySelector("[name='victim_age']");
  const lifeStageSelect = document.querySelector("[name='victim_life_stage']");

  if (!ageInput || !lifeStageSelect) return;

  function getAgeFromBirthdate(yyyyMmDd) {
    // Cálculo sin problemas de zona horaria
    const parts = (yyyyMmDd || "").split("-");
    if (parts.length !== 3) return null;

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (!year || !month || !day) return null;

    const birthDate = new Date(year, month - 1, day);
    if (isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();

    const hasHadBirthdayThisYear =
      today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() &&
        today.getDate() >= birthDate.getDate());

    if (!hasHadBirthdayThisYear) age--;

    return age >= 0 ? age : null;
  }

  function getLifeStageFromAge(age) {
    // Rangos ajustados: Adolescente = mayor de 14 y menor de 18 (14 a 17)
    if (age === null || age === undefined || age === "") return "";
    const n = Number(age);
    if (Number.isNaN(n) || n < 0) return "";

    if (n <= 13) return "Niñez"; // 0 a 13
    if (n >= 14 && n <= 17) return "Adolescente"; // 14 a 17
    if (n >= 18 && n <= 59) return "Adulto"; // 18 a 59
    return "Adulto mayor"; // 60+
  }

  function syncLifeStage() {
    // 1) Si hay edad, manda la edad
    const rawAge = (ageInput.value || "").trim();
    let age = rawAge !== "" ? Number(rawAge) : null;

    // 2) Si no hay edad, intenta con fecha nacimiento
    if ((age === null || Number.isNaN(age)) && birthdateInput?.value) {
      age = getAgeFromBirthdate(birthdateInput.value);
    }

    const lifeStage = getLifeStageFromAge(age);
    lifeStageSelect.value = lifeStage;

    // Dispara change por consistencia si luego hay lógica asociada
    lifeStageSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Sanitiza edad y sincroniza
  ageInput.addEventListener("input", () => {
    ageInput.value = ageInput.value.replace(/[^0-9]/g, "").slice(0, 3);
    syncLifeStage();
  });

  // Si cambian fecha nacimiento, sincroniza (y si tienes cálculo de edad, ambos convivirán bien)
  if (birthdateInput) {
    birthdateInput.addEventListener("input", syncLifeStage);
    birthdateInput.addEventListener("change", syncLifeStage);
  }

  // Ejecuta una vez al iniciar (por si hay test data o datos precargados)
  syncLifeStage();
}

/***************************************************
 * EVENTOS
 ***************************************************/
document.addEventListener("DOMContentLoaded", () => {
  initRutAutocompleteUI();
  initAgeIndependentField();
  initVictimLifeStageAutoSelect();
});

/***************************************************
 * DATOS DE PRUEBA
 ***************************************************/
function loadTestData() {
  // =========================================
  // Asegura que el formulario esté visible
  // =========================================
  if (typeof window.startProcedure === "function") {
    window.startProcedure("vif"); // puedes cambiar a "mp" si quieres probar ese flujo
  }

  /* ================= DENUNCIANTE ================= */
  // RUN separado (cuerpo + DV) y también el hidden original
  const applicantRutHidden = document.getElementById("applicant_rut");
  const applicantRutBody = document.getElementById("applicant_rut_body");
  const applicantRutDv = document.getElementById("applicant_rut_dv");
  const notificationMethodSelect = document.querySelector(
    "[name='notification_authorized_method']",
  );
  if (notificationMethodSelect) {
    notificationMethodSelect.value = "Correo electrónico";
    notificationMethodSelect.dispatchEvent(
      new Event("change", { bubbles: true }),
    );
  }

  if (applicantRutBody) applicantRutBody.value = "15711990";
  if (applicantRutDv) applicantRutDv.value = "7";
  if (applicantRutHidden) applicantRutHidden.value = "15711990-7";

  document.getElementById("applicant_name").value = "Juan Carlos Pérez Soto";
  document.querySelector("[name='applicant_phone']").value = "+56 9 1234 5678";
  document.querySelector("[name='applicant_email']").value =
    "juan.perez@correo.cl";
  document.querySelector("[name='applicant_address']").value =
    "Avenida Libertador Bernardo O’Higgins 1234, Santiago";
  document.querySelector("[name='applicant_activity']").value =
    "Trabajador/a dependiente";

  /* ================= VÍCTIMA ================= */
  const victimRutHidden = document.getElementById("victim_rut");
  const victimRutBody = document.getElementById("victim_rut_body");
  const victimRutDv = document.getElementById("victim_rut_dv");

  if (victimRutBody) victimRutBody.value = "19200572";
  if (victimRutDv) victimRutDv.value = "8";
  if (victimRutHidden) victimRutHidden.value = "19200572-8";

  document.getElementById("victim_name").value =
    "María Fernanda González Rojas";
  document.querySelector("[name='victim_birthdate']").value = "2010-05-14";
  document.querySelector("[name='victim_age']").value = "15"; // edad editable independiente
  document.querySelector("[name='victim_phone']").value = "+56 9 8765 4321";
  document.querySelector("[name='victim_email']").value = "victima@correo.cl";
  document.querySelector("[name='victim_address']").value =
    "Pasaje Los Aromos 456, Santiago";
  document.querySelector("[name='victim_activity']").value = "Estudiante";

  /* ================= DENUNCIADO ================= */
  const accusedRutHidden = document.getElementById("accused_rut");
  const accusedRutBody = document.getElementById("accused_rut_body");
  const accusedRutDv = document.getElementById("accused_rut_dv");

  if (accusedRutBody) accusedRutBody.value = "23328941";
  if (accusedRutDv) accusedRutDv.value = "8";
  if (accusedRutHidden) accusedRutHidden.value = "23328941-8";

  document.getElementById("accused_name").value =
    "Carlos Alberto Ramírez Muñoz";
  document.querySelector("[name='accused_phone']").value = "+56 9 1111 2222";
  document.querySelector("[name='accused_email']").value =
    "denunciado@correo.cl";
  document.querySelector("[name='accused_address']").value =
    "Calle Los Álamos 789, Santiago";
  document.querySelector("[name='accused_activity']").value =
    "Trabajador/a independiente";

  /* ================= PARENTESCO ================= */
  const relationshipSelect = document.querySelector("[name='relationship']");
  if (relationshipSelect) {
    relationshipSelect.value = "Padre";
    relationshipSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function loadTestDataMP() {
  // =========================================
  // Asegura que el formulario MP esté visible
  // =========================================
  if (typeof window.startProtectionMeasureProcedure === "function") {
    window.startProtectionMeasureProcedure();
  }

  /* ================= NNA ================= */
  document.querySelector("[name='mp_child_name']").value =
    "Benjamín Ignacio Soto López";
  document.querySelector("[name='mp_child_rut']").value = "21.345.678-9";
  document.querySelector("[name='mp_child_birthdate']").value = "2014-09-22";
  document.querySelector("[name='mp_child_age']").value = "10";
  document.querySelector("[name='mp_child_address']").value =
    "Pasaje Los Robles 321, Ancud";
  document.querySelector("[name='mp_child_phone']").value = "+56 9 5555 6666";
  document.querySelector("[name='mp_child_email']").value = "nna@correo.cl";

  const schoolingSelect = document.querySelector("[name='mp_child_schooling']");
  if (schoolingSelect) {
    schoolingSelect.value = "Básica completa";
    schoolingSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* ================= REQUIRIENTE #1 ================= */
  document.querySelector("[name='mp_requester_1_name']").value =
    "María José López Hernández";
  document.querySelector("[name='mp_requester_1_rut']").value = "15.234.987-6";
  document.querySelector("[name='mp_requester_1_address']").value =
    "Avenida Costanera 1020, Ancud";
  document.querySelector("[name='mp_requester_1_phone']").value =
    "+56 9 7777 8888";
  document.querySelector("[name='mp_requester_1_email']").value =
    "maria.lopez@correo.cl";

  const requester1Activity = document.querySelector(
    "[name='mp_requester_1_activity']",
  );
  if (requester1Activity) {
    requester1Activity.value = "Trabajador/a dependiente";
    requester1Activity.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const requester1Relationship = document.querySelector(
    "[name='mp_requester_1_relationship']",
  );
  if (requester1Relationship) {
    requester1Relationship.value = "Madre";
    requester1Relationship.dispatchEvent(
      new Event("change", { bubbles: true }),
    );
  }

  /* ================= REQUIRIENTE #2 ================= */
  if (typeof window.addProtectionMeasureRequester === "function") {
    window.addProtectionMeasureRequester();
  }

  document.querySelector("[name='mp_requester_2_name']").value =
    "Juan Pablo Soto López";
  document.querySelector("[name='mp_requester_2_rut']").value = "13.998.221-4";
  document.querySelector("[name='mp_requester_2_address']").value =
    "Pasaje Los Robles 321, Ancud";
  document.querySelector("[name='mp_requester_2_phone']").value =
    "+56 9 9999 0000";
  document.querySelector("[name='mp_requester_2_email']").value =
    "juan.soto@correo.cl";

  const requester2Activity = document.querySelector(
    "[name='mp_requester_2_activity']",
  );
  if (requester2Activity) {
    requester2Activity.value = "Trabajador/a independiente";
    requester2Activity.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const requester2Relationship = document.querySelector(
    "[name='mp_requester_2_relationship']",
  );
  if (requester2Relationship) {
    requester2Relationship.value = "Padre";
    requester2Relationship.dispatchEvent(
      new Event("change", { bubbles: true }),
    );
  }

  /* ================= SOLICITADO ================= */
  document.querySelector("[name='mp_requested_name']").value =
    "Carlos Andrés Muñoz Pérez";
  document.querySelector("[name='mp_requested_rut']").value = "18.456.321-2";
  document.querySelector("[name='mp_requested_address']").value =
    "Calle Prat 456, Ancud";
  document.querySelector("[name='mp_requested_phone']").value =
    "+56 9 2222 3333";
  document.querySelector("[name='mp_requested_email']").value =
    "solicitado@correo.cl";

  const requestedActivity = document.querySelector(
    "[name='mp_requested_activity']",
  );
  if (requestedActivity) {
    requestedActivity.value = "Cesante";
    requestedActivity.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const requestedRelationship = document.querySelector(
    "[name='mp_requested_relationship']",
  );
  if (requestedRelationship) {
    requestedRelationship.value = "Familiar";
    requestedRelationship.dispatchEvent(new Event("change", { bubbles: true }));
  }

  showCopyToast("Datos de prueba cargados para Medida de Protección.");
}

function goToStart() {
  // Ocultar formularios
  document.getElementById("form-uap")?.classList.add("d-none");
  document.getElementById("form-mp")?.classList.add("d-none");

  // Ocultar acciones
  document.getElementById("procedure-actions")?.classList.add("d-none");

  // Mostrar selección inicial
  document.getElementById("procedure-selection")?.classList.remove("d-none");

  // Reset estado
  formState.procedureType = null;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initActivitySelects() {
  convertActivityInputToSelect("applicant_activity");
  convertActivityInputToSelect("victim_activity");
  convertActivityInputToSelect("accused_activity");
}

function convertActivityInputToSelect(inputName) {
  const input = document.querySelector(`input[name="${inputName}"]`);
  if (!input) return;

  const select = document.createElement("select");
  select.className = input.className;
  select.name = input.name;

  ACTIVITY_OPTIONS.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });

  input.replaceWith(select);
}

/***************************************************
 * ACCIONES COMPARTIDAS (VIF / MP)
 ***************************************************/
function handleGoToStart() {
  goToStart();
}

function handleOpenClearFormModal() {
  openClearFormModal();
}

async function handleSaveRecord() {
  if (formState.procedureType === "mp") {
    await saveProtectionMeasureRecord();
    return;
  }
  await saveRecord();
}

async function handleGeneratePdfAndStore() {
  try {
    showCopyToast("Generando vista previa...");

    // 1) Generar PDF en memoria y mostrarlo inmediatamente
    const { blob, procedureType } = await previewPdfForCurrentProcedure();

    // Abrir modal con el Blob (no depende de guardar)
    const iframe = document.getElementById("pdf-preview");
    const modalEl = document.getElementById("pdfModal");

    if (!iframe || !modalEl) {
      showCopyToast("Falta el modal PDF en el HTML (pdfModal / pdf-preview).");
      return;
    }

    iframe.src = URL.createObjectURL(blob);
    bootstrap.Modal.getOrCreateInstance(modalEl).show();

    showCopyToast("Vista previa lista. Guardando registro...");

    // 2) Guardar datos y subir el PDF (después de mostrar)
    let recordId;
    if (procedureType === "mp") {
      recordId = await saveProtectionMeasureRecord();
    } else {
      recordId = await saveRecord();
    }

    showCopyToast("Guardando PDF...");

    const path = await uploadPdfToStorage(blob, recordId);

    await supabaseClient
      .from("uap_registros")
      .update({ pdf_path: path })
      .eq("id", recordId);

    showCopyToast("Registro y PDF guardados.");
  } catch (err) {
    console.error(err);
    showCopyToast("Error al generar/guardar el PDF.");
  }
}

async function previewPdfForCurrentProcedure() {
  const procedureType = formState.procedureType;

  if (!procedureType) {
    showCopyToast("Debe seleccionar un tipo de trámite.");
    throw new Error("procedureType null");
  }

  if (procedureType === "mp") {
    const docDefinition = buildMpDocDefinitionForPreview();
    const blob = await createPdfBlob(docDefinition);
    return { blob, procedureType };
  }

  // Default: VIF
  const docDefinition = buildVifDocDefinitionForPreview();
  const blob = await createPdfBlob(docDefinition);
  return { blob, procedureType };
}

function createPdfBlob(docDefinition) {
  return new Promise((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob((blob) => resolve(blob));
  });
}

function buildVifDocDefinitionForPreview() {
  const data = collectFormData();

  const nowText = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const conectaUrl = "https://conecta.pjud.cl/";

  function safeText(v) {
    const t = (v ?? "").toString().trim();
    return t.length ? t : " ";
  }

  function pick(prefix, map) {
    const obj = {};
    Object.entries(map).forEach(([label, key]) => {
      obj[label] = safeText(data[`${prefix}_${key}`]);
    });
    return obj;
  }

  const applicantTableObj = pick("applicant", {
    "Nombre completo": "name",
    RUN: "rut",
    Teléfono: "phone",
    "Correo electrónico": "email",
    Domicilio: "address",
    Actividad: "activity",
  });

  const victimTableObj = pick("victim", {
    "Nombre completo": "name",
    RUN: "rut",
    "Fecha de nacimiento": "birthdate",
    Edad: "age",
    Teléfono: "phone",
    "Correo electrónico": "email",
    Domicilio: "address",
    Actividad: "activity",
  });

  const accusedTableObj = {
    ...pick("accused", {
      "Nombre completo": "name",
      RUN: "rut",
      Teléfono: "phone",
      "Correo electrónico": "email",
      Domicilio: "address",
      Actividad: "activity",
    }),
    "Vínculo / parentesco": safeText(data.relationship),
  };

  return {
    pageMargins: [40, 90, 40, 95],
    header: function () {
      return {
        margin: [40, 18, 40, 0],
        columns: [
          { width: "*", text: "" },
          {
            width: "auto",
            stack: [
              // ✅ logo más grande y a la derecha
              { image: PJUD_LOGO_BASE64, width: 160, alignment: "right" },
              {
                text: "PODER JUDICIAL",
                bold: true,
                fontSize: 10,
                alignment: "right",
                margin: [0, 4, 0, 0],
              },
              { text: "Conecta PJUD", fontSize: 8, alignment: "right" },
            ],
            alignment: "right",
          },
        ],
      };
    },
    footer: function (currentPage, pageCount) {
      return {
        margin: [40, 0, 40, 25],
        columns: [
          {
            width: "*",
            stack: [
              {
                text: "Pudeto 201, Ancud, Chiloé",
                fontSize: 8,
                margin: [0, 0, 0, 1],
              },
              {
                text: "Fono: (65) 262 6424 / Anexo 100",
                fontSize: 8,
                margin: [0, 0, 0, 1],
              },
              {
                text: "E-mail: jfancud@pjud.cl",
                fontSize: 8,
                margin: [0, 0, 0, 1],
              },
              { text: "www.pjud.cl", fontSize: 9, margin: [0, 0, 0, 4] },
              {
                text: `Fecha y hora: ${nowText}`,
                fontSize: 8,
                margin: [0, 0, 0, 0],
              },
              ...(pageCount > 1
                ? [
                    {
                      text: `Página ${currentPage} de ${pageCount}`,
                      fontSize: 8,
                      margin: [0, 2, 0, 0],
                    },
                  ]
                : []),
            ],
          },
          {
            stack: [
              { qr: conectaUrl, fit: 50, alignment: "right" },
              {
                text: "Conecta PJUD",
                fontSize: 7,
                alignment: "right",
                margin: [0, 2, 0, 0],
              },
            ],
            alignment: "right",
          },
        ],
      };
    },
    content: [
      {
        text: "DENUNCIA VIOLENCIA INTRAFAMILIAR (UAP)",
        alignment: "center",
        bold: true,
        margin: [0, 35, 0, 18],
      },
      buildPersonTable("DATOS DEL DENUNCIANTE", applicantTableObj),
      buildPersonTable("DATOS DE LA VÍCTIMA", victimTableObj),
      buildPersonTable("DATOS DEL DENUNCIADO", accusedTableObj),
      {
        margin: [0, 45, 0, 0],
        columns: [
          {
            width: "50%",
            stack: [
              { text: "_______________________________", alignment: "center" },
              {
                text: "Denunciante",
                bold: true,
                alignment: "center",
                margin: [0, 6, 0, 0],
              },
            ],
          },
          {
            width: "50%",
            stack: [
              { text: "_______________________________", alignment: "center" },
              {
                text: "Funcionario/a que ingresa",
                bold: true,
                alignment: "center",
                margin: [0, 6, 0, 0],
              },
            ],
          },
        ],
      },
    ],
    defaultStyle: { fontSize: 12 },
  };
}

function buildMpDocDefinitionForPreview() {
  const data = collectMpFormData();

  const nowText = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const conectaUrl = "https://conecta.pjud.cl/";

  // Requirentes desde DOM
  const requesterCards = Array.from(
    document.querySelectorAll("#mp-requesters .mp-requester"),
  );
  const requestersTables = [];

  requesterCards.forEach((card, i) => {
    const idx = card.getAttribute("data-requester-index");

    // Tabla del requirente
    requestersTables.push(
      buildPersonTable(`REQUERENTE #${i + 1}`, {
        Nombre: data[`mp_requester_${idx}_name`] || " ",
        RUN: data[`mp_requester_${idx}_rut`] || " ",
        Domicilio: data[`mp_requester_${idx}_address`] || " ",
        Teléfono: data[`mp_requester_${idx}_phone`] || " ",
        "E-mail": data[`mp_requester_${idx}_email`] || " ",
        Actividad: data[`mp_requester_${idx}_activity`] || " ",
        "Vínculo con NNA": data[`mp_requester_${idx}_relationship`] || " ",
      }),
    );

    // ✅ Salto de línea SOLO si existe más de un requirente
    // y justo después del requirente #2
    if (requesterCards.length > 1 && i === 1) {
      requestersTables.push({
        text: " ",
        margin: [0, 12, 0, 12],
      });
    }
  });

  return {
    pageMargins: [40, 90, 40, 95],
    header: function () {
      return {
        margin: [40, 18, 40, 0],
        columns: [
          {
            width: 90,
            stack: [
              { qr: conectaUrl, fit: 60, alignment: "left" },
              {
                text: "Conecta PJUD",
                fontSize: 7,
                alignment: "left",
                margin: [0, 2, 0, 0],
              },
            ],
          },
          { width: "*", text: " " },
          {
            width: 160,
            stack: [
              { image: PJUD_LOGO_BASE64, width: 130, alignment: "right" },
            ],
          },
        ],
      };
    },

    footer: function (currentPage, pageCount) {
      return {
        margin: [40, 0, 40, 25],
        columns: [
          {
            width: "*",
            stack: [
              {
                // -------- Línea 1 --------
                columns: [
                  { text: "Pudeto 201, Ancud, Chiloé", fontSize: 9 },
                  { text: " · Fono: (65) 262 6424 / Anexo 100", fontSize: 9 },
                  { text: " · E-mail: jfancud@pjud.cl", fontSize: 9 },
                ],
                columnGap: 0,
              },
              {
                // -------- Línea 2 --------
                columns: [
                  { text: "www.pjud.cl", fontSize: 9 },
                  { text: ` · Fecha y hora: ${nowText}`, fontSize: 8 },
                  ...(pageCount > 1
                    ? [
                        {
                          text: ` · Página ${currentPage} de ${pageCount}`,
                          fontSize: 8,
                        },
                      ]
                    : []),
                ],
                columnGap: 0,
                margin: [0, 2, 0, 0],
              },
            ],
          },
        ],
      };
    },
    content: [
      {
        text: "MEDIDA DE PROTECCIÓN",
        alignment: "center",
        bold: true,
        margin: [0, 35, 0, 18],
      },

      buildPersonTable("NNA", {
        Nombre: data.mp_child_name || " ",
        RUN: data.mp_child_rut || " ",
        "Fecha nacimiento": data.mp_child_birthdate || " ",
        Edad: data.mp_child_age || " ",
        Domicilio: data.mp_child_address || " ",
        Teléfono: data.mp_child_phone || " ",
        "E-mail": data.mp_child_email || " ",
        Escolaridad: data.mp_child_schooling || " ",
      }),

      { text: "REQUERENTE(S)", bold: true, margin: [0, 10, 0, 5] },
      ...requestersTables,

      buildPersonTable("SOLICITADO", {
        Nombre: data.mp_requested_name || " ",
        RUN: data.mp_requested_rut || " ",
        Domicilio: data.mp_requested_address || " ",
        Teléfono: data.mp_requested_phone || " ",
        "E-mail": data.mp_requested_email || " ",
        Actividad: data.mp_requested_activity || " ",
        "Vínculo con NNA": data.mp_requested_relationship || " ",
      }),

      {
        margin: [0, 45, 0, 0],
        columns: [
          {
            width: "50%",
            stack: [
              { text: "_______________________________", alignment: "center" },
              {
                text: "Denunciante",
                bold: true,
                alignment: "center",
                margin: [0, 6, 0, 0],
              },
            ],
          },
          {
            width: "50%",
            stack: [
              { text: "_______________________________", alignment: "center" },
              {
                text: "Funcionario/a que ingresa",
                bold: true,
                alignment: "center",
                margin: [0, 6, 0, 0],
              },
            ],
          },
        ],
      },
    ],
    defaultStyle: { fontSize: 12 },
  };
}

function calculateAgeFromBirthdate(isoDate) {
  // Calcula edad (comentarios en español)
  if (!isoDate) return "";

  const birthDate = new Date(isoDate);
  if (Number.isNaN(birthDate.getTime())) return "";

  const todayDate = new Date();
  let age = todayDate.getFullYear() - birthDate.getFullYear();

  const monthDiff = todayDate.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && todayDate.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age < 0 ? "" : String(age);
}

/***************************************************
 * UTILIDAD: EDAD AUTOMÁTICA POR FECHA (REUTILIZABLE)
 ***************************************************/
function bindBirthdateToAge(formId, birthdateName, ageName) {
  const form = document.getElementById(formId);
  if (!form) return;

  const birthdateEl = form.querySelector(`[name="${birthdateName}"]`);
  const ageEl = form.querySelector(`[name="${ageName}"]`);

  if (!birthdateEl || !ageEl) return;

  // Evitar duplicados
  const key = `bind_${birthdateName}_${ageName}`;
  if (birthdateEl.dataset[key] === "1") return;
  birthdateEl.dataset[key] = "1";

  const syncAge = () => {
    ageEl.value = calculateAgeFromBirthdate(birthdateEl.value);
  };

  // ✅ input + change para compatibilidad
  birthdateEl.addEventListener("input", syncAge);
  birthdateEl.addEventListener("change", syncAge);
}

/***************************************************
 * MP: MOSTRAR FORMULARIO (SOLO AL PRESIONAR BOTÓN MP)
 ***************************************************/
function startProtectionMeasureProcedure() {
  formState.procedureType = "mp";

  // Ocultar selector
  document.getElementById("procedure-selection")?.classList.add("d-none");

  // Mostrar solo MP
  document.getElementById("form-uap")?.classList.add("d-none");
  document.getElementById("form-mp")?.classList.remove("d-none");

  // Mostrar acciones compartidas
  document.getElementById("procedure-actions")?.classList.remove("d-none");

  initProtectionMeasureForm();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/***************************************************
 * MP: REQUIRENTES (+ agregar otro requirente)
 ***************************************************/
let mpRequesterCount = 1;

function initProtectionMeasureForm() {
  const form = document.getElementById("form-mp");
  if (!form) return;

  // Evitar listeners duplicados
  if (form.dataset.initialized === "1") return;
  form.dataset.initialized = "1";

  // Edad automática MP
  bindBirthdateToAge("form-mp", "mp_child_birthdate", "mp_child_age");

  // Delegación para “Quitar” requirente
  const container = document.getElementById("mp-requesters");
  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest('button[data-action="remove-requester"]');
      if (!btn) return;

      const card = btn.closest(".mp-requester");
      if (!card) return;

      card.remove();
      showCopyToast("Requirente eliminado");
      renumberProtectionRequesters();
      updateMpRequesterCountFromDom();
    });
  }

  // Estado inicial
  renumberProtectionRequesters();
}

function addProtectionMeasureRequester() {
  const container = document.getElementById("mp-requesters");
  if (!container) {
    showCopyToast("No se encontró el contenedor de requirentes.");
    return;
  }

  mpRequesterCount += 1;
  const index = mpRequesterCount;

  const card = document.createElement("div");
  card.className = "mp-requester border rounded-3 p-3 mb-3";
  card.setAttribute("data-requester-index", String(index));

  card.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <strong>Requirente #${index}</strong>
      <button type="button" class="btn btn-outline-danger btn-sm" data-action="remove-requester">
        <i class="bi bi-dash-circle"></i> Quitar
      </button>
    </div>

    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label">Nombre completo</label>
        <input class="form-control" name="mp_requester_${index}_name" autocomplete="off">
      </div>

      <div class="col-md-3">
        <label class="form-label">RUN</label>
        <input class="form-control" name="mp_requester_${index}_rut" autocomplete="off">
      </div>

      <div class="col-md-3">
        <label class="form-label">Actividad</label>
        <select class="form-select" name="mp_requester_${index}_activity">
          <option value="">Seleccione actividad</option>
          <option>Sin actividad</option>
          <option>Trabajador/a dependiente</option>
          <option>Trabajador/a independiente</option>
          <option>Dueña/o de casa</option>
          <option>Estudiante</option>
          <option>Cesante</option>
          <option>Jubilado/a</option>
          <option>Otra</option>
        </select>
      </div>

      <div class="col-md-9">
        <label class="form-label">Domicilio</label>
        <input class="form-control" name="mp_requester_${index}_address" autocomplete="off">
      </div>

      <div class="col-md-3">
        <label class="form-label">Teléfono</label>
        <input class="form-control" name="mp_requester_${index}_phone" autocomplete="off">
      </div>

      <div class="col-md-6">
        <label class="form-label">E-mail</label>
        <input class="form-control" type="email" name="mp_requester_${index}_email" autocomplete="off">
      </div>

      <div class="col-md-6">
        <label class="form-label">Vínculo / parentesco con el NNA</label>
        <select class="form-select" name="mp_requester_${index}_relationship">
          <option value="">Seleccione parentesco</option>
          <option>Padre</option>
          <option>Madre</option>
          <option>Hijo/a</option>
          <option>Cónyuge</option>
          <option>Conviviente</option>
          <option>Ex pareja</option>
          <option>Familiar</option>
          <option>Otro</option>
          <option>Desconocido</option>
        </select>
      </div>
    </div>
  `;

  container.appendChild(card);

  renumberProtectionRequesters();
  showCopyToast("Requirente agregado");
}

function renumberProtectionRequesters() {
  const cards = Array.from(
    document.querySelectorAll("#mp-requesters .mp-requester"),
  );
  cards.forEach((card, i) => {
    const title = card.querySelector("strong");
    if (title) title.textContent = `Requirente #${i + 1}`;

    const removeBtn = card.querySelector(
      'button[data-action="remove-requester"]',
    );
    if (removeBtn) {
      if (i === 0) removeBtn.classList.add("d-none");
      else removeBtn.classList.remove("d-none");
    }
  });
}

function updateMpRequesterCountFromDom() {
  const cards = Array.from(
    document.querySelectorAll("#mp-requesters .mp-requester"),
  );
  if (cards.length === 0) {
    mpRequesterCount = 1;
    return;
  }
  mpRequesterCount = cards.reduce((max, card) => {
    const idx = Number(card.getAttribute("data-requester-index") || "1");
    return Number.isNaN(idx) ? max : Math.max(max, idx);
  }, 1);
}

function clearProtectionMeasureForm() {
  const form = document.getElementById("form-mp");
  if (!form) return;

  form.querySelectorAll("input, select, textarea").forEach((el) => {
    el.value = "";
  });

  const container = document.getElementById("mp-requesters");
  if (container) {
    const cards = Array.from(container.querySelectorAll(".mp-requester"));
    cards.forEach((card, i) => {
      if (i === 0) {
        card
          .querySelectorAll("input, select, textarea")
          .forEach((el) => (el.value = ""));
      } else {
        card.remove();
      }
    });
  }

  mpRequesterCount = 1;
  renumberProtectionRequesters();
}

/***************************************************
 * MP: DATA / GUARDAR / PDF (MISMO MODAL PDF QUE VIF)
 ***************************************************/
function collectMpFormData() {
  const data = {};
  document
    .querySelectorAll("#form-mp input, #form-mp select, #form-mp textarea")
    .forEach((el) => {
      if (el.name) data[el.name] = el.value;
    });
  return data;
}

async function saveProtectionMeasureRecord() {
  const { data, error } = await supabaseClient
    .from("uap_registros")
    .insert([
      {
        tipo_tramite: "mp",
        datos: collectMpFormData(),
        estado: "confirmado",
      },
    ])
    .select("id")
    .single();

  if (error) {
    showCopyToast("Error al guardar el registro MP.");
    throw error;
  }

  showCopyToast("Registro MP guardado correctamente.");
  return data.id;
}

async function generateProtectionMeasurePdfAndStore(recordId) {
  const data = collectMpFormData();
  const today = new Date().toLocaleDateString("es-CL");

  // Requirentes desde DOM
  const requesterCards = Array.from(
    document.querySelectorAll("#mp-requesters .mp-requester"),
  );
  const requesters = requesterCards.map((card, i) => {
    const idx = card.getAttribute("data-requester-index");
    return buildPersonTable(`REQUERENTE #${i + 1}`, {
      Nombre: data[`mp_requester_${idx}_name`] || "",
      RUN: data[`mp_requester_${idx}_rut`] || "",
      Domicilio: data[`mp_requester_${idx}_address`] || "",
      Teléfono: data[`mp_requester_${idx}_phone`] || "",
      "E-mail": data[`mp_requester_${idx}_email`] || "",
      Actividad: data[`mp_requester_${idx}_activity`] || "",
      "Vínculo con NNA": data[`mp_requester_${idx}_relationship`] || "",
    });
  });

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 60, 40, 60],
    images: { pjudLogo: PJUD_LOGO_BASE64 },
    header: {
      columns: [
        {},
        {
          stack: [
            { image: "pjudLogo", width: 80 },
            {
              text: "PODER JUDICIAL\nREPÚBLICA DE CHILE",
              fontSize: 9,
              alignment: "center",
            },
            {
              text: "JUZGADO DE FAMILIA DE ANCUD",
              fontSize: 8,
              alignment: "center",
            },
          ],
          alignment: "right",
        },
      ],
      margin: [40, 20, 40, 0],
    },
    content: [
      {
        text: "MEDIDA DE PROTECCIÓN",
        alignment: "center",
        bold: true,
        margin: [0, 20, 0, 10],
      },
      { text: `FECHA: ${today}`, alignment: "center", margin: [0, 0, 0, 10] },

      buildPersonTable("NNA", {
        Nombre: data.mp_child_name || "",
        RUN: data.mp_child_rut || "",
        "Fecha nacimiento": data.mp_child_birthdate || "",
        Edad: data.mp_child_age || "",
        Domicilio: data.mp_child_address || "",
        Teléfono: data.mp_child_phone || "",
        "E-mail": data.mp_child_email || "",
        Escolaridad: data.mp_child_schooling || "",
      }),

      { text: "REQUERENTE(S)", bold: true, margin: [0, 10, 0, 5] },
      ...requesters,

      buildPersonTable("SOLICITADO", {
        Nombre: data.mp_requested_name || "",
        RUN: data.mp_requested_rut || "",
        Domicilio: data.mp_requested_address || "",
        Teléfono: data.mp_requested_phone || "",
        "E-mail": data.mp_requested_email || "",
        Actividad: data.mp_requested_activity || "",
        "Vínculo con NNA": data.mp_requested_relationship || "",
      }),
    ],
    defaultStyle: { fontSize: 12 },
  };

  // Generar blob, subir, actualizar registro, mostrar modal
  pdfMake.createPdf(docDefinition).getBlob(async (blob) => {
    const path = await uploadPdfToStorage(blob, recordId);

    await supabaseClient
      .from("uap_registros")
      .update({ pdf_path: path })
      .eq("id", recordId);

    const iframe = document.getElementById("pdf-preview");
    if (iframe) iframe.src = URL.createObjectURL(blob);

    const modalEl = document.getElementById("pdfModal");
    if (modalEl) new bootstrap.Modal(modalEl).show();

    showCopyToast("PDF MP generado correctamente.");
  });
}

/***************************************************
 * TOAST GLOBAL (SIN ALERT NATIVO)
 ***************************************************/
function showCopyToast(message) {
  let toast = document.getElementById("global-toast");

  // Crear toast si no existe
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "global-toast";
    toast.className = "toast-copiar";

    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  // Ocultar automáticamente
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}
