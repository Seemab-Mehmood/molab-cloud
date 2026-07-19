let currentHospital = null;
let currentPatients = [];
let currentPatientId = null;
let currentPatient = null;
let npDataset = [];
let simDataset = [];

const PAGE_META = {
  dashboard:{title:'Cloud Dashboard', sub:'Your hospital overview'},
  patients:{title:'Patient Registry', sub:'Oncology ward roster'},
  newpatient:{title:'New Patient Intake', sub:'Register a single patient case'},
  simulator:{title:'Prognosis Simulator', sub:'Apply all models to one patient'},
  models:{title:'Model Registry', sub:'5 published mathematical oncology growth models'},
};

document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>gotoView(btn.dataset.view));
});

function gotoView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add('active');
  document.getElementById('pageTitle').innerText = PAGE_META[name].title;
  document.getElementById('pageSub').innerText = PAGE_META[name].sub;

  if(name==='dashboard') renderDashboard();
  if(name==='patients') loadAndRenderPatients();
  if(name==='newpatient'){ npDataset=[]; npRenderTable(); document.getElementById('np_error').classList.add('hidden'); }
  if(name==='simulator') loadSimulatorPatients();
  if(name==='models') loadModelsView();
}

async function boot(){
  try {
    const { session } = await API.get('/api/auth/me');
    if (!session || session.role !== 'hospital') { location.href = '/login.html'; return; }
    currentHospital = session.hospital;
  } catch (e) { location.href = '/login.html'; return; }

  document.getElementById('sessionLabel').innerText = `${currentHospital.repName} — ${currentHospital.name}`;
  gotoView('dashboard');
}

async function logout(){
  await API.post('/api/auth/logout');
  location.href = '/';
}

/* ---------------- dashboard ---------------- */
async function renderDashboard(){
  const { patients } = await API.get('/api/patients');
  currentPatients = patients;
  const sims = patients.reduce((a,p)=>a+(p.simCount||0),0);
  document.getElementById('statPatients').innerText = patients.length;
  document.getElementById('statSims').innerText = sims;
  const statusEl = document.getElementById('statStatus');
  statusEl.innerText = currentHospital.status[0].toUpperCase()+currentHospital.status.slice(1);
  statusEl.style.color = currentHospital.status==='approved' ? 'var(--accent)' : currentHospital.status==='pending' ? 'var(--warn)' : 'var(--danger)';
  document.getElementById('pendingBanner').classList.toggle('hidden', currentHospital.status!=='pending');
  document.getElementById('profileBox').innerHTML = `
    <div><div class="label-sm">Hospital</div><div>${currentHospital.name}</div></div>
    <div><div class="label-sm">Location</div><div>${currentHospital.city}, ${currentHospital.country}</div></div>
    <div><div class="label-sm">Type</div><div>${currentHospital.type}</div></div>
    <div><div class="label-sm">Representative</div><div>${currentHospital.repName}${currentHospital.repRole? ' — '+currentHospital.repRole:''}</div></div>
    <div><div class="label-sm">Contact email</div><div>${currentHospital.repEmail}</div></div>
    <div><div class="label-sm">Registered on</div><div>${new Date(currentHospital.createdAt).toLocaleDateString()}</div></div>`;
}

/* ---------------- patients list ---------------- */
function riskPillClass(risk){
  if(risk==='High') return 'bad'; if(risk==='Moderate') return 'warn'; return 'ok';
}
async function loadAndRenderPatients(){
  const { patients } = await API.get('/api/patients');
  currentPatients = patients;
  const tbody = document.getElementById('patientsBody');
  tbody.innerHTML='';
  document.getElementById('patientsEmpty').classList.toggle('hidden', patients.length>0);
  patients.forEach(p=>{
    const risk = p.results ? p.results.risk : null;
    const badge = risk ? `<span class="pill ${riskPillClass(risk)}">${risk}</span>` : `<span class="notice-text">Not run</span>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="font-mono" style="color:var(--accent);">${p.code}</td><td>${p.age||'—'} / ${p.sex||'—'}</td><td>${p.type||'—'}</td><td>Stage ${p.stage||'—'}</td><td class="font-mono notice-text">${new Date(p.registeredAt).toLocaleDateString()}</td><td>${badge}</td><td style="text-align:right;"><button class="btn btn-ghost" style="padding:6px 10px;" onclick="openInSimulator('${p.id}')">Run Simulator →</button></td>`;
    tbody.appendChild(tr);
  });
}
function openInSimulator(id){ gotoView('simulator'); setTimeout(()=>{ document.getElementById('simPatientSelect').value=id; loadPatientIntoSimulator(id); }, 0); }

