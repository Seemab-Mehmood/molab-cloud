const ADMIN_API = window.__ADMIN_API_BASE__;

async function adminRequest(method, path, body){
  const res = await fetch(ADMIN_API + path, {
    method,
    headers: body ? {'Content-Type':'application/json'} : undefined,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch(e){}
  if(!res.ok){ const err = new Error((data&&data.error)||`Request failed (${res.status})`); err.status=res.status; throw err; }
  return data;
}

async function adminLogin(){
  const errEl = document.getElementById('al_error'); errEl.classList.add('hidden');
  try {
    await adminRequest('POST','/login', {
      email: document.getElementById('al_email').value.trim(),
      password: document.getElementById('al_pass').value,
    });
    showApp();
  } catch(e){
    errEl.innerText = e.message; errEl.classList.remove('hidden');
  }
}
async function adminLogout(){
  await adminRequest('POST','/logout');
  location.reload();
}

function showApp(){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  document.getElementById('appScreen').style.display='flex';
  document.getElementById('topRight').innerHTML = `<button class="btn btn-ghost" onclick="adminLogout()">Log Out</button>`;
  gotoAdminView('overview');
}

document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>gotoAdminView(btn.dataset.view));
});
function gotoAdminView(name){
  document.querySelectorAll('.adminview').forEach(v=>v.classList.add('hidden'));
  document.getElementById('view-'+name).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add('active');
  if(name==='overview') loadOverview();
  if(name==='hospitals') loadHospitals();
  if(name==='patients') loadPatients();
  if(name==='audit') loadAudit();
}

async function loadOverview(){
  const o = await adminRequest('GET','/overview');
  document.getElementById('oTotal').innerText = o.total;
  document.getElementById('oApproved').innerText = o.approved;
  document.getElementById('oPending').innerText = o.pending;
  document.getElementById('oPatients').innerText = o.totalPatients;
}

function statusPill(status){
  const cls = status==='approved' ? 'ok' : status==='pending' ? 'warn' : 'bad';
  return `<span class="pill ${cls}">${status}</span>`;
}

let allHospitals = [];
async function loadHospitals(){
  const { hospitals } = await adminRequest('GET','/hospitals');
  allHospitals = hospitals;
  renderHospitals();
}
function renderHospitals(){
  const q = (document.getElementById('hSearch').value||'').toLowerCase();
  const tbody = document.getElementById('hospitalsBody');
  tbody.innerHTML = allHospitals
    .filter(h => h.name.toLowerCase().includes(q) || h.city.toLowerCase().includes(q) || h.country.toLowerCase().includes(q))
    .map(h => `
      <tr>
        <td>${h.name}</td>
        <td class="font-mono notice-text">${h.country}</td>
        <td class="font-mono notice-text">${h.city} · ${h.type}</td>
        <td>${h.repName}<br><span class="notice-text" style="font-size:10px;">${h.repEmail}</span></td>
        <td>${h.emailVerified ? '<span class="pill ok">verified</span>' : '<span class="pill warn">unverified</span>'}</td>
        <td>${statusPill(h.status)}</td>
        <td>${h.patientCount}</td>
        <td style="text-align:right; white-space:nowrap;">
          ${h.status!=='approved' ? `<button class="btn btn-ghost" style="padding:5px 8px;" onclick="setStatus('${h.id}','approved')">Approve</button>` : ''}
          ${h.status!=='suspended' ? `<button class="btn btn-ghost" style="padding:5px 8px; color:var(--danger);" onclick="setStatus('${h.id}','suspended')">Suspend</button>` : `<button class="btn btn-ghost" style="padding:5px 8px;" onclick="setStatus('${h.id}','approved')">Reinstate</button>`}
        </td>
      </tr>`).join('');
}
document.getElementById('hSearch').addEventListener('input', renderHospitals);

async function setStatus(id, status){
  await adminRequest('PATCH', `/hospitals/${id}/status`, { status });
  await loadHospitals();
  await loadOverview();
}

let allPatients = [];
async function loadPatients(){
  const { patients } = await adminRequest('GET','/patients');
  allPatients = patients;
  renderPatients();
}
function renderPatients(){
  const q = (document.getElementById('pSearch').value||'').toLowerCase();
  const tbody = document.getElementById('patientsBody');
  tbody.innerHTML = allPatients
    .filter(p => p.code.toLowerCase().includes(q) || p.hospitalName.toLowerCase().includes(q))
    .map(p => `
      <tr>
        <td class="font-mono" style="color:var(--accent);">${p.code}</td>
        <td>${p.hospitalName} (${p.hospitalCity}, ${p.hospitalCountry})</td>
        <td>${p.type||'—'} · Stage ${p.stage||'—'}</td>
        <td class="font-mono notice-text">${new Date(p.registeredAt).toLocaleDateString()}</td>
        <td>${p.risk ? `<span class="pill ${p.risk==='High'?'bad':p.risk==='Moderate'?'warn':'ok'}">${p.risk}</span>` : '<span class="notice-text">Not run</span>'}</td>
        <td>${p.simCount}</td>
      </tr>`).join('');
}
document.getElementById('pSearch').addEventListener('input', renderPatients);

async function loadAudit(){
  const { entries } = await adminRequest('GET','/audit-log');
  document.getElementById('auditBody').innerHTML = entries.map(e => `
    <tr><td class="notice-text">${new Date(e.created_at).toLocaleString()}</td><td>${e.actor_type}:${(e.actor_id||'').slice(0,10)}</td><td>${e.action}</td><td class="notice-text">${e.detail||''}</td></tr>
  `).join('');
}

// If already logged in (cookie still valid), skip the login screen.
(async () => {
  try { await adminRequest('GET','/overview'); showApp(); } catch(e) { /* show login form */ }
})();
