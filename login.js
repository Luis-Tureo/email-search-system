/* =====================================================
   LOGIN (INDEX)
   - Si login OK y rol admin -> abre búsqueda
   ===================================================== */

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

document.addEventListener("DOMContentLoaded", () => {
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

  // Comentario en español:
  // Si ya hay sesión, redirige directo a búsqueda
  if (sessionStorage.getItem("logged") === "true") {
    window.location.href = "/pages/core/email-search.html";
  }
});

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

    // Solo muestra "Acceso restringido" si la contraseña NO es admin2026 ni user2026
    if (error || !data || data.length === 0) {
      errorMsg.textContent = "Acceso restringido";
      errorMsg.classList.remove("d-none");
      return;
    }

    // Oculta mensaje si estaba visible
    errorMsg.classList.add("d-none");
    errorMsg.textContent = "Acceso restringido";

    // Guardar sesión
    sessionStorage.setItem("logged", "true");
    sessionStorage.setItem("role", data[0].role);

    // Admin y User entran al sistema de búsqueda
    window.location.href = "/pages/institution-system/email-search.html";
  } catch (err) {
    console.error(err);
    errorMsg.textContent = "Acceso restringido";
    errorMsg.classList.remove("d-none");
  } finally {
    btn.disabled = false;
  }
}