/* ---------------- new patient intake ---------------- */
function npRenderTable(){
  const tbody = document.getElementById('npDataBody'); tbody.innerHTML='';
  npDataset.forEach((row,idx)=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${row.t}</td><td>${row.v}</td><td style="text-align:right;"><button onclick="npRemoveRow(${idx})" style="color:var(--danger); background:none; border:none; cursor:pointer;">×</button></td>`;
    tbody.appendChild(tr);
  });
}
function npAddRow(){
  const t=parseFloat(document.getElementById('np_t').value), v=parseFloat(document.getElementById('np_v').value);
  if(!isNaN(t)&&!isNaN(v)){ npDataset.push({t,v}); npDataset.sort((a,b)=>a.t-b.t); document.getElementById('np_t').value=''; document.getElementById('np_v').value=''; npRenderTable(); }
}
function npRemoveRow(idx){ npDataset.splice(idx,1); npRenderTable(); }

async function registerPatient(){
  const errEl = document.getElementById('np_error'); errEl.classList.add('hidden');
  if(currentHospital.status!=='approved'){ errEl.innerText='Your hospital must be approved before patients can be registered.'; errEl.classList.remove('hidden'); return; }
  const code = document.getElementById('np_code').value.trim();
  if(!code){ errEl.innerText='Enter a patient code.'; errEl.classList.remove('hidden'); return; }
  if(npDataset.length<2){ errEl.innerText='Add at least two tumor measurements.'; errEl.classList.remove('hidden'); return; }

  try {
    const { patient } = await API.post('/api/patients', {
      code, age: document.getElementById('np_age').value, sex: document.getElementById('np_sex').value,
      type: document.getElementById('np_type').value, stage: document.getElementById('np_stage').value,
      tx: document.getElementById('np_tx').value, dataset: npDataset,
    });
    document.getElementById('np_code').value=''; npDataset=[]; npRenderTable();
    gotoView('simulator');
    setTimeout(()=>{ document.getElementById('simPatientSelect').value=patient.id; loadPatientIntoSimulator(patient.id); }, 0);
  } catch (err) {
    errEl.innerText = err.message; errEl.classList.remove('hidden');
  }
}

/* ---------------- simulator ---------------- */
async function loadSimulatorPatients(){
  const { patients } = await API.get('/api/patients');
  currentPatients = patients;
  const sel = document.getElementById('simPatientSelect');
  sel.innerHTML='';
  if(patients.length===0){
    sel.innerHTML='<option>No patients registered</option>';
    document.getElementById('simPatientCard').innerHTML="<div class='notice-text' style='grid-column:1/-1;'>Register a patient first.</div>";
    drawEmptyChart('canvasChart','Register a patient to begin.');
    return;
  }
  patients.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.innerText=`${p.code} — ${p.type} (Stage ${p.stage})`; sel.appendChild(o); });
  sel.onchange = ()=>loadPatientIntoSimulator(sel.value);
  loadPatientIntoSimulator(patients[0].id);
}

async function loadPatientIntoSimulator(id){
  const { patient } = await API.get(`/api/patients/${id}`);
  currentPatientId = id; currentPatient = patient;
  simDataset = JSON.parse(JSON.stringify(patient.dataset));
  simRenderTable();
  document.getElementById('simPatientCard').innerHTML = `
    <div><div class="label-sm">Code</div><div class="font-mono" style="color:var(--accent);">${patient.code}</div></div>
    <div><div class="label-sm">Age / Sex</div><div>${patient.age||'—'} / ${patient.sex||'—'}</div></div>
    <div><div class="label-sm">Type</div><div>${patient.type||'—'}</div></div>
    <div><div class="label-sm">Stage</div><div>${patient.stage||'—'}</div></div>`;
  if(patient.results){ renderConsensus(patient.results); renderMetrics(patient.results); drawModelChart('canvasChart', simDataset, patient.results.results); renderLegend(patient.results.results); }
  else { document.getElementById('consensusCards').innerHTML=''; document.getElementById('metricsBody').innerHTML=''; document.getElementById('chartLegend').innerHTML=''; drawEmptyChart('canvasChart','Add measurements and click "Apply All Models".'); }
}
function simRenderTable(){
  const tbody=document.getElementById('simDataBody'); tbody.innerHTML='';
  simDataset.forEach((row,idx)=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${row.t}</td><td>${row.v}</td><td style="text-align:right;"><button onclick="simRemoveRow(${idx})" style="color:var(--danger); background:none; border:none; cursor:pointer;">×</button></td>`;
    tbody.appendChild(tr);
  });
}
async function simAddRow(){
  const t=parseFloat(document.getElementById('sim_t').value), v=parseFloat(document.getElementById('sim_v').value);
  if(isNaN(t)||isNaN(v)) return;
  simDataset.push({t,v}); simDataset.sort((a,b)=>a.t-b.t);
  document.getElementById('sim_t').value=''; document.getElementById('sim_v').value='';
  simRenderTable();
  await API.put(`/api/patients/${currentPatientId}/dataset`, { dataset: simDataset });
}
async function simRemoveRow(idx){
  simDataset.splice(idx,1); simRenderTable();
  await API.put(`/api/patients/${currentPatientId}/dataset`, { dataset: simDataset });
}

