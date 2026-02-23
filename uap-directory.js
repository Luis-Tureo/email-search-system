/***************************************************
 * DIRECTORIO PJUD ANCUD / CASTRO
 * - Variables en inglés
 * - Comentarios en español
 * - Solo toast
 ***************************************************/

const contactsData = [
  {
    id: 1,
    name: "Fiscalía Local de Ancud",
    city: "Ancud",
    type: "Justicia",
    address: "Calle Del Estadio N° 66, Ancud",
    phones: ["65-2626704"],
    emails: [],
    hours: ["Lunes a viernes: 08:00 a 13:00 horas"],
    notes: "Ministerio Público",
  },

  {
    id: 2,
    name: "Corporación de Asistencia Judicial de Ancud",
    city: "Ancud",
    type: "Justicia",
    address: "Calle Aníbal Pinto N° 312, 2° piso, Ancud",
    phones: ["65-2622124"],
    emails: [],
    hours: [],
    notes: "",
  },

  {
    id: 3,
    name: "Juzgado de Familia de Ancud",
    city: "Ancud",
    type: "Justicia",
    address: "Calle Pudeto N° 201, Ancud",
    phones: ["65-2626424", "65-2626425", "65-2626426"],
    emails: ["jfancud@pjud.cl"],
    hours: [
      "Lunes a viernes: 08:00 a 14:00 horas",
      "Sábado: 09:00 a 12:00 horas",
    ],
    notes: "",
  },

  {
    id: 4,
    name: "Programa PROYECTA",
    city: "Ancud",
    type: "Protección",
    address: "Calle Aníbal Pinto N° 355, Ancud",
    phones: ["65-2621710"],
    emails: ["proyectaancud@gmail.com"],
    hours: [
      "Lunes a jueves: 09:00 a 13:00 / 14:30 a 17:30",
      "Viernes: 09:00 a 13:00 / 14:30 a 16:30",
    ],
    notes: "Acompañamiento a la Niñez y Adolescencia",
  },

  {
    id: 5,
    name: "Centro de las Mujeres SERNAMEG",
    city: "Castro",
    type: "SERNAMEG",
    address: "Sotomayor 461 A (Interior), Castro",
    phones: [],
    emails: [],
    hours: [
      "Lunes a jueves: 08:30 a 13:30 / 14:30 a 17:30",
      "Viernes: 08:30 a 13:30 / 14:30 a 16:30",
    ],
    notes: "",
  },

  {
    id: 6,
    name: "OLN Ancud (Oficina Local de la Niñez)",
    city: "Ancud",
    type: "Protección",
    address: "Galvarino Riveros 20, 2° piso, Ancud",
    phones: [],
    emails: [],
    hours: [
      "Lunes a jueves: 09:00 a 13:00 / 14:30 a 17:30",
      "Viernes: 09:00 a 13:00 / 14:30 a 16:30",
    ],
    notes: "",
  },

  {
    id: 7,
    name: "DESAM Ancud",
    city: "Ancud",
    type: "Municipal",
    address: "Yerbas Buenas N° 915, 2° piso, Ancud",
    phones: ["981467696"],
    emails: [],
    hours: ["Lunes a viernes: 08:00 a 13:00 / 14:00 a 18:30"],
    notes: "Departamento de Salud Municipal",
  },

  {
    id: 8,
    name: "PIE Ciudad del Niño Castro",
    city: "Castro",
    type: "Protección",
    address: "Calle Linao N° 48, Castro",
    phones: ["652623209"],
    emails: ["directoracastro@ciudaddelnino.cl"],
    hours: ["Lunes a viernes: 09:00 a 13:00 / 14:00 a 18:00"],
    notes: "",
  },

  {
    id: 9,
    name: "Mediador Familiar",
    city: "Ancud",
    type: "Justicia",
    address: "Calle San Carlos N° 59, Ancud",
    phones: ["65-2620246"],
    emails: [],
    hours: ["Lunes a viernes: 15:00 a 18:00 horas"],
    notes: "Asesorías Disputar y Mediación",
  },
];

/***************************************************
 * TOAST
 ***************************************************/
let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById("toast-copiar");
  if (!toast) return;

  toast.textContent = message || "Listo";
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

/***************************************************
 * UTILIDADES
 ***************************************************/
function normalizeText(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copiado al portapapeles");
  } catch {
    showToast("No se pudo copiar");
  }
}

/***************************************************
 * RENDER
 ***************************************************/
function buildContactCard(contact) {
  const copyText = [contact.name, contact.address, contact.phones.join(" / ")]
    .filter(Boolean)
    .join(" | ");

  return `
    <div class="uap-mobile-card">
      <div class="d-flex justify-content-between align-items-start">

        <div>
          <div class="fw-bold">${contact.name}</div>
          <div class="text-muted small">${contact.city} · ${contact.type}</div>
        </div>

        <button class="btn btn-sm btn-primary"
                onclick="copyToClipboard('${copyText}')">
          <i class="bi bi-clipboard"></i>
        </button>

      </div>

      <hr class="uap-divider">

      <div><strong>Dirección:</strong> ${contact.address}</div>

      ${
        contact.phones.length
          ? `<div><strong>Teléfono:</strong> ${contact.phones.join(" / ")}</div>`
          : ""
      }

      ${
        contact.emails.length
          ? `<div><strong>Correo:</strong> ${contact.emails.join(" / ")}</div>`
          : ""
      }

      ${
        contact.hours.length
          ? `<div class="mt-2"><strong>Horario:</strong>
            <ul class="mb-0">
              ${contact.hours.map((h) => `<li>${h}</li>`).join("")}
            </ul>
           </div>`
          : ""
      }

      ${
        contact.notes
          ? `<div class="mt-2 text-muted">${contact.notes}</div>`
          : ""
      }
    </div>
  `;
}

function renderContacts(list) {
  const container = document.getElementById("cardsContainer");
  const counter = document.getElementById("resultsCounter");

  container.innerHTML = list.map(buildContactCard).join("");
  counter.textContent = `Registros encontrados: ${list.length}`;
}

/***************************************************
 * FILTROS
 ***************************************************/
function applyFilters() {
  const text = normalizeText(document.getElementById("searchInput").value);
  const city = document.getElementById("cityFilter").value;
  const type = document.getElementById("typeFilter").value;

  const filtered = contactsData.filter((c) => {
    const haystack = normalizeText(
      [
        c.name,
        c.city,
        c.type,
        c.address,
        ...c.phones,
        ...c.emails,
        ...c.hours,
      ].join(" "),
    );

    return (
      (!text || haystack.includes(text)) &&
      (!city || c.city === city) &&
      (!type || c.type === type)
    );
  });

  renderContacts(filtered);
}

/***************************************************
 * INIT
 ***************************************************/
function initDirectoryPage() {
  document
    .getElementById("searchInput")
    .addEventListener("input", applyFilters);

  document
    .getElementById("cityFilter")
    .addEventListener("change", applyFilters);

  document
    .getElementById("typeFilter")
    .addEventListener("change", applyFilters);

  renderContacts(contactsData);
}

document.addEventListener("DOMContentLoaded", initDirectoryPage);
