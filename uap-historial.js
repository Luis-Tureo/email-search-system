const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

// =====================================================
// SUPABASE CLIENT
// =====================================================
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);


let records = [];

/***************************************************
 * CARGA DE DATOS
 ***************************************************/
async function loadHistory() {
  const { data, error } = await supabase
    .from('uap_registros')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    alert('Error al cargar historial');
    return;
  }

  records = data;
  renderTable(records);
}

/***************************************************
 * RENDER TABLA
 ***************************************************/
function renderTable(data) {
  const tbody = document.getElementById('historyTable');
  tbody.innerHTML = '';

  data.forEach(record => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${new Date(record.created_at).toLocaleDateString()}</td>
      <td>${record.tipo_tramite.toUpperCase()}</td>
      <td>${record.datos.applicant_rut || ''}</td>
      <td>${record.datos.applicant_name || ''}</td>
      <td class="${record.estado === 'revisado' ? 'mode-read' : 'mode-admin'}">
        ${record.estado}
      </td>
      <td class="col-center">
        <span class="file-link" onclick="viewPdf('${record.id}')">
          Ver
        </span>
      </td>
      <td class="col-center">
        ${record.estado === 'confirmado'
          ? `<button class="btn btn-success btn-sm"
                     onclick="markAsReviewed('${record.id}')">
               Revisar
             </button>`
          : ''}
      </td>
    `;

    tbody.appendChild(tr);
  });

  document.getElementById('counter').textContent =
    `Total registros: ${data.length}`;
}

/***************************************************
 * FILTROS
 ***************************************************/
function applyFilters() {
  const text = document.getElementById('searchInput').value.toLowerCase();
  const type = document.getElementById('typeFilter').value;
  const status = document.getElementById('statusFilter').value;

  const filtered = records.filter(r => {
    const matchText =
      r.datos.applicant_name?.toLowerCase().includes(text) ||
      r.datos.applicant_rut?.includes(text);

    const matchType = !type || r.tipo_tramite === type;
    const matchStatus = !status || r.estado === status;

    return matchText && matchType && matchStatus;
  });

  renderTable(filtered);
}

/***************************************************
 * MARCAR COMO REVISADO
 ***************************************************/
async function markAsReviewed(id) {
  if (!confirm('¿Marcar este registro como revisado?')) return;

  const { error } = await supabase
    .from('uap_registros')
    .update({
      estado: 'revisado',
      revisado_at: new Date(),
      revisado_por: 'usuario_actual'
    })
    .eq('id', id);

  if (error) {
    alert('No se pudo marcar como revisado');
    return;
  }

  loadHistory();
}

/***************************************************
 * VER PDF
 ***************************************************/
async function viewPdf(id, path) {
  const { data, error } = await supabase
    .storage
    .from('uap-pdf')
    .createSignedUrl(path, 60); // 60 segundos

  if (error) {
    alert('No se pudo abrir el PDF');
    return;
  }

  window.open(data.signedUrl, '_blank');
}


/***************************************************
 * EVENTOS
 ***************************************************/
document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('typeFilter').addEventListener('change', applyFilters);
document.getElementById('statusFilter').addEventListener('change', applyFilters);

document.getElementById('btn-clear-filters').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('typeFilter').value = '';
  document.getElementById('statusFilter').value = '';
  renderTable(records);
});

document.addEventListener('DOMContentLoaded', loadHistory);
