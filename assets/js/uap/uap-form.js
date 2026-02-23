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
  //variables/funciones en inglés
  formState.procedureType = type;

  // Ocultar selector y todos los formularios
  document.getElementById("procedure-selection")?.classList.add("d-none");
  hideAllProcedureForms();

  // Mostrar el formulario según trámite
  const formId = getFormIdByProcedure(type);
  const formEl = formId ? document.getElementById(formId) : null;

  if (!formEl) {
    showCopyToast("No se encontró el formulario del trámite seleccionado.");
    goToStart();
    return;
  }

  formEl.classList.remove("d-none");
  document.getElementById("procedure-actions")?.classList.remove("d-none");

  // Inicializaciones específicas
  if (type === "vif") {
    initActivitySelects();
  }

  if (type === "mp") {
    initProtectionMeasureForm();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startProtectionMeasureProcedure() {
  startProcedure("mp");
}

/***************************************************
 * LIMPIAR / VOLVER
 ***************************************************/
function goToStart() {
  hideAllProcedureForms();
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
  const type = formState.procedureType;

  if (type === "mp") {
    clearProtectionMeasureForm();
  } else {
    const formId = getFormIdByProcedure(type);
    const formEl = formId ? document.getElementById(formId) : null;

    if (formEl && typeof formEl.reset === "function") {
      formEl.reset();
    }

    formState.status = "draft";
  }

  const modalEl = document.getElementById("clearFormModal");
  const instance = bootstrap.Modal.getInstance(modalEl);
  if (instance) instance.hide();

  showCopyToast("Formulario limpiado correctamente");
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

function collectCurrentFormData() {
  const type = formState.procedureType;
  const formId = getFormIdByProcedure(type);
  const formEl = formId ? document.getElementById(formId) : null;

  if (!formEl) return {};

  const data = {};
  formEl.querySelectorAll("input, select, textarea").forEach((el) => {
    if (!el.name) return;

    //manejo de checkbox/radio
    if (el.type === "checkbox") {
      data[el.name] = el.checked ? "Sí" : "No";
      return;
    }

    if (el.type === "radio") {
      if (el.checked) data[el.name] = el.value;
      return;
    }

    data[el.name] = el.value;
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

function getChildCategoryFromAge(age) {
  const n = Number(age);
  if (Number.isNaN(n) || n < 0) return "";
  if (n <= 13) return "Niño/Niña";
  if (n <= 17) return "Adolescente";
  return "Adulto";
}

function syncMpChildCategory(idx) {
  const ageEl = document.querySelector(`[name="mp_child_${idx}_age"]`);
  const catEl = document.querySelector(`[name="mp_child_${idx}_category"]`);
  if (!ageEl || !catEl) return;
  catEl.value = getChildCategoryFromAge(ageEl.value);
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

/***************************************************
 * ENVÍO DE COPIA POR CORREO (PDF)
 * - Sin alert nativo: solo toast
 * - Usa Edge Function de Supabase (Resend u otro)
 ***************************************************/

// Cambia este nombre si tu Edge Function se llama diferente
const MAIL_FUNCTION_NAME = "send-uap-pdf";
const TRIBUNAL_EMAIL_TO = "jfancud@pjud.cl.invalid"; // Correo institucional fijo del tribunal (TO para VIF/MP)

function getEmailTargetsForCurrentProcedure() {
  // Comentarios en español; variables/funciones en inglés
  const type = formState.procedureType;

  const trimValue = (selector) =>
    (document.querySelector(selector)?.value || "").trim();

  // =========================
  // VIF: TO tribunal + CC denunciante (correo del formulario)
  // =========================
  if (type === "vif") {
    const userEmail = trimValue('[name="applicant_email"]');
    return {
      to: TRIBUNAL_EMAIL_TO,
      cc: userEmail ? [userEmail] : [],
    };
  }

  // =========================
  // MP: TO tribunal + CC requirente #1 (correo del formulario)
  // =========================
  if (type === "mp") {
    const userEmail = trimValue('[name="mp_requester_1_email"]');
    return {
      to: TRIBUNAL_EMAIL_TO,
      cc: userEmail ? [userEmail] : [],
    };
  }

  // =========================
  // OTROS FORMULARIOS: TO correo personal (sin tribunal)
  // =========================
  const map = {
    "request-indicates": "req_email",
    "answer-transfer": "at_email",
    "comply-ordered": "co_email",
    "set-aside": "se_email",
    "visits-noncompliance": "iv_req_email",
    "sworn-statement": "dj_email",
  };

  const emailName = map[type];
  if (!emailName) return { to: "", cc: [] };

  const personalEmail = trimValue(`[name="${emailName}"]`);
  return { to: personalEmail, cc: [] };
}

function buildEmailMetaForCurrentProcedure() {
  // variables/funciones en inglés
  const type = formState.procedureType;

  // Fecha corta para nombre de archivo
  const dateStamp = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "")
    .replaceAll("/", "");

  const defaultMeta = {
    documentLabel: "UAP",
    subject: "Copia de documento generado (UAP)",
    fileName: `uap_documento_${dateStamp}.pdf`,
  };

  const metaMap = {
    vif: {
      documentLabel: "Denuncia VIF (UAP)",
      subject: "Copia PDF - Denuncia Violencia Intrafamiliar (UAP)",
      fileName: `uap_vif_${dateStamp}.pdf`,
    },
    mp: {
      documentLabel: "Medida de Protección (UAP)",
      subject: "Copia PDF - Medida de Protección (UAP)",
      fileName: `uap_mp_${dateStamp}.pdf`,
    },
    "request-indicates": {
      documentLabel: "Solicitud que indica",
      subject: "Copia PDF - Solicitud que indica",
      fileName: `solicitud_que_indica_${dateStamp}.pdf`,
    },
    "answer-transfer": {
      documentLabel: "Contesta Traslado",
      subject: "Copia PDF - Contesta Traslado",
      fileName: `contesta_traslado_${dateStamp}.pdf`,
    },
    "comply-ordered": {
      documentLabel: "Cumple lo Ordenado",
      subject: "Copia PDF - Cumple lo Ordenado",
      fileName: `cumple_lo_ordenado_${dateStamp}.pdf`,
    },
    "set-aside": {
      documentLabel: "Deje sin Efecto",
      subject: "Copia PDF - Deje sin Efecto",
      fileName: `deje_sin_efecto_${dateStamp}.pdf`,
    },
    "visits-noncompliance": {
      documentLabel: "Incumplimiento de Visitas",
      subject: "Copia PDF - Incumplimiento de Visitas",
      fileName: `incumplimiento_visitas_${dateStamp}.pdf`,
    },
    "sworn-statement": {
      documentLabel: "Declaración Jurada (Alimentos)",
      subject: "Copia PDF - Declaración Jurada",
      fileName: `declaracion_jurada_${dateStamp}.pdf`,
    },
  };

  return metaMap[type] || defaultMeta;
}

function blobToBase64(blob) {
  //convierte un Blob PDF a base64 (sin "data:...;base64,")
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el PDF."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

async function sendPdfCopyToEmail({
  to,
  cc,
  subject,
  documentLabel,
  fileName,
  pdfBase64,
}) {
  //envía a Edge Function de Supabase
  const supabaseUrl = window.SUPABASE_URL;
  const supabaseAnonKey = window.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Falta configuración de Supabase (URL/ANON_KEY).");
  }

  const endpoint = `${supabaseUrl}/functions/v1/${MAIL_FUNCTION_NAME}`;

  const payload = {
    to,
    cc: Array.isArray(cc) ? cc : [],
    subject,
    documentLabel,
    fileName,
    pdfBase64,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Error Edge Function (${res.status}): ${text}`);
  }

  return true;
}

async function sendPdfCopyForCurrentProcedure(pdfBlob) {
  const targets = getEmailTargetsForCurrentProcedure();
  const to = (targets.to || "").trim();
  const cc = Array.isArray(targets.cc) ? targets.cc : [];

  if (!to) {
    showCopyToast("No se puede enviar: falta correo de destino.");
    return false;
  }

  // Para otros formularios (no VIF/MP) validar TO
  const isVifOrMp =
    formState.procedureType === "vif" || formState.procedureType === "mp";
  if (!isVifOrMp) {
    if (!to.includes("@") || !to.includes(".")) {
      showCopyToast("El correo ingresado no parece válido.");
      return false;
    }
  }

  const safeCc = cc.filter(
    (e) => typeof e === "string" && e.includes("@") && e.includes("."),
  );

  const { subject, documentLabel, fileName } =
    buildEmailMetaForCurrentProcedure();
  const pdfBase64 = await blobToBase64(pdfBlob);

  showCopyToast("Enviando PDF por correo...");

  await sendPdfCopyToEmail({
    to,
    cc: safeCc,
    subject,
    documentLabel,
    fileName,
    pdfBase64,
  });

  if (isVifOrMp)
    showCopyToast("Enviado al tribunal y copia al correo ingresado.");
  else showCopyToast("Enviado al correo ingresado.");

  return true;
}
function getFormIdByProcedure(procedureType) {
  //variables/funciones en inglés
  const map = {
    vif: "form-uap",
    mp: "form-mp",

    "request-indicates": "form-request-indicates",
    "answer-transfer": "form-answer-transfer",
    "comply-ordered": "form-comply-ordered",
    "set-aside": "form-set-aside",
    "visits-noncompliance": "form-visits-noncompliance",
    "sworn-statement": "form-sworn-statement",
  };

  return map[procedureType] || null;
}

function hideAllProcedureForms() {
  const ids = [
    "form-uap",
    "form-mp",
    "form-request-indicates",
    "form-answer-transfer",
    "form-comply-ordered",
    "form-set-aside",
    "form-visits-noncompliance",
    "form-sworn-statement",
  ];

  ids.forEach((id) => document.getElementById(id)?.classList.add("d-none"));
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

    const url = URL.createObjectURL(blob);
    iframe.src = url;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    // ✅ liberar memoria cuando se cierra el modal
    modalEl.addEventListener(
      "hidden.bs.modal",
      () => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      },
      { once: true },
    );

    showCopyToast("PDF listo para revisar.");
  } catch (err) {
    console.error(err);
    showCopyToast("Error al generar el PDF.");
  }
}

async function previewPdfForCurrentProcedure() {
  const procedureType = formState.procedureType;

  if (!procedureType) {
    showCopyToast("Debe seleccionar un tipo de trámite.");
    throw new Error("procedureType null");
  }

  // Comentarios en español:
  // - Helpers internos para todos los PDFs
  function safeText(v) {
    const t = (v ?? "").toString().trim();
    return t.length ? t : " ";
  }

  function yesNoFromValue(v) {
    const s = (v ?? "").toString().trim().toLowerCase();
    if (v === true) return "Sí";
    if (s === "sí" || s === "si" || s === "true" || s === "1") return "Sí";
    return "No";
  }

  function isTrue(v) {
    const s = (v ?? "").toString().trim().toLowerCase();
    return v === true || s === "sí" || s === "si" || s === "true" || s === "1";
  }

  const nowText = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const conectaUrl = "https://conecta.pjud.cl/";

  function buildCommonHeader() {
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
          stack: [{ image: PJUD_LOGO_BASE64, width: 130, alignment: "right" }],
        },
      ],
    };
  }

  function buildCommonFooter(currentPage, pageCount) {
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
  }

  // ✅ MP
  if (procedureType === "mp") {
    const data = collectCurrentFormData();

    // ============================
    // NNA(S) dinámicos (desde DOM)
    // ============================
    const childCards = Array.from(
      document.querySelectorAll("#mp-children .mp-child"),
    );

    const effectiveChildCards =
      childCards.length > 0 ? childCards : [{ getAttribute: () => "1" }];

    const childrenTables = [];
    effectiveChildCards.forEach((card, i) => {
      const idx = (card.getAttribute("data-child-index") || "1").trim();

      childrenTables.push(
        buildPersonTable(`NNA #${i + 1}`, {
          Nombre: safeText(data[`mp_child_${idx}_name`]),
          RUN: safeText(data[`mp_child_${idx}_rut`]),
          "Fecha nacimiento": safeText(data[`mp_child_${idx}_birthdate`]),
          Edad: safeText(data[`mp_child_${idx}_age`]),
          Domicilio: safeText(data[`mp_child_${idx}_address`]),
          Teléfono: safeText(data[`mp_child_${idx}_phone`]),
          "E-mail": safeText(data[`mp_child_${idx}_email`]),
          Escolaridad: safeText(data[`mp_child_${idx}_schooling`]),
        }),
      );
    });

    // ============================
    // REQUIERENTES dinámicos (DOM)
    // ============================
    const requesterCards = Array.from(
      document.querySelectorAll("#mp-requesters .mp-requester"),
    );
    const requestersTables = [];

    requesterCards.forEach((card, i) => {
      const idx = (card.getAttribute("data-requester-index") || "1").trim();

      requestersTables.push(
        buildPersonTable(`REQUERENTE #${i + 1}`, {
          Nombre: safeText(data[`mp_requester_${idx}_name`]),
          RUN: safeText(data[`mp_requester_${idx}_rut`]),
          Domicilio: safeText(data[`mp_requester_${idx}_address`]),
          Teléfono: safeText(data[`mp_requester_${idx}_phone`]),
          "E-mail": safeText(data[`mp_requester_${idx}_email`]),
          Actividad: safeText(data[`mp_requester_${idx}_activity`]),
          "Vínculo con NNA": safeText(data[`mp_requester_${idx}_relationship`]),
        }),
      );

      if (requesterCards.length > 1 && i === 1) {
        requestersTables.push({ text: " ", margin: [0, 12, 0, 12] });
      }
    });

    const docDefinition = {
      pageMargins: [40, 90, 40, 95],
      header: () => buildCommonHeader(),
      footer: (currentPage, pageCount) => buildCommonFooter(currentPage, pageCount),
      content: [
        {
          text: "MEDIDA DE PROTECCIÓN",
          alignment: "center",
          bold: true,
          margin: [0, 35, 0, 18],
        },

        { text: "NNA(S)", bold: true, margin: [0, 10, 0, 5] },
        ...childrenTables,

        { text: "REQUERENTE(S)", bold: true, margin: [0, 10, 0, 5] },
        ...requestersTables,

        buildPersonTable("SOLICITADO", {
          Nombre: safeText(data.mp_requested_name),
          RUN: safeText(data.mp_requested_rut),
          Domicilio: safeText(data.mp_requested_address),
          Teléfono: safeText(data.mp_requested_phone),
          "E-mail": safeText(data.mp_requested_email),
          Actividad: safeText(data.mp_requested_activity),
          "Vínculo con NNA": safeText(data.mp_requested_relationship),
        }),

        {
          margin: [0, 45, 0, 0],
          columns: [
            {
              width: "50%",
              stack: [
                { text: "_______________________________", alignment: "center" },
                { text: "Denunciante", bold: true, alignment: "center", margin: [0, 6, 0, 0] },
              ],
            },
            {
              width: "50%",
              stack: [
                { text: "_______________________________", alignment: "center" },
                { text: "Funcionario/a que ingresa", bold: true, alignment: "center", margin: [0, 6, 0, 0] },
              ],
            },
          ],
        },
      ],
      defaultStyle: { fontSize: 12 },
    };

    const blob = await createPdfBlob(docDefinition);
    return { blob, procedureType };
  }

  // ✅ VIF
  if (procedureType === "vif") {
    const docDefinition = buildVifDocDefinitionForPreview();
    const blob = await createPdfBlob(docDefinition);
    return { blob, procedureType };
  }

  // ✅ SOLICITUD QUE INDICA
  if (procedureType === "request-indicates") {
    const data = collectCurrentFormData();

    const docDefinition = {
      pageMargins: [40, 90, 40, 95],
      header: () => buildCommonHeader(),
      footer: (currentPage, pageCount) => buildCommonFooter(currentPage, pageCount),
      content: [
        {
          text: "SOLICITUD QUE INDICA",
          alignment: "center",
          bold: true,
          margin: [0, 35, 0, 18],
        },

        buildPersonTable("DATOS DE LA PRESENTACIÓN", {
          Fecha: safeText(data.req_date),
          RIT: safeText(data.req_rit),
          "Tribunal de origen": safeText(data.req_origin_court),
          Calidad: safeText(data.req_role),
        }),

        buildPersonTable("SOLICITANTE", {
          "Nombre completo": safeText(data.req_name),
          RUN: safeText(data.req_rut),
          Domicilio: safeText(data.req_address),
          Comuna: safeText(data.req_comuna),
          Teléfono: safeText(data.req_phone),
          "Correo electrónico": safeText(data.req_email),
          Ocupación: safeText(data.req_occupation),
          "Empresa / institución": safeText(data.req_company),
          "Autoriza modificar datos": safeText(data.req_modify_data),
        }),

        buildPersonTable("NOTIFICACIONES", {
          "Notificación por teléfono": yesNoFromValue(data.req_notify_phone),
          "Notificación por correo": yesNoFromValue(data.req_notify_email),
          "Declara no tener medios tecnológicos": yesNoFromValue(data.req_no_tech),
        }),

        { text: "SOLICITUD", bold: true, margin: [0, 5, 0, 6] },
        { text: safeText(data.req_request_text), alignment: "justify", margin: [0, 0, 0, 10] },
      ],
      defaultStyle: { fontSize: 12 },
    };

    const blob = await createPdfBlob(docDefinition);
    return { blob, procedureType };
  }

  // ✅ CONTESTA TRASLADO
  if (procedureType === "answer-transfer") {
    const data = collectCurrentFormData();

    const docDefinition = {
      pageMargins: [40, 90, 40, 95],
      header: () => buildCommonHeader(),
      footer: (currentPage, pageCount) => buildCommonFooter(currentPage, pageCount),
      content: [
        {
          text: "CONTESTA TRASLADO",
          alignment: "center",
          bold: true,
          margin: [0, 35, 0, 18],
        },

        buildPersonTable("DATOS DE LA PRESENTACIÓN", {
          Fecha: safeText(data.at_date),
          RIT: safeText(data.at_rit),
          "Tribunal de origen": safeText(data.at_origin_court),
          Calidad: safeText(data.at_role),
          "Fecha traslado": safeText(data.at_transfer_date),
        }),

        buildPersonTable("COMPARECIENTE", {
          "Nombre completo": safeText(data.at_name),
          RUN: safeText(data.at_rut),
          Domicilio: safeText(data.at_address),
          Comuna: safeText(data.at_comuna),
          Teléfono: safeText(data.at_phone),
          "Correo electrónico": safeText(data.at_email),
          Ocupación: safeText(data.at_occupation),
          "Empresa / institución": safeText(data.at_company),
          "Autoriza modificar datos": safeText(data.at_modify_data),
        }),

        buildPersonTable("NOTIFICACIONES", {
          "Notificación por teléfono": yesNoFromValue(data.at_notify_phone),
          "Notificación por correo": yesNoFromValue(data.at_notify_email),
          "Declara no tener medios tecnológicos": yesNoFromValue(data.at_no_tech),
        }),

        { text: "CONTESTACIÓN", bold: true, margin: [0, 5, 0, 6] },
        { text: safeText(data.at_answer_text), alignment: "justify", margin: [0, 0, 0, 10] },
      ],
      defaultStyle: { fontSize: 12 },
    };

    const blob = await createPdfBlob(docDefinition);
    return { blob, procedureType };
  }

  // ✅ CUMPLE LO ORDENADO
  if (procedureType === "comply-ordered") {
    const data = collectCurrentFormData();

    const docDefinition = {
      pageMargins: [40, 90, 40, 95],
      header: () => buildCommonHeader(),
      footer: (currentPage, pageCount) => buildCommonFooter(currentPage, pageCount),
      content: [
        {
          text: "CUMPLE LO ORDENADO",
          alignment: "center",
          bold: true,
          margin: [0, 35, 0, 18],
        },

        buildPersonTable("DATOS DE LA PRESENTACIÓN", {
          Fecha: safeText(data.co_date),
          RIT: safeText(data.co_rit),
          "Tribunal de origen": safeText(data.co_origin_court),
          Calidad: safeText(data.co_role),
          "Fecha de lo ordenado": safeText(data.co_ordered_date),
        }),

        buildPersonTable("COMPARECIENTE", {
          "Nombre completo": safeText(data.co_name),
          RUN: safeText(data.co_rut),
          Domicilio: safeText(data.co_address),
          Comuna: safeText(data.co_comuna),
          Teléfono: safeText(data.co_phone),
          "Correo electrónico": safeText(data.co_email),
          Ocupación: safeText(data.co_occupation),
          "Empresa / institución": safeText(data.co_company),
          "Autoriza modificar datos": safeText(data.co_modify_data),
        }),

        buildPersonTable("NOTIFICACIONES", {
          "Notificación por teléfono": yesNoFromValue(data.co_notify_phone),
          "Notificación por correo": yesNoFromValue(data.co_notify_email),
          "Declara no tener medios tecnológicos": yesNoFromValue(data.co_no_tech),
        }),

        { text: "PRESENTACIÓN", bold: true, margin: [0, 5, 0, 6] },
        { text: safeText(data.co_text), alignment: "justify", margin: [0, 0, 0, 10] },
      ],
      defaultStyle: { fontSize: 12 },
    };

    const blob = await createPdfBlob(docDefinition);
    return { blob, procedureType };
  }

  // ✅ DEJE SIN EFECTO
  if (procedureType === "set-aside") {
    const data = collectCurrentFormData();

    const docDefinition = {
      pageMargins: [40, 90, 40, 95],
      header: () => buildCommonHeader(),
      footer: (currentPage, pageCount) => buildCommonFooter(currentPage, pageCount),
      content: [
        {
          text: "DEJE SIN EFECTO",
          alignment: "center",
          bold: true,
          margin: [0, 35, 0, 18],
        },

        buildPersonTable("DATOS DE LA PRESENTACIÓN", {
          Fecha: safeText(data.se_date),
          RIT: safeText(data.se_rit),
          "Tribunal de origen": safeText(data.se_origin_court),
          Calidad: safeText(data.se_role),
        }),

        buildPersonTable("COMPARECIENTE", {
          "Nombre completo": safeText(data.se_name),
          RUN: safeText(data.se_rut),
          Domicilio: safeText(data.se_address),
          Comuna: safeText(data.se_comuna),
          Teléfono: safeText(data.se_phone),
          "Correo electrónico": safeText(data.se_email),
          Ocupación: safeText(data.se_occupation),
          "Empresa / institución": safeText(data.se_company),
          "Autoriza modificar datos": safeText(data.se_modify_data),
        }),

        buildPersonTable("NOTIFICACIONES", {
          "Notificación por teléfono": yesNoFromValue(data.se_notify_phone),
          "Notificación por correo": yesNoFromValue(data.se_notify_email),
          "Declara no tener medios tecnológicos": yesNoFromValue(data.se_no_tech),
        }),

        { text: "PRESENTACIÓN", bold: true, margin: [0, 5, 0, 6] },
        { text: safeText(data.se_text), alignment: "justify", margin: [0, 0, 0, 10] },
      ],
      defaultStyle: { fontSize: 12 },
    };

    const blob = await createPdfBlob(docDefinition);
    return { blob, procedureType };
  }

  // ✅ INCUMPLIMIENTO DE VISITAS
  if (procedureType === "visits-noncompliance") {
    const data = collectCurrentFormData();

    const reqFlags = [
      { key: "iv_req_1", label: "Petición 1" },
      { key: "iv_req_2", label: "Petición 2" },
      { key: "iv_req_3", label: "Petición 3" },
      { key: "iv_req_4", label: "Petición 4" },
    ];

    const reqSelected = reqFlags
      .filter((x) => isTrue(data[x.key]))
      .map((x) => x.label);

    const docDefinition = {
      pageMargins: [40, 90, 40, 95],
      header: () => buildCommonHeader(),
      footer: (currentPage, pageCount) => buildCommonFooter(currentPage, pageCount),
      content: [
        {
          text: "INCUMPLIMIENTO DE VISITAS",
          alignment: "center",
          bold: true,
          margin: [0, 35, 0, 18],
        },

        buildPersonTable("DATOS GENERALES", {
          Fecha: safeText(data.iv_date),
          RIT: safeText(data.iv_rit),
          Parentesco: safeText(data.iv_kinship),
          "Edades de NNA": safeText(data.iv_children_ages),
          "Fecha de recuperación (si aplica)": safeText(data.iv_recovery_date),
        }),

        buildPersonTable("REQUERENTE", {
          "Nombre completo": safeText(data.iv_req_name),
          RUN: safeText(data.iv_req_rut),
          Domicilio: safeText(data.iv_req_address),
          Comuna: safeText(data.iv_req_comuna),
          Ciudad: safeText(data.iv_req_city),
          Teléfono: safeText(data.iv_req_phone),
          "Correo electrónico": safeText(data.iv_req_email),
          "Notificación por teléfono": yesNoFromValue(data.iv_req_notify_phone),
          "Notificación por correo": yesNoFromValue(data.iv_req_notify_email),
          "Declara no tener medios tecnológicos": yesNoFromValue(data.iv_no_tech),
        }),

        buildPersonTable("REQUERIDO", {
          "Nombre completo": safeText(data.iv_res_name),
          RUN: safeText(data.iv_res_rut),
          Domicilio: safeText(data.iv_res_address),
          Comuna: safeText(data.iv_res_comuna),
          Ciudad: safeText(data.iv_res_city),
          Teléfono: safeText(data.iv_res_phone),
          "Correo electrónico": safeText(data.iv_res_email),
        }),

        buildPersonTable("PETICIONES", {
          "Selecciones marcadas": reqSelected.length ? reqSelected.join(" / ") : "No registra",
          "Petición 5 (texto)": safeText(data.iv_req_5_text),
          "Acompaña documentos": safeText(data.iv_documents),
        }),

        { text: "FUNDAMENTOS", bold: true, margin: [0, 5, 0, 6] },
        { text: safeText(data.iv_fundament), alignment: "justify", margin: [0, 0, 0, 10] },
      ],
      defaultStyle: { fontSize: 12 },
    };

    const blob = await createPdfBlob(docDefinition);
    return { blob, procedureType };
  }

  // ✅ DECLARACIÓN JURADA (ALIMENTOS)
  if (procedureType === "sworn-statement") {
    const data = collectCurrentFormData();

    const docDefinition = {
      pageMargins: [40, 90, 40, 95],
      header: () => buildCommonHeader(),
      footer: (currentPage, pageCount) => buildCommonFooter(currentPage, pageCount),
      content: [
        {
          text: "DECLARACIÓN JURADA (ALIMENTOS)",
          alignment: "center",
          bold: true,
          margin: [0, 35, 0, 18],
        },

        buildPersonTable("DATOS GENERALES", {
          Fecha: safeText(data.dj_date),
          RIT: safeText(data.dj_rit),
        }),

        buildPersonTable("DECLARANTE", {
          "Nombre completo": safeText(data.dj_name),
          RUN: safeText(data.dj_rut),
          Edad: safeText(data.dj_age),
          "Estado civil": safeText(data.dj_marital_status),
          Estudios: safeText(data.dj_studies),
          Profesión: safeText(data.dj_profession),
          Teléfono: safeText(data.dj_phone),
          "Correo electrónico": safeText(data.dj_email),
          "Declara no tener medios tecnológicos": yesNoFromValue(data.dj_no_tech),
        }),

        buildPersonTable("DOMICILIO", {
          Calle: safeText(data.dj_street),
          Número: safeText(data.dj_number),
          Población: safeText(data.dj_neighborhood),
          Comuna: safeText(data.dj_comuna),
          Ciudad: safeText(data.dj_city),
        }),

        buildPersonTable("SITUACIÓN LABORAL E INGRESOS", {
          "Trabajo actual": safeText(data.dj_current_job),
          "Ingreso mensual": safeText(data.dj_monthly_income),
          "Ingresos adicionales": safeText(data.dj_extra_income),
        }),

        buildPersonTable("BIENES", {
          "Bienes inmuebles": safeText(data.dj_real_estate),
          "Bienes de valor": safeText(data.dj_valuable_goods),
        }),

        {
          margin: [0, 35, 0, 0],
          columns: [
            {
              width: "50%",
              stack: [
                { text: "_______________________________", alignment: "center" },
                { text: "Declarante", bold: true, alignment: "center", margin: [0, 6, 0, 0] },
              ],
            },
            {
              width: "50%",
              stack: [
                { text: "_______________________________", alignment: "center" },
                { text: "Funcionario/a que ingresa", bold: true, alignment: "center", margin: [0, 6, 0, 0] },
              ],
            },
          ],
        },
      ],
      defaultStyle: { fontSize: 12 },
    };

    const blob = await createPdfBlob(docDefinition);
    return { blob, procedureType };
  }

  // ✅ OTROS TRÁMITES (NO IMPLEMENTADOS)
  showCopyToast("Este trámite aún no tiene PDF implementado.");
  throw new Error(`PDF no implementado para: ${procedureType}`);
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

function addProtectionMeasureChild() {
  const container = document.getElementById("mp-children");
  if (!container) {
    showCopyToast("No se encontró el contenedor de NNA.");
    return;
  }

  mpChildCount += 1;
  const index = mpChildCount;

  const card = document.createElement("div");
  card.className = "mp-child border rounded-3 p-3 mb-3";
  card.setAttribute("data-child-index", String(index));

  card.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <strong>NNA #${index}</strong>
      <button type="button" class="btn btn-outline-danger btn-sm" data-action="remove-child">
        <i class="bi bi-dash-circle"></i> Quitar
      </button>
    </div>

    <div class="row g-2">
      <div class="col-12 col-md-8">
        <label class="form-label">Nombre completo</label>
        <input class="form-control" name="mp_child_${index}_name" autocomplete="off" />
      </div>

      <div class="col-12 col-md-4">
        <label class="form-label">RUN</label>
        <input class="form-control rut-field" name="mp_child_${index}_rut" autocomplete="off" />
      </div>

      <div class="col-12 col-md-4">
        <label class="form-label">Fecha de nacimiento</label>
        <input class="form-control" type="date" name="mp_child_${index}_birthdate" />
      </div>

      <div class="col-12 col-md-2">
        <label class="form-label">Edad</label>
        <input class="form-control" name="mp_child_${index}_age" readonly />
      </div>

      <div class="col-12 col-md-4">
        <label class="form-label">Categoría (auto)</label>
        <input class="form-control" name="mp_child_${index}_category" readonly />
      </div>

      <div class="col-12">
        <label class="form-label">Domicilio</label>
        <input class="form-control" name="mp_child_${index}_address" autocomplete="off" />
      </div>

      <div class="col-12 col-md-4">
        <label class="form-label">Teléfono</label>
        <input class="form-control" name="mp_child_${index}_phone" autocomplete="off" />
      </div>

      <div class="col-12 col-md-4">
        <label class="form-label">E-mail</label>
        <input class="form-control" type="email" name="mp_child_${index}_email" autocomplete="off" />
      </div>

      <div class="col-12 col-md-4">
        <label class="form-label">Escolaridad</label>
        <select class="form-select" name="mp_child_${index}_schooling">
          <option value="">Seleccione escolaridad</option>
          <option>Preescolar</option>
          <option>Básica incompleta</option>
          <option>Básica completa</option>
          <option>Media incompleta</option>
          <option>Media completa</option>
          <option>Técnico profesional</option>
          <option>Superior incompleta</option>
          <option>Superior completa</option>
          <option>Otra</option>
          <option>No aplica / Sin información</option>
        </select>
      </div>
    </div>
  `;

  container.appendChild(card);

  // Enlazar fecha->edad del nuevo NNA
  bindBirthdateToAge(
    "form-mp",
    `mp_child_${index}_birthdate`,
    `mp_child_${index}_age`,
  );

  // Seteo inicial de categoría
  syncMpChildCategory(index);

  // Normaliza numeración (y botones ocultos para el primero)
  renumberProtectionChildren();

  showCopyToast("NNA agregado");
}

function renumberProtectionChildren() {
  const container = document.getElementById("mp-children");
  if (!container) return;

  const cards = Array.from(container.querySelectorAll(".mp-child"));

  // Reindex real: 1..N
  cards.forEach((card, i) => {
    const newIdx = i + 1;

    // Título
    const title = card.querySelector("strong");
    if (title) title.textContent = `NNA #${newIdx}`;

    // Índice antiguo (para renombrar)
    const oldIdx = (
      card.getAttribute("data-child-index") || String(newIdx)
    ).trim();

    // Setear el nuevo índice en el card
    card.setAttribute("data-child-index", String(newIdx));

    // Renombrar name="mp_child_OLD_*" => "mp_child_NEW_*"
    card
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach((el) => {
        const name = el.getAttribute("name") || "";
        const rx = new RegExp(`^mp_child_${oldIdx}_(.+)$`);
        const m = name.match(rx);
        if (m) {
          el.setAttribute("name", `mp_child_${newIdx}_${m[1]}`);
        }
      });

    // Botón quitar: ocultar solo en el primero
    const removeBtn = card.querySelector('button[data-action="remove-child"]');
    if (removeBtn) {
      if (newIdx === 1) removeBtn.classList.add("d-none");
      else removeBtn.classList.remove("d-none");
    }

    // Re-bind fecha -> edad (la función bindBirthdateToAge evita duplicados por dataset)
    bindBirthdateToAge(
      "form-mp",
      `mp_child_${newIdx}_birthdate`,
      `mp_child_${newIdx}_age`,
    );

    // Recalcular categoría según edad actual
    syncMpChildCategory(newIdx);
  });

  // Ajustar contador al final (queda alineado con DOM)
  mpChildCount = cards.length > 0 ? cards.length : 1;
}
function updateMpChildCountFromDom() {
  const cards = Array.from(document.querySelectorAll("#mp-children .mp-child"));
  mpChildCount = cards.length > 0 ? cards.length : 1;
}

