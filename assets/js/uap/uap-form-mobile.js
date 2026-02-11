/***************************************************
 * UAP MOBILE (QR)
 * - Funciones nuevas solo para versión móvil
 * - No modifica uap-form.js
 ***************************************************/

// Config mobile (variables en inglés)
const MOBILE_QR_LOCK_KEY = "uap_mobile_pdf_lock";
const MOBILE_QR_PROGRESS_KEY = "uap_mobile_pdf_progress";
const MOBILE_QR_SESSION_KEY = "uap_mobile_qr_session_id";

// Endpoint de Edge Function (debes crearla en Supabase)
const MOBILE_MAIL_FUNCTION_NAME = "send-uap-pdf";

/***************************************************
 * INIT MOBILE
 ***************************************************/
function initMobileUapPage() {
  // Genera/asegura sesión por QR (comentarios en español)
  ensureMobileQrSession();

  // Bindea botón móvil (si existe)
  bindMobileGenerateButton();

  // Bindea botón de datos de prueba (si existe)
  bindMobileTestDataButton();
}

/***************************************************
 * SESIÓN QR (1 envío)
 ***************************************************/
function ensureMobileQrSession() {
  // Si viene ?qr=xxxx, lo usamos como sesión estable
  const params = new URLSearchParams(window.location.search);
  const qrToken = (params.get("qr") || "").trim();

  if (qrToken) {
    sessionStorage.setItem(MOBILE_QR_SESSION_KEY, qrToken);
    return;
  }

  // Si no viene token, crea uno por sesión (suficiente para “un escaneo”)
  if (!sessionStorage.getItem(MOBILE_QR_SESSION_KEY)) {
    const generated = `qr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(MOBILE_QR_SESSION_KEY, generated);
  }
}

/***************************************************
 * UI BOTÓN
 ***************************************************/
function bindMobileGenerateButton() {
  const btn = document.getElementById("btn-generate-mobile");
  if (!btn) return;

  // Si ya está bloqueado, reflejar estado
  if (sessionStorage.getItem(MOBILE_QR_LOCK_KEY) === "1") {
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-check2-circle"></i> PDF enviado';
    return;
  }

  // Evitar listeners duplicados
  if (btn.dataset.mobileBound === "1") return;
  btn.dataset.mobileBound = "1";

  btn.addEventListener("click", () => {
    void handleGenerateAndSendPdfMobile();
  });
}

function bindMobileTestDataButton() {
  const btn = document.getElementById("btn-load-test-data-mobile");
  if (!btn) return;

  // Evitar listeners duplicados
  if (btn.dataset.testBound === "1") return;
  btn.dataset.testBound = "1";

  btn.addEventListener("click", () => {
    // Si no se ha elegido trámite, mostramos VIF para pruebas
    const form = document.getElementById("form-uap");
    const selection = document.getElementById("procedure-selection");

    if (selection && !selection.classList.contains("d-none")) {
      if (typeof startProcedure === "function") startProcedure("vif");
    } else if (form && form.classList.contains("d-none")) {
      if (typeof startProcedure === "function") startProcedure("vif");
    }

    // Espera 1 frame para asegurar que el DOM quede visible y listo
    requestAnimationFrame(() => {
      loadTestDataMobile();
      showCopyToast("Datos de prueba cargados.");
    });
  });
}

function loadTestDataMobile() {
  // Helper: asigna valor y dispara eventos para que cualquier lógica del form lo tome
  function setValueById(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function setValueByName(name, value) {
    const el = document.querySelector(`[name='${name}']`);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  /* ================= DENUNCIANTE ================= */
  setValueById("applicant_rut", "12.345.678-5"); // RUT válido
  setValueById("applicant_name", "Juan Carlos Pérez Soto");
  setValueByName(
    "applicant_address",
    "Avenida Libertador Bernardo O’Higgins 1234, Santiago",
  );

  /* ================= VÍCTIMA ================= */
  setValueById("victim_rut", "17.913.080-7"); // RUT válido
  setValueById("victim_name", "María Fernanda González Rojas");
  setValueByName("victim_address", "Pasaje Los Aromos 456, Santiago");

  /* ================= DENUNCIADO ================= */
  setValueById("accused_rut", "9.876.543-3"); // RUT válido
  setValueById("accused_name", "Carlos Alberto Ramírez Muñoz");
  setValueByName("accused_address", "Calle Los Álamos 789, Santiago");
}

/***************************************************
 * FUNCIÓN PRINCIPAL MOBILE
 ***************************************************/
async function handleGenerateAndSendPdfMobile() {
  const btn = document.getElementById("btn-generate-mobile");

  // 1) Bloqueo definitivo si ya envió
  //   if (sessionStorage.getItem(MOBILE_QR_LOCK_KEY) === "1") {
  //     showCopyToast("Este QR ya generó un PDF. No se permite enviar nuevamente.");
  //     if (btn) {
  //       btn.disabled = true;
  //       btn.innerHTML = '<i class="bi bi-check2-circle"></i> PDF enviado';
  //     }
  //     return;
  //   }

  // 2) Bloqueo anti doble click
  if (sessionStorage.getItem(MOBILE_QR_PROGRESS_KEY) === "1") {
    showCopyToast("Generación en curso... espere por favor.");
    return;
  }

  sessionStorage.setItem(MOBILE_QR_PROGRESS_KEY, "1");
  setMobileGenerateButtonState(true, "Generando...");

  try {
    // Usa tu función existente para crear blob según trámite (VIF/MP)
    if (typeof previewPdfForCurrentProcedure !== "function") {
      throw new Error("previewPdfForCurrentProcedure no está disponible.");
    }

    const { blob, procedureType } = await previewPdfForCurrentProcedure();

    // Guardar registro (funciones existentes)
    const recordId = await saveMobileRecord(procedureType);

    // Subir PDF al storage (función existente)
    const pdfPath = await uploadPdfToStorage(blob, recordId);

    // Actualizar registro con ruta (usa supabaseClient existente)
    await supabaseClient
      .from("uap_registros")
      .update({ pdf_path: pdfPath })
      .eq("id", recordId);

    // Enviar correo (Edge Function)
    await sendPdfByEmailMobile({
      pdfBlob: blob,
      procedureType,
      recordId,
      pdfPath,
    });

    // Bloqueo final (1 solo envío)
    // sessionStorage.setItem(MOBILE_QR_LOCK_KEY, "1");

    showCopyToast("PDF enviado correctamente.");
    setMobileGenerateButtonState(true, "Enviado", true);
  } catch (err) {
    console.error(err);
    showCopyToast("No se pudo generar/enviar el PDF. Intente con un nuevo QR.");
    setMobileGenerateButtonState(false, "Generar y enviar PDF");
  } finally {
    sessionStorage.removeItem(MOBILE_QR_PROGRESS_KEY);
  }
}

/***************************************************
 * GUARDADO MOBILE (reutiliza tus funciones existentes)
 ***************************************************/
async function saveMobileRecord(procedureType) {
  // Guarda con tus funciones existentes sin tocarlas
  if (procedureType === "mp") {
    if (typeof saveProtectionMeasureRecord !== "function") {
      throw new Error("saveProtectionMeasureRecord no está disponible.");
    }
    showCopyToast("Guardando registro...");
    return await saveProtectionMeasureRecord();
  }

  if (typeof saveRecord !== "function") {
    throw new Error("saveRecord no está disponible.");
  }

  showCopyToast("Guardando registro...");
  return await saveRecord();
}

/***************************************************
 * ENVÍO EMAIL MOBILE (Edge Function)
 ***************************************************/
async function sendPdfByEmailMobile({
  pdfBlob,
  procedureType,
  recordId,
  pdfPath,
}) {
  showCopyToast("Enviando correo...");

  const documentLabel =
    procedureType === "mp"
      ? "Medida de Protección (UAP)"
      : "Denuncia Violencia Intrafamiliar (UAP)";

  const subject =
    procedureType === "mp"
      ? `UAP Móvil - Medida de Protección - Registro #${recordId}`
      : `UAP Móvil - Denuncia VIF - Registro #${recordId}`;

  const fileName = `uap_${procedureType}_${recordId}.pdf`;

  // Comentarios en español:
  // - Para evitar mandar base64 (pesado), usamos el PDF ya subido a Storage.
  // - La Edge Function generará una URL firmada usando pdfPath.
  // - Si por alguna razón no viene pdfPath, intentamos subirlo aquí como respaldo.
  let finalPdfPath = pdfPath;

  if (!finalPdfPath) {
    if (typeof uploadPdfToStorage !== "function") {
      throw new Error(
        "uploadPdfToStorage no está disponible para subir el PDF.",
      );
    }
    showCopyToast("Subiendo PDF a almacenamiento...");
    finalPdfPath = await uploadPdfToStorage(pdfBlob, recordId);
  }

  const payload = {
    to: "l.tureop@gmail.com",
    subject,
    documentLabel,
    fileName,
    pdfPath: finalPdfPath, // ✅ en vez de pdfBase64
    qrSessionId: sessionStorage.getItem(MOBILE_QR_SESSION_KEY) || "",
  };

  const url = `${SUPABASE_URL}/functions/v1/${MOBILE_MAIL_FUNCTION_NAME}`;

  // Comentarios en español:
  // - Para Edge Functions el gateway espera un JWT (anon key) en Authorization Bearer.
  const anonJwt = window.SUPABASE_ANON_KEY;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonJwt,
      Authorization: `Bearer ${anonJwt}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Edge Function error: ${res.status} ${txt}`);
  }

  const json = await res.json().catch(() => ({}));
  if (!json?.ok) throw new Error("No se pudo enviar el correo.");
}

/***************************************************
 * HELPERS MOBILE
 ***************************************************/
function setMobileGenerateButtonState(disabled, label, isSuccess = false) {
  const btn = document.getElementById("btn-generate-mobile");
  if (!btn) return;

  btn.disabled = disabled;

  if (isSuccess) {
    btn.innerHTML = '<i class="bi bi-check2-circle"></i> PDF enviado';
    return;
  }

  if (disabled) {
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2"></span> ' +
      (label || "Procesando...");
  } else {
    btn.innerHTML =
      '<i class="bi bi-file-earmark-pdf"></i> ' +
      (label || "Generar y enviar PDF");
  }
}

function blobToBase64Clean(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el PDF."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const cleaned = result.includes(",") ? result.split(",")[1] : result;
      resolve(cleaned);
    };
    reader.readAsDataURL(blob);
  });
}

/***************************************************
 * AUTO INIT
 ***************************************************/
document.addEventListener("DOMContentLoaded", () => {
  initMobileUapPage();
});
