const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

// =====================================================
// SUPABASE CLIENT
// =====================================================
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

document.getElementById('btnGenerate').addEventListener('click', loadReport);

async function loadReport() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  if (!startDate || !endDate) {
    alert('Debe seleccionar ambas fechas');
    return;
  }

  const { data, error } = await supabase
    .from('uap_registros')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (error) {
    alert('Error al generar reporte');
    return;
  }

  renderSummary(data);
  renderTable(data);
}

/***************************************************
 * RESUMEN
 ***************************************************/
function renderSummary(records) {

  document.getElementById('totalCount').textContent = records.length;

  const byType = records.reduce((acc, r) => {
    acc[r.tipo_tramite] = (acc[r.tipo_tramite] || 0) + 1;
    return acc;
  }, {});

  const byStatus = records.reduce((acc, r) => {
    acc[r.estado] = (acc[r.estado] || 0) + 1;
    return acc;
  }, {});

  document.getElementById('countVif').textContent = byType.vif || 0;
  document.getElementById('countMp').textContent = byType.mp || 0;
  document.getElementById('countConfirmed').textContent = byStatus.confirmado || 0;
  document.getElementById('countReviewed').textContent = byStatus.revisado || 0;
}

/***************************************************
 * TABLA
 ***************************************************/
function renderTable(records) {
  const tbody = document.getElementById('reportTable');
  tbody.innerHTML = '';

  records.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${r.tipo_tramite.toUpperCase()}</td>
      <td>${r.datos.applicant_rut || ''}</td>
      <td>${r.datos.applicant_name || ''}</td>
      <td>${r.estado}</td>
    `;
    tbody.appendChild(tr);
  });
}