/***************************************************
 * MP: NNA (dinámico)
 ***************************************************/
let mpChildCount = 1;

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

  const syncAge = () => {
    ageEl.value = calculateAgeFromBirthdate(birthdateEl.value);
    const m = birthdateName.match(/^mp_child_(\d+)_birthdate$/);
    if (m) syncMpChildCategory(m[1]);
  };

  // ✅ reemplaza en vez de acumular listeners
  birthdateEl.oninput = syncAge;
  birthdateEl.onchange = syncAge;

  syncAge();
}

function initProtectionMeasureForm() {
  const form = document.getElementById("form-mp");
  if (!form) return;

  if (form.dataset.initialized === "1") return;
  form.dataset.initialized = "1";

  // ============================
  // NNA: eliminar y reindexar
  // ============================
  const childrenContainer = document.getElementById("mp-children");
  if (childrenContainer) {
    childrenContainer.addEventListener("click", (e) => {
      const btn = e.target.closest('button[data-action="remove-child"]');
      if (!btn) return;

      const card = btn.closest(".mp-child");
      if (!card) return;

      card.remove();
      showCopyToast("NNA eliminado");
      renumberProtectionChildren();
      updateMpChildCountFromDom();
    });
  }

  // Asegurar títulos/botones y contadores
  renumberProtectionChildren();
  updateMpChildCountFromDom();

  // Enlazar fecha->edad para el/los NNA existentes + categoría inicial
  Array.from(document.querySelectorAll("#mp-children .mp-child")).forEach(
    (card) => {
      const idx = (card.getAttribute("data-child-index") || "1").trim();

      bindBirthdateToAge(
        "form-mp",
        `mp_child_${idx}_birthdate`,
        `mp_child_${idx}_age`,
      );

      // Seteo inicial de categoría (por si ya viene edad cargada)
      syncMpChildCategory(idx);
    },
  );

  // ============================
  // REQUIERENTES: eliminar y reindexar
  // ============================
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
  updateMpRequesterCountFromDom();
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
        <input class="form-control rut-field" name="mp_requester_${index}_rut" autocomplete="off" />
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
  const container = document.getElementById("mp-requesters");
  if (!container) return;

  const cards = Array.from(container.querySelectorAll(".mp-requester"));

  cards.forEach((card, i) => {
    const newIdx = i + 1;

    // Título
    const title = card.querySelector("strong");
    if (title) title.textContent = `Requirente #${newIdx}`;

    // Índice antiguo
    const oldIdx = (
      card.getAttribute("data-requester-index") || String(newIdx)
    ).trim();

    // Setear nuevo índice
    card.setAttribute("data-requester-index", String(newIdx));

    // Renombrar name="mp_requester_OLD_*" => "mp_requester_NEW_*"
    card
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach((el) => {
        const name = el.getAttribute("name") || "";
        const rx = new RegExp(`^mp_requester_${oldIdx}_(.+)$`);
        const m = name.match(rx);
        if (m) {
          el.setAttribute("name", `mp_requester_${newIdx}_${m[1]}`);
        }
      });

    // Botón quitar: ocultar solo en el primero
    const removeBtn = card.querySelector(
      'button[data-action="remove-requester"]',
    );
    if (removeBtn) {
      if (newIdx === 1) removeBtn.classList.add("d-none");
      else removeBtn.classList.remove("d-none");
    }
  });

  // contador alineado con DOM
  mpRequesterCount = cards.length > 0 ? cards.length : 1;
}

