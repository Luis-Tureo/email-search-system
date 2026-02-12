/***************************************************
 * UAP MOBILE (QR) - PRIVACIDAD
 * - Mobile 100%: NO muestra PDF, SOLO envía por correo
 * - NO guarda registros (sin uap_registros, sin Storage, sin supabase update)
 * - Envía PDF como base64 a Edge Function
 ***************************************************/

// Anti doble click / progreso
const MOBILE_QR_PROGRESS_KEY = "uap_mobile_pdf_progress";
const MOBILE_QR_SESSION_KEY = "uap_mobile_qr_session_id";

// Trámite seleccionado (fuente de verdad mobile)
const MOBILE_SELECTED_PROCEDURE_KEY = "uap_mobile_selected_procedure"; // 'vif' | 'mp'

// Edge Function (Supabase)
const MOBILE_MAIL_FUNCTION_NAME = "send-uap-pdf";

/***************************************************
 * INIT MOBILE
 ***************************************************/
function initMobileUapPage() {
  ensureMobileQrSession();
  bindProcedureSelectionHooks(); // ✅ primero: enganchar selección
  bindMobileGenerateButton(); // abre modal
  bindMobileTestDataButton();
}

/***************************************************
 * SESIÓN QR (opcional)
 ***************************************************/
function ensureMobileQrSession() {
  const params = new URLSearchParams(window.location.search);
  const qrToken = (params.get("qr") || "").trim();

  if (qrToken) {
    sessionStorage.setItem(MOBILE_QR_SESSION_KEY, qrToken);
    return;
  }

  if (!sessionStorage.getItem(MOBILE_QR_SESSION_KEY)) {
    const generated = `qr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(MOBILE_QR_SESSION_KEY, generated);
  }
}

/***************************************************
 * HOOKS: guardar trámite cuando el usuario elige VIF/MP
 ***************************************************/
function bindProcedureSelectionHooks() {
  if (window.__uapMobileHooksBound) return;
  window.__uapMobileHooksBound = true;

  // startProcedure('vif')
  if (typeof window.startProcedure === "function") {
    const originalStartProcedure = window.startProcedure;
    window.startProcedure = function (type) {
      try {
        if (type === "vif" || type === "mp") {
          sessionStorage.setItem(MOBILE_SELECTED_PROCEDURE_KEY, type);
          if (window.formState) window.formState.procedureType = type;
        }
      } catch (_) {}
      return originalStartProcedure.apply(this, arguments);
    };
  }

  // startProtectionMeasureProcedure() -> mp
  if (typeof window.startProtectionMeasureProcedure === "function") {
    const originalStartMP = window.startProtectionMeasureProcedure;
    window.startProtectionMeasureProcedure = function () {
      try {
        sessionStorage.setItem(MOBILE_SELECTED_PROCEDURE_KEY, "mp");
        if (window.formState) window.formState.procedureType = "mp";
      } catch (_) {}
      return originalStartMP.apply(this, arguments);
    };
  }
}

/***************************************************
 * BOTÓN MOBILE: ABRE MODAL (NO ENVÍA)
 ***************************************************/
function bindMobileGenerateButton() {
  const btn = document.getElementById("btn-generate-mobile");
  if (!btn) return;

  if (btn.dataset.mobileBound === "1") return;
  btn.dataset.mobileBound = "1";

  btn.addEventListener("click", () => {
    const modalEl = document.getElementById("sendConfirmModal");
    if (!modalEl) {
      safeToast("Falta el modal de confirmación (sendConfirmModal).");
      return;
    }
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  });
}

/***************************************************
 * BOTÓN DATOS DE PRUEBA (MOBILE)
 * - OJO: esperamos 2 frames para que initActivitySelects convierta input->select
 ***************************************************/
function bindMobileTestDataButton() {
  const btn = document.getElementById("btn-load-test-data-mobile");
  if (!btn) return;

  if (btn.dataset.testBound === "1") return;
  btn.dataset.testBound = "1";

  btn.addEventListener("click", () => {
    sessionStorage.setItem(MOBILE_SELECTED_PROCEDURE_KEY, "vif");
    if (window.formState) window.formState.procedureType = "vif";

    if (typeof startProcedure === "function") startProcedure("vif");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        loadTestDataMobile();
        safeToast("Datos de prueba cargados.");
      });
    });
  });
}

function loadTestDataMobile() {
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

  // ✅ funciona si actividad es input o select
  function setActivity(name, value) {
    const el = document.querySelector(`[name='${name}']`);
    if (!el) return false;

    if (el.tagName === "SELECT") {
      const opt = Array.from(el.options).find(
        (o) => o.value === value || o.text === value,
      );
      el.value = opt ? opt.value : value;
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  /* DENUNCIANTE */
  setValueById("applicant_rut", "12.345.678-5");
  setValueById("applicant_name", "Juan Carlos Pérez Soto");
  setValueByName("applicant_phone", "+56 9 1234 5678");
  setValueByName("applicant_email", "juan.perez@correo.cl");
  setValueByName("applicant_address", "Av. Bernardo O’Higgins 1234, Santiago");
  setActivity("applicant_activity", "Trabajador/a dependiente");
  setValueByName("notification_authorized_method", "Correo electrónico");

  /* VÍCTIMA */
  setValueById("victim_rut", "17.913.080-7");
  setValueById("victim_name", "María Fernanda González Rojas");
  setValueByName("victim_birthdate", "2010-05-14");
  setValueByName("victim_age", "15");
  setValueByName("victim_phone", "+56 9 8765 4321");
  setValueByName("victim_email", "victima@correo.cl");
  setValueByName("victim_address", "Pasaje Los Aromos 456, Santiago");
  setActivity("victim_activity", "Estudiante");

  /* DENUNCIADO */
  setValueById("accused_rut", "9.876.543-3");
  setValueById("accused_name", "Carlos Alberto Ramírez Muñoz");
  setValueByName("accused_phone", "+56 9 1111 2222");
  setValueByName("accused_email", "denunciado@correo.cl");
  setValueByName("accused_address", "Calle Los Álamos 789, Santiago");
  setActivity("accused_activity", "Trabajador/a independiente");
  setValueByName("relationship", "Padre");
}

/***************************************************
 * BOTÓN "ENVIAR AHORA" DEL MODAL
 ***************************************************/
function confirmSendMobilePdf() {
  const modalEl = document.getElementById("sendConfirmModal");
  const modal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
  if (modal) modal.hide();

  void handleGenerateAndSendPdfMobile();
}

/***************************************************
 * FUNCIÓN PRINCIPAL MOBILE (SIN GUARDAR NADA)
 ***************************************************/
async function handleGenerateAndSendPdfMobile() {
  const fromFormState = window.formState?.procedureType;
  const fromStorage = sessionStorage.getItem(MOBILE_SELECTED_PROCEDURE_KEY);
  const selected = fromFormState || fromStorage;

  if (selected !== "vif" && selected !== "mp") {
    safeToast("Primero elija un trámite (VIF o Medida de Protección).");
    return;
  }

  if (window.formState) window.formState.procedureType = selected;

  if (sessionStorage.getItem(MOBILE_QR_PROGRESS_KEY) === "1") {
    safeToast("Generación en curso... espere por favor.");
    return;
  }

  sessionStorage.setItem(MOBILE_QR_PROGRESS_KEY, "1");
  setMobileGenerateButtonState(true, "Generando...");

  try {
    if (typeof previewPdfForCurrentProcedure !== "function") {
      throw new Error("previewPdfForCurrentProcedure no está disponible.");
    }

    const { blob, procedureType } = await previewPdfForCurrentProcedure();
    const finalType = procedureType || selected;

    await sendPdfByEmailMobile({ pdfBlob: blob, procedureType: finalType });

    safeToast("PDF enviado correctamente.");
    setMobileGenerateButtonState(true, "PDF enviado", true);
  } catch (err) {
    console.error(err);
    safeToast("No se pudo enviar el PDF. Intente nuevamente.");
    setMobileGenerateButtonState(false, "Generar y enviar PDF");
  } finally {
    sessionStorage.removeItem(MOBILE_QR_PROGRESS_KEY);
  }
}

/***************************************************
 * ENVÍO EMAIL MOBILE (Edge Function) - base64
 ***************************************************/
async function sendPdfByEmailMobile({ pdfBlob, procedureType }) {
  safeToast("Preparando envío...");

  const documentLabel =
    procedureType === "mp"
      ? "Medida de Protección (UAP)"
      : "Denuncia Violencia Intrafamiliar (UAP)";

  const subject =
    procedureType === "mp"
      ? "UAP Móvil - Medida de Protección"
      : "UAP Móvil - Denuncia VIF";

  const fileName = `uap_${procedureType}_${Date.now()}.pdf`;
  const pdfBase64 = await blobToBase64Clean(pdfBlob);

  const payload = {
    to: "l.tureop@gmail.com",
    subject,
    documentLabel,
    fileName,
    pdfBase64,
    qrSessionId: sessionStorage.getItem(MOBILE_QR_SESSION_KEY) || "",
  };

  const url = `${window.SUPABASE_URL}/functions/v1/${MOBILE_MAIL_FUNCTION_NAME}`;
  const anonJwt = window.SUPABASE_ANON_KEY;

  safeToast("Enviando correo...");

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
  if (!json?.ok) throw new Error("La función de correo respondió sin ok.");
}

/***************************************************
 * HELPERS
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

function safeToast(msg) {
  if (typeof showCopyToast === "function") showCopyToast(msg);
  else alert(msg);
}

/***************************************************
 * AUTO INIT
 ***************************************************/
document.addEventListener("DOMContentLoaded", () => {
  initMobileUapPage();
});