async function runSimulation(){
  if(!currentPatientId || simDataset.length<2){ alert('Need at least two measurement points.'); return; }
  const btn = document.getElementById('runSimBtn'); btn.disabled=true; btn.innerText='Running…';
  try {
    const { patient } = await API.post(`/api/patients/${currentPatientId}/simulate`);
    currentPatient = patient;
    renderConsensus(patient.results); renderMetrics(patient.results);
    drawModelChart('canvasChart', simDataset, patient.results.results); renderLegend(patient.results.results);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled=false; btn.innerText='Apply All Models';
  }
}

function riskColor(risk){ return risk==='High' ? 'var(--danger)' : risk==='Moderate' ? 'var(--warn)' : 'var(--accent)'; }
function renderConsensus(r){
  const best = r.results.find(x=>x.key===r.bestKey);
  document.getElementById('consensusCards').innerHTML = `
    <div class="card pad" style="border-left:4px solid ${riskColor(r.risk)};">
      <div class="label-sm">Consensus risk band</div>
      <div class="font-display" style="font-size:1.6rem; color:${riskColor(r.risk)};">${r.risk}</div>
      <div class="notice-text" style="margin-top:4px;">Median doubling time: ${r.medianDT!==null? r.medianDT.toFixed(1)+' days':'n/a'}</div>
    </div>
    <div class="card pad">
      <div class="label-sm">Best-fit model (lowest AIC)</div>
      <div class="font-display" style="font-size:1.3rem;">${best.name}</div>
      <div class="font-mono" style="color:var(--accent); font-size:11px; margin-top:4px;">${best.eq}</div>
    </div>
    <div class="card pad">
      <div class="label-sm">Projected volume, +90 days</div>
      <div class="font-display" style="font-size:1.6rem; color:var(--accent);">${r.consensusDay90.toFixed(0)} mm³</div>
      <div class="notice-text" style="margin-top:4px;">Range: ${r.minDay90.toFixed(0)}–${r.maxDay90.toFixed(0)} mm³</div>
    </div>`;
}
function renderMetrics(r){
  document.getElementById('metricsBody').innerHTML = r.results.map(res=>{
    const isBest = res.key===r.bestKey;
    const params = Object.entries(res.params).map(([k,v])=>`${k}=${v.toFixed(4)}`).join(', ');
    return `<tr style="${isBest?'background:#101B14;':''}">
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${res.color};margin-right:6px;"></span>${res.name}${isBest?' <span style="font-size:9px;color:var(--accent);text-transform:uppercase;">best fit</span>':''}</td>
      <td style="color:#9FB6A7;">${params}</td>
      <td>${res.rmse.toFixed(2)}</td><td>${res.r2.toFixed(3)}</td><td>${res.aic.toFixed(1)}</td>
      <td>${res.doublingTime!==null? res.doublingTime.toFixed(1)+'d':'n/a'}</td>
      <td>${res.day90.toFixed(0)} mm³</td></tr>`;
  }).join('');
}
function renderLegend(results){
  document.getElementById('chartLegend').innerHTML = results.map(m=>
    `<div style="display:flex;align-items:center;gap:8px;font-size:10px;margin-bottom:4px;"><span style="width:10px;height:10px;border-radius:2px;background:${m.color};display:inline-block;"></span><span style="color:#9FB6A7;">${m.name}</span></div>`
  ).join('') + `<div style="display:flex;align-items:center;gap:8px;font-size:10px;padding-top:6px;border-top:1px solid var(--border);margin-top:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#F2EFE6;display:inline-block;"></span><span style="color:#9FB6A7;">Observed measurements</span></div>`;
}