function updateMpRequesterCountFromDom() {
  const cards = Array.from(
    document.querySelectorAll("#mp-requesters .mp-requester"),
  );
  mpRequesterCount = cards.length > 0 ? cards.length : 1;
}

function clearProtectionMeasureForm() {
  const form = document.getElementById("form-mp");
  if (!form) return;

  // Limpiar todo
  form
    .querySelectorAll("input, select, textarea")
    .forEach((el) => (el.value = ""));

  // Requirentes: dejar solo el primero
  const requesterContainer = document.getElementById("mp-requesters");
  if (requesterContainer) {
    const cards = Array.from(
      requesterContainer.querySelectorAll(".mp-requester"),
    );
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

  // NNA: dejar solo el primero
  const childContainer = document.getElementById("mp-children");
  if (childContainer) {
    const cards = Array.from(childContainer.querySelectorAll(".mp-child"));
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
  mpChildCount = 1;
  renumberProtectionChildren();

  showCopyToast("Formulario MP limpiado.");
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

  // NNA #1
  document.querySelector("[name='mp_child_1_name']").value =
    "Benjamín Ignacio Soto López";
  document.querySelector("[name='mp_child_1_rut']").value = "21.345.678-9";
  document.querySelector("[name='mp_child_1_birthdate']").value = "2014-09-22";
  document.querySelector("[name='mp_child_1_age']").value = "10";
  document.querySelector("[name='mp_child_1_address']").value =
    "Pasaje Los Robles 321, Ancud";
  document.querySelector("[name='mp_child_1_phone']").value = "+56 9 5555 6666";
  document.querySelector("[name='mp_child_1_email']").value = "nna@correo.cl";
  document.querySelector("[name='mp_child_1_schooling']").value =
    "Básica completa";

  // (Opcional) NNA #2 de prueba
  if (typeof window.addProtectionMeasureChild === "function") {
    window.addProtectionMeasureChild();

    document.querySelector("[name='mp_child_2_name']").value =
      "Sofía Antonia Soto López";
    document.querySelector("[name='mp_child_2_rut']").value = "22.111.222-3";
    document.querySelector("[name='mp_child_2_birthdate']").value =
      "2017-03-10";
    document.querySelector("[name='mp_child_2_age']").value = "8";
    document.querySelector("[name='mp_child_2_address']").value =
      "Pasaje Los Robles 321, Ancud";
    document.querySelector("[name='mp_child_2_phone']").value =
      "+56 9 4444 5555";
    document.querySelector("[name='mp_child_2_email']").value =
      "nna2@correo.cl";
    document.querySelector("[name='mp_child_2_schooling']").value =
      "Básica incompleta";
  }

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
  initTestDataButtons();
});

function openSendEmailModal() {
  if (!formState.procedureType) {
    showCopyToast("Seleccione un trámite para continuar.");
    return;
  }

  const { to, cc } = getEmailTargetsForCurrentProcedure();
  const toText = (to || "").trim();
  const ccList = Array.isArray(cc) ? cc.filter(Boolean) : [];

  // Reglas:
  // - VIF/MP siempre tienen TO tribunal
  // - Otros deben tener TO correo personal
  if (!toText) {
    showCopyToast("No se puede enviar: falta correo de destino.");
    return;
  }

  // Para otros formularios (no VIF/MP) validar formato del TO
  const isVifOrMp =
    formState.procedureType === "vif" || formState.procedureType === "mp";
  if (!isVifOrMp) {
    if (!toText.includes("@") || !toText.includes(".")) {
      showCopyToast(
        "El correo ingresado no parece válido. Revíselo e intente nuevamente.",
      );
      return;
    }
  }

  // Pintar en modal
  const toEl = document.getElementById("sendEmailToText");
  if (toEl) toEl.textContent = toText;

  const ccBlock = document.getElementById("sendEmailCcBlock");
  const ccEl = document.getElementById("sendEmailCcText");

  // En VIF/MP mostramos CC como “correo ingresado”, si existe
  if (isVifOrMp && ccList.length > 0) {
    if (ccEl) ccEl.textContent = ccList.join(", ");
    if (ccBlock) ccBlock.style.display = "block";
  } else {
    if (ccEl) ccEl.textContent = "—";
    if (ccBlock) ccBlock.style.display = "none";
  }

  const modalEl = document.getElementById("sendEmailModal");
  if (!modalEl) {
    showCopyToast("No se encontró la ventana de confirmación de correo.");
    return;
  }

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function confirmSendEmailForCurrentProcedure() {
  try {
    if (!formState.procedureType) {
      showCopyToast("Debe seleccionar un tipo de trámite.");
      return;
    }

    showCopyToast("Preparando PDF para envío...");

    const { blob } = await previewPdfForCurrentProcedure();

    const ok = await sendPdfCopyForCurrentProcedure(blob);
    if (!ok) return;

    const modalEl = document.getElementById("sendEmailModal");
    const instance = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
    if (instance) instance.hide();

    showCopyToast("Envío realizado correctamente.");
  } catch (err) {
    console.error(err);
    showCopyToast(
      "No se pudo enviar el PDF. Revise el correo e intente nuevamente.",
    );
  }
}

function handleOpenSendEmailModal() {
  openSendEmailModal();
}

/***************************************************
 * TEST DATA (GENÉRICO) - para TODOS los formularios
 ***************************************************/
function setFieldValue(formId, selectorOrName, value) {
  const form = document.getElementById(formId);
  if (!form) return;

  // Permite pasar "name" directo o selector tipo [name="..."]
  const el =
    selectorOrName.startsWith("#") ||
    selectorOrName.startsWith("[") ||
    selectorOrName.includes(" ")
      ? form.querySelector(selectorOrName)
      : form.querySelector(`[name="${selectorOrName}"]`);

  if (!el) return;

  // Soporte básico checkbox/radio
  if (el.type === "checkbox") {
    el.checked = value === true || value === "Sí" || value === "si";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (el.type === "radio") {
    const radio = form.querySelector(`[name="${el.name}"][value="${value}"]`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return;
  }

  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyTestDataToForm(formId, dataMap) {
  Object.entries(dataMap).forEach(([field, value]) => {
    setFieldValue(formId, field, value);
  });
}

function getTodayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/***************************************************
 * TEST DATA (GENÉRICO) - para TODOS los formularios
 ***************************************************/
function setFieldValue(formId, selectorOrName, value) {
  const form = document.getElementById(formId);
  if (!form) return;

  // Permite pasar "name" directo o selector tipo [name="..."]
  const el =
    selectorOrName.startsWith("#") ||
    selectorOrName.startsWith("[") ||
    selectorOrName.includes(" ")
      ? form.querySelector(selectorOrName)
      : form.querySelector(`[name="${selectorOrName}"]`);

  if (!el) return;

  // Soporte básico checkbox/radio
  if (el.type === "checkbox") {
    el.checked = value === true || value === "Sí" || value === "si";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (el.type === "radio") {
    const radio = form.querySelector(`[name="${el.name}"][value="${value}"]`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return;
  }

  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyTestDataToForm(formId, dataMap) {
  Object.entries(dataMap).forEach(([field, value]) => {
    setFieldValue(formId, field, value);
  });
}

function getTodayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/***************************************************
 * DATOS DE PRUEBA (por cada formulario nuevo)
 * - Variables y funciones en inglés
 * - Comentarios en español
 * - Sin alert/confirm (solo toast si existe)
 ***************************************************/
function initTestDataButtons() {
  // Toast simple (si existe un toast ya implementado en tu proyecto)
  function showToast(message) {
    // Si en tu proyecto existe showCopyToast (app.js), úsalo
    if (typeof window.showCopyToast === "function") {
      window.showCopyToast(message);
      return;
    }

    // Si existe un toast con id conocido, úsalo (clase "show")
    const toastEl =
      document.getElementById("toast-copiar") ||
      document.getElementById("uap-toast");
    if (toastEl) {
      toastEl.textContent = message;
      toastEl.classList.remove("show");
      void toastEl.offsetWidth;
      toastEl.classList.add("show");
      setTimeout(() => toastEl.classList.remove("show"), 2500);
      return;
    }

    // Fallback silencioso
    console.log(message);
  }

  function getTodayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Define el correo fijo del solicitante
  const REQUESTER_EMAIL = "l.tureop@gmail.com";

  function isRequesterEmailField(fieldName) {
    const n = (fieldName || "").toLowerCase();

    // Comentarios en español:
    // - Regla: "correo del solicitante" (quien solicita trámite)
    // - Incluye campos clásicos y patrones usados en tus formularios
    return (
      n === "req_email" ||
      n === "iv_req_email" ||
      n === "dj_email" ||
      n === "se_email" ||
      n === "co_email" ||
      n === "at_email" ||
      n.includes("_req_email") ||
      (n.includes("_req_") && n.includes("email")) ||
      (n.startsWith("req_") && n.includes("email"))
    );
  }

  function setValue(form, name, value) {
    const el = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!el) return false;

    // Forzar correo del solicitante
    if (el.type === "email" && isRequesterEmailField(name)) {
      el.value = REQUESTER_EMAIL;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (el.type === "checkbox") {
      el.checked = Boolean(value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (el.type === "radio") {
      const radios = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      let found = false;
      radios.forEach((r) => {
        if (String(r.value) === String(value)) {
          r.checked = true;
          r.dispatchEvent(new Event("change", { bubbles: true }));
          found = true;
        }
      });
      return found;
    }

    el.value = value ?? "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function setRadio(form, name, value) {
    const radios = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
    let ok = false;
    radios.forEach((r) => {
      if (String(r.value) === String(value)) {
        r.checked = true;
        r.dispatchEvent(new Event("change", { bubbles: true }));
        ok = true;
      }
    });
    return ok;
  }

  function setCheckbox(form, name, checked) {
    const el = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!el || el.type !== "checkbox") return false;
    el.checked = Boolean(checked);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function fillAllRemainingFields(form) {
    // Rellena TODO lo que tenga name y esté vacío, para que no quede nada sin registrar
    const today = getTodayISO();

    form.querySelectorAll("input, textarea, select").forEach((el) => {
      if (!el.name) return;
      if (el.type === "button" || el.type === "submit") return;

      // Radios: si ninguno marcado, marca el primero
      if (el.type === "radio") {
        const group = form.querySelectorAll(`[name="${CSS.escape(el.name)}"]`);
        const anyChecked = Array.from(group).some((r) => r.checked);
        if (!anyChecked && group.length) {
          group[0].checked = true;
          group[0].dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      // Checkboxes: si está unchecked, lo dejamos según lógica genérica (true si es "no_tech" o "notify")
      if (el.type === "checkbox") {
        if (!el.checked) {
          const n = el.name.toLowerCase();
          const shouldCheck =
            n.includes("notify") || n.includes("no_tech") ? true : false;
          el.checked = shouldCheck;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      // Si es email del solicitante, SIEMPRE forzar tu correo (aunque no esté vacío)
      if (el.type === "email" && isRequesterEmailField(el.name)) {
        el.value = REQUESTER_EMAIL;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      // Inputs/textarea/select: si está vacío, asigna un valor genérico
      const isEmpty = (el.value ?? "").toString().trim() === "";
      if (!isEmpty) return;

      if (el.type === "date") {
        el.value = today;
      } else if (el.type === "email") {
        // Emails genéricos (NO solicitante)
        el.value = "pruebas@pjud.cl";
      } else if (el.type === "number") {
        el.value = "30";
      } else if (el.classList.contains("rut-field")) {
        el.value = "12.345.678-5";
      } else if (el.name.toLowerCase().includes("phone")) {
        el.value = "+56 9 5555 5555";
      } else if (el.name.toLowerCase().includes("rit")) {
        el.value = "C-123-2026";
      } else if (el.tagName === "TEXTAREA") {
        el.value = "Texto de prueba para completar el formulario (UAP).";
      } else {
        el.value = "Dato de prueba";
      }

      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function getTestDataByKey(key) {
    const today = getTodayISO();

    const data = {
      "request-indicates": {
        req_date: today,
        req_rit: "C-321-2026",
        req_origin_court: "Juzgado de Familia de Ancud",
        req_role: "Solicitante",
        req_name: "María Fernanda Soto Álvarez",
        req_rut: "15.987.654-3",
        req_address: "Av. Costanera 123, Ancud",
        req_comuna: "Ancud",
        req_phone: "+56 9 7777 7777",
        req_email: REQUESTER_EMAIL,
        req_occupation: "Trabajadora dependiente",
        req_company: "Empresa Chilota SpA",
        req_modify_data: "No",
        req_notify_phone: true,
        req_notify_email: true,
        req_request_text:
          "Solicito se tenga presente lo indicado en la presentación, para los fines que correspondan.",
        req_no_tech: true,
      },

      "answer-transfer": {
        at_date: today,
        at_rit: "C-654-2026",
        at_origin_court: "Juzgado de Familia de Ancud",
        at_role: "Demandante",
        at_name: "Juan Carlos Pérez Soto",
        at_rut: "12.345.678-5",
        at_address: "Los Aromos 456, Ancud",
        at_comuna: "Ancud",
        at_phone: "+56 9 1234 5678",
        at_email: REQUESTER_EMAIL,
        at_occupation: "Funcionario público",
        at_company: "Poder Judicial",
        at_modify_data: "Sí",
        at_notify_phone: true,
        at_notify_email: true,
        at_transfer_date: today,
        at_answer_text:
          "Vengo en contestar traslado, señalando que mantengo mi solicitud y acompaño los antecedentes pertinentes.",
        at_no_tech: true,
      },

      "comply-ordered": {
        co_date: today,
        co_rit: "C-777-2026",
        co_origin_court: "Juzgado de Familia de Ancud",
        co_role: "Demandado",
        co_name: "Carlos Alberto Ramírez Muñoz",
        co_rut: "9.876.543-3",
        co_address: "Calle Los Álamos 789, Ancud",
        co_comuna: "Ancud",
        co_phone: "+56 9 2222 2222",
        co_email: REQUESTER_EMAIL,
        co_occupation: "Trabajador independiente",
        co_company: "Servicios Ramírez",
        co_modify_data: "No",
        co_notify_phone: true,
        co_notify_email: false,
        co_ordered_date: today,
        co_text:
          "Vengo en dar cumplimiento a lo ordenado, acompañando antecedentes y solicitando se tenga por cumplido.",
        co_no_tech: true,
      },

      "set-aside": {
        se_date: today,
        se_rit: "C-888-2026",
        se_origin_court: "Juzgado de Familia de Ancud",
        se_role: "Demandante",
        se_name: "Ana Patricia Gutiérrez Vidal",
        se_rut: "18.234.567-9",
        se_address: "Pasaje El Molino 22, Ancud",
        se_comuna: "Ancud",
        se_phone: "+56 9 3333 3333",
        se_email: REQUESTER_EMAIL,
        se_occupation: "Dueña de casa",
        se_company: "No aplica",
        se_modify_data: "Sí",
        se_notify_phone: false,
        se_notify_email: true,
        se_text:
          "Solicito se deje sin efecto lo resuelto/ordenado, por las razones de hecho y derecho que se exponen.",
        se_no_tech: true,
      },

      "visits-noncompliance": {
        iv_date: today,
        iv_rit: "C-999-2026",
        iv_kinship: "Madre",
        iv_children_ages: "7 y 10",
        iv_req_name: "María Fernanda González Rojas",
        iv_req_rut: "17.654.321-0",
        iv_req_address: "Villa Los Alerces 101, Ancud",
        iv_req_comuna: "Ancud",
        iv_req_city: "Ancud",
        iv_req_phone: "+56 9 4444 4444",
        iv_req_email: REQUESTER_EMAIL,
        iv_req_notify_phone: true,
        iv_req_notify_email: true,

        iv_res_name: "Pedro Andrés Soto Martínez",
        iv_res_rut: "16.111.222-3",
        iv_res_address: "Calle Prat 55, Ancud",
        iv_res_comuna: "Ancud",
        iv_res_city: "Ancud",
        iv_res_phone: "+56 9 6666 6666",
        iv_res_email: "p.soto@correo.cl",

        iv_req_1: true,
        iv_req_2: true,
        iv_recovery_date: today,
        iv_req_3: true,
        iv_req_4: false,
        iv_req_5_text:
          "Se fije audiencia para resolver incidentes relacionados.",
        iv_fundament:
          "El régimen comunicacional no se ha cumplido en las fechas acordadas, generando perjuicio a los niños. Solicito medidas para asegurar el cumplimiento.",
        iv_documents: "Sí",
        iv_no_tech: true,
      },

      "sworn-statement": {
        dj_date: today,
        dj_rit: "P-123-2026",
        dj_name: "Valentina Andrea Cárdenas Ríos",
        dj_rut: "19.222.333-4",
        dj_age: "29",
        dj_marital_status: "Soltera",
        dj_studies: "Educación superior incompleta",
        dj_profession: "Técnico en administración",
        dj_street: "Calle O’Higgins",
        dj_number: "120",
        dj_neighborhood: "Población Centro",
        dj_comuna: "Ancud",
        dj_city: "Ancud",
        dj_phone: "+56 9 8888 8888",
        dj_email: REQUESTER_EMAIL,
        dj_current_job: "Trabajadora dependiente",
        dj_monthly_income: "650000",
        dj_extra_income: "Apoyo familiar esporádico.",
        dj_real_estate: "No registra bienes inmuebles a su nombre.",
        dj_valuable_goods: "Electrodomésticos de uso doméstico.",
        dj_no_tech: true,
      },
    };

    return data[key] || null;
  }

  function resolveKey(btn) {
    const datasetKey = (btn?.dataset?.testProc || "").trim();
    const form = btn.closest("form");
    const formId = (form?.id || "").trim();

    // Si el HTML tiene un data-test-proc incorrecto, resolvemos por id del formulario.
    const byFormId = {
      "form-request-indicates": "request-indicates",
      "form-answer-transfer": "answer-transfer",
      "form-comply-ordered": "comply-ordered",
      "form-set-aside": "set-aside",
      "form-visits-noncompliance": "visits-noncompliance",
      "form-sworn-statement": "sworn-statement",
    };

    if (getTestDataByKey(datasetKey)) return datasetKey;
    if (byFormId[formId]) return byFormId[formId];
    return datasetKey || byFormId[formId] || "";
  }

  // Listener único para todos los botones de "Cargar datos de prueba"
  document.querySelectorAll("button[data-test-proc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = btn.closest("form");
      if (!form) return;

      const key = resolveKey(btn);
      const testData = getTestDataByKey(key);

      if (testData) {
        // 1) Setear todos los campos mapeados
        Object.entries(testData).forEach(([name, value]) => {
          const el = form.querySelector(`[name="${CSS.escape(name)}"]`);
          if (!el) return;

          if (el.type === "radio") {
            setRadio(form, name, value);
            return;
          }

          if (el.type === "checkbox") {
            setCheckbox(form, name, value);
            return;
          }

          setValue(form, name, value);
        });
      }

      // 2) Rellenar todo lo que haya quedado vacío
      fillAllRemainingFields(form);

      // 3) Subir al inicio del form y avisar por toast
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Datos de prueba cargados correctamente.");
    });
  });
}
