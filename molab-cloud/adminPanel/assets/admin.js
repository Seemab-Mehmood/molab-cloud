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
async function adminUpload(path, formData){
  const res = await fetch(ADMIN_API + path, { method:'POST', credentials:'include', body: formData });
  let data = null;
  try { data = await res.json(); } catch(e){}
  if(!res.ok){ throw new Error((data&&data.error)||`Upload failed (${res.status})`); }
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
  } catch(e){ errEl.innerText = e.message; errEl.classList.remove('hidden'); }
}
async function adminLogout(){ await adminRequest('POST','/logout'); location.reload(); }

function showApp(){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  document.getElementById('appScreen').style.display='flex';
  document.getElementById('topRight').innerHTML = `<button class="btn btn-ghost" onclick="adminLogout()">Log Out</button>`;
  gotoAdminView('overview');
}
document.querySelectorAll('.nav-btn').forEach(btn=>{ btn.addEventListener('click', ()=>gotoAdminView(btn.dataset.view)); });
function gotoAdminView(name){
  document.querySelectorAll('.adminview').forEach(v=>v.classList.add('hidden'));
  document.getElementById('view-'+name).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add('active');
  if(name==='overview') loadOverview();
  if(name==='roster') loadRoster();
  if(name==='hospitals') loadHospitals();
  if(name==='patients') loadPatients();
  if(name==='email') loadEmailTargets();
  if(name==='audit') loadAudit();
}

async function loadOverview(){
  const o = await adminRequest('GET','/overview');
  document.getElementById('oActive').innerText = o.activeMembers;
  document.getElementById('oExpired').innerText = o.expiredMembers;
  document.getElementById('oHospitals').innerText = o.totalHospitals;
  document.getElementById('oPatients').innerText = o.totalPatients;
  document.getElementById('oSims').innerText = o.totalSims;
  document.getElementById('oSuspended').innerText = o.suspendedMembers;
  document.getElementById('oPosts').innerText = o.totalPosts;
}

/* ---------------- roster ---------------- */
let allMembers = [];
async function loadRoster(){
  const { members } = await adminRequest('GET','/roster');
  allMembers = members;
  renderRoster();
}
function statusPill(m){
  if(m.status==='suspended') return `<span class="pill bad">blocked</span>`;
  if(m.isLocked) return `<span class="pill warn">expired</span>`;
  return `<span class="pill ok">active</span>`;
}
function renderRoster(){
  const q = (document.getElementById('rSearch').value||'').toLowerCase();
  document.getElementById('rosterBody').innerHTML = allMembers
    .filter(m => [m.fullName,m.molabId,m.email,m.hospitalName].join(' ').toLowerCase().includes(q))
    .map(m => `
      <tr>
        <td>${m.fullName}</td>
        <td class="font-mono" style="color:var(--accent);">${m.molabId}</td>
        <td class="notice-text">${m.email}</td>
        <td class="notice-text">${m.hospitalName} (${m.hospitalCountry})</td>
        <td>${m.tier}</td>
        <td class="notice-text">${new Date(m.membershipExpiresAt).toLocaleDateString()}</td>
        <td>${statusPill(m)}${m.status==='suspended' && m.blockedReason ? `<div class="notice-text" style="margin-top:2px;">${m.blockedReason}</div>` : ''}</td>
        <td>${m.patientCount}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-ghost" style="padding:5px 8px;" onclick="renewMembership('${m.id}')">Renew +1yr</button>
          ${m.status!=='suspended' ? `<button class="btn btn-ghost" style="padding:5px 8px; color:var(--danger);" onclick="blockMember('${m.id}')">Block</button>` : `<button class="btn btn-ghost" style="padding:5px 8px;" onclick="setMemberStatus('${m.id}','active')">Unblock</button>`}
        </td>
      </tr>`).join('');
}
document.getElementById('rSearch').addEventListener('input', renderRoster);

async function uploadRoster(){
  const fileInput = document.getElementById('rosterFile');
  if(!fileInput.files.length){ alert('Choose a file first.'); return; }
  const fd = new FormData();
  fd.append('file', fileInput.files[0]);
  const box = document.getElementById('rosterUploadResult');
  box.classList.remove('hidden'); box.innerHTML = '<span class="notice-text">Uploading…</span>';
  try {
    const r = await adminUpload('/roster/upload', fd);
    box.innerHTML = `
      <div style="font-size:12px; color:var(--accent);">Created ${r.created}, updated ${r.updated}, skipped ${r.skipped}.</div>
      ${r.warnings.length ? `<div style="font-size:11px; color:var(--warn); margin-top:6px; white-space:pre-wrap;">${r.warnings.join('\n')}</div>` : ''}
    `;
    fileInput.value = '';
    loadRoster(); loadOverview();
  } catch(e){ box.innerHTML = `<span style="color:var(--danger); font-size:12px;">${e.message}</span>`; }
}

async function renewMembership(id){
  if(!confirm('Renew this membership for another 12 months from today?')) return;
  await adminRequest('POST', `/roster/${id}/renew`);
  loadRoster(); loadOverview();
}
async function blockMember(id){
  const reason = prompt('Reason for blocking this member (shown to them, e.g. policy violation, community complaint):');
  if(reason === null) return;
  await setMemberStatus(id, 'suspended', reason);
}
async function setMemberStatus(id, status, reason){
  await adminRequest('PATCH', `/roster/${id}/status`, { status, reason });
  loadRoster(); loadOverview();
}

/* ---------------- hospitals ---------------- */
async function loadHospitals(){
  const { hospitals } = await adminRequest('GET','/hospitals');
  document.getElementById('hospitalsBody').innerHTML = hospitals.map(h => `
    <tr><td>${h.name}</td><td class="notice-text">${h.country}</td><td>${h.member_count}</td></tr>
  `).join('');
}