function downloadReport(){
  if(!currentPatient || !currentPatient.results){ alert('Run the simulator for a patient before exporting a report.'); return; }
  const p = currentPatient, r = p.results;
  const lines = [];
  lines.push('MOLAB CLOUD — PROGNOSIS SIMULATION REPORT');
  lines.push('Generated: '+new Date().toString());
  lines.push(`Hospital: ${currentHospital.name} (${currentHospital.city}, ${currentHospital.country})`);
  lines.push(`Patient code: ${p.code}   Age/Sex: ${p.age}/${p.sex}   Type: ${p.type}   Stage: ${p.stage}`);
  lines.push('');
  lines.push('RISK BAND: '+r.risk);
  lines.push('Median doubling time: '+(r.medianDT!==null? r.medianDT.toFixed(1)+' days':'n/a'));
  lines.push(`Consensus projected volume (+90 days): ${r.consensusDay90.toFixed(0)} mm3 (range ${r.minDay90.toFixed(0)}-${r.maxDay90.toFixed(0)})`);
  lines.push('Best-fit model (lowest AIC): '+r.results.find(x=>x.key===r.bestKey).name);
  lines.push('');
  lines.push('PER-MODEL RESULTS');
  r.results.forEach(res=>{
    lines.push(`- ${res.name} [${res.eq}]`);
    lines.push('    params: '+Object.entries(res.params).map(([k,v])=>`${k}=${v.toFixed(4)}`).join(', '));
    lines.push(`    RMSE=${res.rmse.toFixed(2)}  R2=${res.r2.toFixed(3)}  AIC=${res.aic.toFixed(1)}  doubling=${res.doublingTime!==null?res.doublingTime.toFixed(1)+'d':'n/a'}  +90d=${res.day90.toFixed(0)}mm3`);
  });
  lines.push('');
  lines.push('DISCLAIMER: Research prototype output. Not a certified medical device. Requires clinician review and institutional validation before any clinical use.');
  const blob = new Blob([lines.join('\n')], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`MOLAB_report_${p.code}.txt`; a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- models ---------------- */
async function loadModelsView(){
  const { models } = await API.get('/api/public/models');
  document.getElementById('modelsBody').innerHTML = models.map(m=>`
    <tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${m.color};margin-right:8px;"></span>${m.name}</td>
    <td class="font-mono" style="color:var(--accent);">${m.eq}</td><td style="color:#C7D6CC;">${m.use}</td>
    <td class="font-mono notice-text" style="font-size:10px;">${m.ref}</td></tr>`).join('');
}

boot();
