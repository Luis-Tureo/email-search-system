/***************************************************
 * UAP CONFIG CORREO (QR)
 * - Página para cambiar el correo destino del envío móvil
 * - Usa mismo login (system_credentials) que el index principal
 ***************************************************/

// Claves (variables en inglés)
const STORAGE_NOTIFY_EMAIL_KEY = "uap_mobile_notify_email";

// Supabase (igual que el sistema)
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

/***************************************************
 * INIT
 ***************************************************/
document.addEventListener("DOMContentLoaded", () => {
  bindLoginHandlers();
  bindConfigHandlers();

  // Estado login (igual patrón)
  const loginScreen = document.getElementById("login-screen");
  const appContent = document.getElementById("app-content");

  if (sessionStorage.getItem("logged") === "true") {
    loginScreen.classList.add("d-none");
    appContent.classList.remove("d-none");
    loadNotifyEmailIntoInput();
  } else {
    loginScreen.classList.remove("d-none");
    appContent.classList.add("d-none");
  }
});

/***************************************************
 * LOGIN (misma lógica que app.js pero aislado)
 ***************************************************/
function bindLoginHandlers() {
  const passInput = document.getElementById("login-password");
  const loginBtn = document.getElementById("btn-login");

  passInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void doLogin();
    }
  });

  passInput?.addEventListener("input", () => {
    document.getElementById("login-error")?.classList.add("d-none");
  });

  loginBtn?.addEventListener("click", () => void doLogin());

  document.getElementById("logout-link")?.addEventListener("click", logout);
}

// ✅ FUNCIÓN A AGREGAR/MANTENER COMPLETA AQUÍ
async function doLogin() {
  const btn = document.getElementById("btn-login");
  const errorMsg = document.getElementById("login-error");
  const pass = document.getElementById("login-password").value.trim();

  btn.disabled = true;

  try {
    const { data, error } = await supabaseClient
      .from("system_credentials")
      .select("password_hash, role")
      .eq("active", true)
      .eq("password_hash", pass) // aquí valida contra admin2026 (si está activo en la tabla)
      .limit(1);

    if (error || !data || data.length === 0) {
      errorMsg.classList.remove("d-none");
      return;
    }

    sessionStorage.setItem("logged", "true");
    sessionStorage.setItem("role", data[0].role || "admin");

    showApp();
    loadNotifyEmailIntoInput();
    safeToast("Acceso autorizado.");
  } catch (err) {
    console.error(err);
    errorMsg.classList.remove("d-none");
  } finally {
    btn.disabled = false;
  }
}

function showApp() {
  const loginScreen = document.getElementById("login-screen");
  const appContent = document.getElementById("app-content");
  loginScreen.classList.add("d-none");
  appContent.classList.remove("d-none");
}

function logout() {
  sessionStorage.removeItem("logged");
  sessionStorage.removeItem("role");

  const passInput = document.getElementById("login-password");
  if (passInput) passInput.value = "";

  document.getElementById("login-error")?.classList.add("d-none");

  document.getElementById("login-screen")?.classList.remove("d-none");
  document.getElementById("app-content")?.classList.add("d-none");
}

/***************************************************
 * CONFIG CORREO
 ***************************************************/
function bindConfigHandlers() {
  document.getElementById("btn-save-email")?.addEventListener("click", saveNotifyEmailFromInput);
  document.getElementById("btn-reset-email")?.addEventListener("click", resetNotifyEmail);
}

// ✅ FUNCIÓN A AGREGAR/MANTENER COMPLETA AQUÍ
function loadNotifyEmailIntoInput() {
  const input = document.getElementById("notify-email");
  if (!input) return;

  const saved = (localStorage.getItem(STORAGE_NOTIFY_EMAIL_KEY) || "").trim();
  input.value = saved;
}

// ✅ FUNCIÓN A AGREGAR/MANTENER COMPLETA AQUÍ
function saveNotifyEmailFromInput() {
  const input = document.getElementById("notify-email");
  const raw = (input?.value || "").trim();

  if (!raw) {
    safeToast("Ingrese un correo válido.");
    return;
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  if (!isValidEmail) {
    safeToast("Formato de correo inválido.");
    return;
  }

  localStorage.setItem(STORAGE_NOTIFY_EMAIL_KEY, raw);
  safeToast("Correo guardado correctamente.");
}

// ✅ FUNCIÓN A AGREGAR/MANTENER COMPLETA AQUÍ
function resetNotifyEmail() {
  localStorage.removeItem(STORAGE_NOTIFY_EMAIL_KEY);

  const input = document.getElementById("notify-email");
  if (input) input.value = "";

  safeToast("Se restauró el correo por defecto.");
}

/***************************************************
 * TOAST (sin alert nativo)
 ***************************************************/
function safeToast(msg) {
  if (typeof showCopyToast === "function") {
    showCopyToast(msg);
    return;
  }

  // Toast propio mínimo usando el div #toast-copiar
  const toast = document.getElementById("toast-copiar");
  if (!toast) {
    console.log("[TOAST]", msg);
    return;
  }

  toast.textContent = msg;
  toast.classList.add("show");

  clearTimeout(window.__uapToastTimer);
  window.__uapToastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}