/* ---------------- patients ---------------- */
let allPatients = [];
async function loadPatients(){
  const { patients } = await adminRequest('GET','/patients');
  allPatients = patients;
  renderPatients();
}
function renderPatients(){
  const q = (document.getElementById('pSearch').value||'').toLowerCase();
  document.getElementById('patientsBody').innerHTML = allPatients
    .filter(p => [p.code,p.memberName,p.hospitalName].join(' ').toLowerCase().includes(q))
    .map(p => `
      <tr>
        <td class="font-mono" style="color:var(--accent);">${p.code}</td>
        <td>${p.memberName} <span class="notice-text">(${p.molabId})</span></td>
        <td class="notice-text">${p.hospitalName}, ${p.hospitalCountry}</td>
        <td>${p.type||'—'} · Stage ${p.stage||'—'}</td>
        <td class="font-mono notice-text">${new Date(p.registeredAt).toLocaleDateString()}</td>
        <td>${p.risk ? `<span class="pill ${p.risk==='High'?'bad':p.risk==='Moderate'?'warn':'ok'}">${p.risk}</span>` : '<span class="notice-text">Not run</span>'}</td>
        <td>${p.simCount}</td>
        <td style="text-align:right;"><button class="btn btn-ghost" style="padding:5px 8px;" onclick="viewPatient('${p.id}')">View</button></td>
      </tr>`).join('');
}
document.getElementById('pSearch').addEventListener('input', renderPatients);

async function viewPatient(id){
  const { patient } = await adminRequest('GET', `/patients/${id}`);
  const box = document.getElementById('patientModalBody');
  box.innerHTML = `
    <div class="grid grid-2" style="font-size:12px; margin-bottom:14px;">
      <div><div class="label-sm">Patient code</div><div class="font-mono" style="color:var(--accent);">${patient.code}</div></div>
      <div><div class="label-sm">Member</div><div>${patient.memberName} (${patient.molabId})</div></div>
      <div><div class="label-sm">Hospital</div><div>${patient.hospitalName}, ${patient.hospitalCountry}</div></div>
      <div><div class="label-sm">Age / Sex</div><div>${patient.age||'—'} / ${patient.sex||'—'}</div></div>
      <div><div class="label-sm">Cancer type</div><div>${patient.type||'—'}</div></div>
      <div><div class="label-sm">Stage</div><div>${patient.stage||'—'}</div></div>
    </div>
    <div style="position:relative; height:220px; background:#090D0A; border:1px solid #141C16; border-radius:6px; overflow:hidden; margin-bottom:14px;">
      <canvas id="patientModalCanvas" style="position:absolute; inset:0; width:100%; height:100%;"></canvas>
    </div>
    ${patient.results ? `
      <div class="grid grid-3" style="margin-bottom:14px;">
        <div class="card pad"><div class="label-sm">Risk band</div><div class="font-display" style="font-size:1.2rem;">${patient.results.risk}</div></div>
        <div class="card pad"><div class="label-sm">Doubling time</div><div class="font-display" style="font-size:1.2rem;">${patient.results.medianDT!==null?patient.results.medianDT.toFixed(1)+'d':'n/a'}</div></div>
        <div class="card pad"><div class="label-sm">+90d volume</div><div class="font-display" style="font-size:1.2rem;">${patient.results.consensusDay90.toFixed(0)} mm³</div></div>
      </div>` : `<div class="notice-text" style="margin-bottom:14px;">No simulation has been run for this patient yet.</div>`}
    <div class="card" style="max-height:160px; overflow-y:auto;">
      <table class="font-mono"><thead><tr><th>t (days)</th><th>Volume (mm³)</th></tr></thead>
      <tbody>${patient.dataset.map(d=>`<tr><td>${d.t}</td><td>${d.v}</td></tr>`).join('')}</tbody></table>
    </div>
  `;
  const modal = document.getElementById('patientModal');
  modal.classList.remove('hidden'); modal.style.display='flex';
  if(patient.results){
    setTimeout(()=>drawModelChart('patientModalCanvas', patient.dataset, patient.results.results), 30);
  } else {
    setTimeout(()=>drawEmptyChart('patientModalCanvas','No simulation run yet.'), 30);
  }
}
function closePatientModal(){
  const modal = document.getElementById('patientModal');
  modal.classList.add('hidden'); modal.style.display='none';
}

/* ---------------- email ---------------- */
async function loadEmailTargets(){
  if(!allMembers.length){ const { members } = await adminRequest('GET','/roster'); allMembers = members; }
  const sel = document.getElementById('emailTarget');
  sel.innerHTML = '<option value="all">All active members</option>' +
    allMembers.filter(m=>m.status==='active').map(m => `<option value="${m.id}">${m.fullName} (${m.molabId}) — ${m.hospitalName}</option>`).join('');
}
async function sendEmail(){
  const target = document.getElementById('emailTarget').value;
  const subject = document.getElementById('emailSubject').value.trim();
  const message = document.getElementById('emailBody').value.trim();
  const resultEl = document.getElementById('emailResult');
  if(!subject || !message){ alert('Add a subject and message.'); return; }
  try {
    const r = target==='all'
      ? await adminRequest('POST','/broadcast', { subject, message })
      : await adminRequest('POST', `/roster/${target}/email`, { subject, message });
    resultEl.classList.remove('hidden');
    resultEl.innerText = r.message + (r.emailDelivery==='logged' ? ' (SMTP not configured — logged to data/dev-emails.log)' : '');
  } catch(e){ alert(e.message); }
}

/* ---------------- audit ---------------- */
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
