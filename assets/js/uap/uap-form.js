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

/***************************************************
 * INICIO DEL FLUJO (VIF / MP)
 ***************************************************/
function startProcedure(type) {
  formState.procedureType = type;

  document.getElementById("procedure-selection")?.classList.add("d-none");
  document.getElementById("form-uap")?.classList.remove("d-none");

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
    alert("Debe seleccionar el tipo de trámite.");
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

  if (error) throw error;
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
    .upload(path, blob, { contentType: "application/pdf" });

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

async function generatePdfAndStore(recordId) {
  const data = collectFormData();

  const today = new Date().toLocaleDateString("es-CL");

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
        text: "DENUNCIA VIOLENCIA INTRAFAMILIAR",
        alignment: "center",
        bold: true,
        margin: [0, 20, 0, 10],
      },

      buildPersonTable("DENUNCIANTE", {
        Nombre: data.applicant_name,
        RUN: data.applicant_rut,
        Domicilio: data.applicant_address,
        Celular: data.applicant_phone,
        Correo: data.applicant_email,
      }),

      buildPersonTable("VÍCTIMA", {
        Nombre: data.victim_name,
        RUN: data.victim_rut,
        Domicilio: data.victim_address,
      }),

      buildPersonTable("DENUNCIADA", {
        Nombre: data.accused_name,
        RUN: data.accused_rut,
        Domicilio: data.accused_address,
      }),

      {
        columns: [
          {
            width: "50%",
            stack: [
              {
                text: "_______________________________",
                alignment: "center",
              },
              {
                text: "DENUNCIANTE",
                bold: true,
                alignment: "center",
                margin: [0, 5, 0, 0],
              },
            ],
          },
          {
            width: "50%",
            stack: [
              {
                text: "_______________________________",
                alignment: "center",
              },
              {
                text: "REVISADO POR",
                bold: true,
                alignment: "center",
                margin: [0, 5, 0, 0],
              },
            ],
          },
        ],
        margin: [0, 25, 0, 10],
      },

      {
        text: `FECHA: ${new Date().toLocaleDateString("es-CL")}`,
        alignment: "center",
        margin: [0, 10, 0, 0],
      },
    ],
    defaultStyle: { fontSize: 12 },
  };

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
  });
}

/***************************************************
 * EVENTOS
 ***************************************************/
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".btn-search-rut").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const rutInput = document.getElementById(btn.dataset.rutInput);
      const nameInput = document.getElementById(btn.dataset.nameInput);

      if (!rutInput || !nameInput) return;

      if (!validateRut(rutInput.value)) {
        alert("RUT inválido");
        return;
      }

      const result = await autocompletePerson(rutInput.value);
      if (result?.applicant_name) nameInput.value = result.applicant_name;
    });
  });
});

/***************************************************
 * DATOS DE PRUEBA
 ***************************************************/
function loadTestData() {
  /* ================= DENUNCIANTE ================= */
  document.getElementById("applicant_rut").value = "12.345.678-5";
  document.getElementById("applicant_name").value = "Juan Carlos Pérez Soto";
  document.querySelector("[name='applicant_activity']").value =
    "Funcionario Público";
  document.querySelector("[name='applicant_address']").value =
    "Avenida Libertador Bernardo O’Higgins 1234, Santiago";
  document.querySelector("[name='applicant_phone']").value = "+56 9 1234 5678";
  document.querySelector("[name='applicant_email']").value =
    "juan.perez@correo.cl";

  /* ================= VÍCTIMA / NNA ================= */
  document.getElementById("victim_rut").value = "17.654.321-0";
  document.getElementById("victim_name").value =
    "María Fernanda González Rojas";
  document.querySelector("[name='victim_age']").value = 14;
  document.querySelector("[name='victim_schooling']").value = "8° Básico";
  document.querySelector("[name='victim_address']").value =
    "Pasaje Los Aromos 456, Santiago";

  /* ================= DENUNCIADO ================= */
  document.getElementById("accused_rut").value = "9.876.543-3";
  document.getElementById("accused_name").value =
    "Carlos Alberto Ramírez Muñoz";
  document.querySelector("[name='accused_activity']").value =
    "Trabajador independiente";
  document.querySelector("[name='relationship']").value = "Padre";
  document.querySelector("[name='accused_address']").value =
    "Calle Los Álamos 789, Santiago";

  console.log("Datos de prueba cargados");
}

function goToStart() {
  // Oculta formulario
  document.getElementById("form-uap")?.classList.add("d-none");

  // Muestra selección inicial
  document.getElementById("procedure-selection")?.classList.remove("d-none");

  // Resetea estado
  formState.procedureType = null;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearForm() {
  if (!confirm("¿Está seguro de borrar todos los datos del formulario?")) return;

  const form = document.getElementById("form-uap");
  if (!form) return;

  form.reset();

  // Limpia inputs manuales por seguridad
  form.querySelectorAll("input, textarea, select").forEach(el => {
    if (el.type !== "button" && el.type !== "submit") {
      el.value = "";
    }
  });

  console.log("Formulario limpiado");
}

