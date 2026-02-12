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

  document.getElementById("procedure-selection")?.classList.add("d-none");
  document.getElementById("form-uap")?.classList.remove("d-none");
  document.getElementById("form-mp")?.classList.add("d-none");
  document.getElementById("procedure-actions")?.classList.remove("d-none");

  initActivitySelects();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startProtectionMeasureProcedure() {
  formState.procedureType = "mp";

  document.getElementById("procedure-selection")?.classList.add("d-none");
  document.getElementById("form-uap")?.classList.add("d-none");
  document.getElementById("form-mp")?.classList.remove("d-none");
  document.getElementById("procedure-actions")?.classList.remove("d-none");

  initProtectionMeasureForm();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/***************************************************
 * LIMPIAR / VOLVER
 ***************************************************/
function goToStart() {
  document.getElementById("form-uap")?.classList.add("d-none");
  document.getElementById("form-mp")?.classList.add("d-none");
  document.getElementById("procedure-actions")?.classList.add("d-none");
  document.getElementById("procedure-selection")?.classList.remove("d-none");

  formState.procedureType = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleGoToStart() {
  goToStart();
}

function openClearFormModal() {
  const modal = new bootstrap.Modal(document.getElementById("clearFormModal"));
  modal.show();
}

function handleOpenClearFormModal() {
  openClearFormModal();
}

function showClearToast() {
  showCopyToast("Formulario limpiado correctamente");
}

function confirmClearForm() {
  if (formState.procedureType === "mp") {
    clearProtectionMeasureForm();
  } else {
    document.getElementById("form-uap")?.reset();
    formState.status = "draft";
  }

  const modalEl = document.getElementById("clearFormModal");
  const instance = bootstrap.Modal.getInstance(modalEl);
  if (instance) instance.hide();

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

function collectMpFormData() {
  const data = {};
  document
    .querySelectorAll("#form-mp input, #form-mp select, #form-mp textarea")
    .forEach((el) => {
      if (el.name) data[el.name] = el.value;
    });
  return data;
}

/***************************************************
 * ACTIVIDAD -> SELECT
 ***************************************************/
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

  // Mantener valor si había uno
  const prev = input.value;

  ACTIVITY_OPTIONS.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });

  if (prev) select.value = prev;

  input.replaceWith(select);
}

/***************************************************
 * PDF MAKE HELPERS
 ***************************************************/
function buildPersonTable(title, fields) {
  const body = [[{ text: title, bold: true, colSpan: 2 }, {}]];
  Object.entries(fields).forEach(([k, v]) =>
    body.push([{ text: k, bold: true }, { text: v || " " }]),
  );

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

function createPdfBlob(docDefinition) {
  return new Promise((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob((blob) => resolve(blob));
  });
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

  const docDefinition = buildVifDocDefinitionForPreview();
  const blob = await createPdfBlob(docDefinition);
  return { blob, procedureType };
}

/***************************************************
 * VISTA PREVIA (SOLO SI EXISTE MODAL PDF EN HTML)
 ***************************************************/
async function handleGeneratePdfAndStore() {
  try {
    if (!formState.procedureType) {
      showCopyToast("Debe seleccionar un tipo de trámite.");
      return;
    }

    showCopyToast("Generando PDF...");

    const { blob } = await previewPdfForCurrentProcedure();

    const iframe = document.getElementById("pdf-preview");
    const modalEl = document.getElementById("pdfModal");

    // Si es mobile y no existe modal/iframe, no hacemos preview
    if (!iframe || !modalEl) {
      showCopyToast("PDF generado (sin vista previa en esta versión).");
      return;
    }

    iframe.src = URL.createObjectURL(blob);
    bootstrap.Modal.getOrCreateInstance(modalEl).show();

    showCopyToast("PDF listo.");
  } catch (err) {
    console.error(err);
    showCopyToast("Error al generar el PDF.");
  }
}

/***************************************************
 * DOC DEFINITIONS (VIF / MP)
 * - Mantengo tu estructura con logo base64 (PJUD_LOGO_BASE64)
 ***************************************************/
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

  const requesterCards = Array.from(
    document.querySelectorAll("#mp-requesters .mp-requester"),
  );
  const requestersTables = [];

  requesterCards.forEach((card, i) => {
    const idx = card.getAttribute("data-requester-index");

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

    if (requesterCards.length > 1 && i === 1) {
      requestersTables.push({ text: " ", margin: [0, 12, 0, 12] });
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
                columns: [
                  { text: "Pudeto 201, Ancud, Chiloé", fontSize: 9 },
                  { text: " · Fono: (65) 262 6424 / Anexo 100", fontSize: 9 },
                  { text: " · E-mail: jfancud@pjud.cl", fontSize: 9 },
                ],
                columnGap: 0,
              },
              {
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

/***************************************************
 * EDAD / ETAPA DE VIDA (VIF)
 ***************************************************/
function calculateAgeFromBirthdate(isoDate) {
  if (!isoDate) return "";
  const birthDate = new Date(isoDate);
  if (Number.isNaN(birthDate.getTime())) return "";

  const todayDate = new Date();
  let age = todayDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = todayDate.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && todayDate.getDate() < birthDate.getDate())
  )
    age -= 1;

  return age < 0 ? "" : String(age);
}

function initAgeIndependentField() {
  const birthdateInput = document.querySelector("[name='victim_birthdate']");
  const ageInput = document.querySelector("[name='victim_age']");
  if (!birthdateInput || !ageInput) return;

  ageInput.removeAttribute("readonly");

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
  const birthdateInput = document.querySelector("[name='victim_birthdate']");
  const ageInput = document.querySelector("[name='victim_age']");
  const lifeStageSelect = document.querySelector("[name='victim_life_stage']");
  if (!ageInput || !lifeStageSelect) return;

  function getAgeFromBirthdate(yyyyMmDd) {
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
    if (age === null || age === undefined || age === "") return "";
    const n = Number(age);
    if (Number.isNaN(n) || n < 0) return "";
    if (n <= 13) return "Niñez";
    if (n >= 14 && n <= 17) return "Adolescente";
    if (n >= 18 && n <= 59) return "Adulto";
    return "Adulto mayor";
  }

  function syncLifeStage() {
    const rawAge = (ageInput.value || "").trim();
    let age = rawAge !== "" ? Number(rawAge) : null;

    if ((age === null || Number.isNaN(age)) && birthdateInput?.value) {
      age = getAgeFromBirthdate(birthdateInput.value);
    }

    const lifeStage = getLifeStageFromAge(age);
    lifeStageSelect.value = lifeStage;
    lifeStageSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  ageInput.addEventListener("input", () => {
    ageInput.value = ageInput.value.replace(/[^0-9]/g, "").slice(0, 3);
    syncLifeStage();
  });

  if (birthdateInput) {
    birthdateInput.addEventListener("input", syncLifeStage);
    birthdateInput.addEventListener("change", syncLifeStage);
  }

  syncLifeStage();
}

/***************************************************
 * MP: REQUIRENTES (dinámico)
 ***************************************************/
let mpRequesterCount = 1;

function bindBirthdateToAge(formId, birthdateName, ageName) {
  const form = document.getElementById(formId);
  if (!form) return;

  const birthdateEl = form.querySelector(`[name="${birthdateName}"]`);
  const ageEl = form.querySelector(`[name="${ageName}"]`);
  if (!birthdateEl || !ageEl) return;

  const key = `bind_${birthdateName}_${ageName}`;
  if (birthdateEl.dataset[key] === "1") return;
  birthdateEl.dataset[key] = "1";

  const syncAge = () => {
    ageEl.value = calculateAgeFromBirthdate(birthdateEl.value);
  };

  birthdateEl.addEventListener("input", syncAge);
  birthdateEl.addEventListener("change", syncAge);
}

function initProtectionMeasureForm() {
  const form = document.getElementById("form-mp");
  if (!form) return;

  if (form.dataset.initialized === "1") return;
  form.dataset.initialized = "1";

  bindBirthdateToAge("form-mp", "mp_child_birthdate", "mp_child_age");

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

    <div class="row g-2">
      <div class="col-12">
        <label class="form-label">Nombre completo</label>
        <input class="form-control" name="mp_requester_${index}_name" autocomplete="off" />
      </div>

      <div class="col-12">
        <label class="form-label">RUN</label>
        <input class="form-control" name="mp_requester_${index}_rut" autocomplete="off" />
      </div>

      <div class="col-12">
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

      <div class="col-12">
        <label class="form-label">Domicilio</label>
        <input class="form-control" name="mp_requester_${index}_address" autocomplete="off" />
      </div>

      <div class="col-12">
        <label class="form-label">Teléfono</label>
        <input class="form-control" name="mp_requester_${index}_phone" autocomplete="off" />
      </div>

      <div class="col-12">
        <label class="form-label">E-mail</label>
        <input class="form-control" type="email" name="mp_requester_${index}_email" autocomplete="off" />
      </div>

      <div class="col-12">
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

  form
    .querySelectorAll("input, select, textarea")
    .forEach((el) => (el.value = ""));

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
 * DATOS DE PRUEBA (ESCRITORIO)
 ***************************************************/
function loadTestData() {
  if (typeof window.startProcedure === "function") window.startProcedure("vif");

  // Denunciante
  document.getElementById("applicant_rut").value = "15711990-7";
  document.getElementById("applicant_name").value = "Juan Carlos Pérez Soto";
  document.querySelector("[name='applicant_phone']").value = "+56 9 1234 5678";
  document.querySelector("[name='applicant_email']").value =
    "juan.perez@correo.cl";
  document.querySelector("[name='applicant_address']").value =
    "Avenida Libertador Bernardo O’Higgins 1234, Santiago";
  document.querySelector("[name='notification_authorized_method']").value =
    "Correo electrónico";

  // Victima
  document.getElementById("victim_rut").value = "19200572-8";
  document.getElementById("victim_name").value =
    "María Fernanda González Rojas";
  document.querySelector("[name='victim_birthdate']").value = "2010-05-14";
  document.querySelector("[name='victim_age']").value = "15";
  document.querySelector("[name='victim_phone']").value = "+56 9 8765 4321";
  document.querySelector("[name='victim_email']").value = "victima@correo.cl";
  document.querySelector("[name='victim_address']").value =
    "Pasaje Los Aromos 456, Santiago";

  // Denunciado
  document.getElementById("accused_rut").value = "23328941-8";
  document.getElementById("accused_name").value =
    "Carlos Alberto Ramírez Muñoz";
  document.querySelector("[name='accused_phone']").value = "+56 9 1111 2222";
  document.querySelector("[name='accused_email']").value =
    "denunciado@correo.cl";
  document.querySelector("[name='accused_address']").value =
    "Calle Los Álamos 789, Santiago";
  document.querySelector("[name='relationship']").value = "Padre";

  showCopyToast("Datos de prueba cargados.");
}

function loadTestDataMP() {
  if (typeof window.startProtectionMeasureProcedure === "function")
    window.startProtectionMeasureProcedure();

  document.querySelector("[name='mp_child_name']").value =
    "Benjamín Ignacio Soto López";
  document.querySelector("[name='mp_child_rut']").value = "21.345.678-9";
  document.querySelector("[name='mp_child_birthdate']").value = "2014-09-22";
  document.querySelector("[name='mp_child_age']").value = "10";
  document.querySelector("[name='mp_child_address']").value =
    "Pasaje Los Robles 321, Ancud";
  document.querySelector("[name='mp_child_phone']").value = "+56 9 5555 6666";
  document.querySelector("[name='mp_child_email']").value = "nna@correo.cl";
  document.querySelector("[name='mp_child_schooling']").value =
    "Básica completa";

  // Requirente #1
  document.querySelector("[name='mp_requester_1_name']").value =
    "María José López Hernández";
  document.querySelector("[name='mp_requester_1_rut']").value = "15.234.987-6";
  document.querySelector("[name='mp_requester_1_address']").value =
    "Avenida Costanera 1020, Ancud";
  document.querySelector("[name='mp_requester_1_phone']").value =
    "+56 9 7777 8888";
  document.querySelector("[name='mp_requester_1_email']").value =
    "maria.lopez@correo.cl";
  document.querySelector("[name='mp_requester_1_activity']").value =
    "Trabajador/a dependiente";
  document.querySelector("[name='mp_requester_1_relationship']").value =
    "Madre";

  // Segundo requirente
  if (typeof window.addProtectionMeasureRequester === "function")
    window.addProtectionMeasureRequester();

  document.querySelector("[name='mp_requester_2_name']").value =
    "Juan Pablo Soto López";
  document.querySelector("[name='mp_requester_2_rut']").value = "13.998.221-4";
  document.querySelector("[name='mp_requester_2_address']").value =
    "Pasaje Los Robles 321, Ancud";
  document.querySelector("[name='mp_requester_2_phone']").value =
    "+56 9 9999 0000";
  document.querySelector("[name='mp_requester_2_email']").value =
    "juan.soto@correo.cl";
  document.querySelector("[name='mp_requester_2_activity']").value =
    "Trabajador/a independiente";
  document.querySelector("[name='mp_requester_2_relationship']").value =
    "Padre";

  // Solicitado
  document.querySelector("[name='mp_requested_name']").value =
    "Carlos Andrés Muñoz Pérez";
  document.querySelector("[name='mp_requested_rut']").value = "18.456.321-2";
  document.querySelector("[name='mp_requested_address']").value =
    "Calle Prat 456, Ancud";
  document.querySelector("[name='mp_requested_phone']").value =
    "+56 9 2222 3333";
  document.querySelector("[name='mp_requested_email']").value =
    "solicitado@correo.cl";
  document.querySelector("[name='mp_requested_activity']").value = "Cesante";
  document.querySelector("[name='mp_requested_relationship']").value =
    "Familiar";

  showCopyToast("Datos de prueba cargados para Medida de Protección.");
}

/***************************************************
 * TOAST GLOBAL
 ***************************************************/
function showCopyToast(message) {
  let toast = document.getElementById("global-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "global-toast";
    toast.className = "toast-copiar";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

/***************************************************
 * INIT
 ***************************************************/
document.addEventListener("DOMContentLoaded", () => {
  initAgeIndependentField();
  initVictimLifeStageAutoSelect();
});
