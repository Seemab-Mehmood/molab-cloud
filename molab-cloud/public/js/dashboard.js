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
  tutorial:{title:'Tutorial', sub:'How to use the simulator and what each model implies'},
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

function interpolateTrajectory(trajectory, targetT){
  if(targetT<=trajectory[0].t) return trajectory[0].v;
  if(targetT>=trajectory[trajectory.length-1].t) return trajectory[trajectory.length-1].v;
  for(let i=1;i<trajectory.length;i++){
    if(trajectory[i].t>=targetT){
      const p1=trajectory[i-1], p2=trajectory[i];
      const ratio=(targetT-p1.t)/(p2.t-p1.t);
      return p1.v+ratio*(p2.v-p1.v);
    }
  }
  return 0;
}

function csvEscape(val){
  const s = String(val);
  return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}

function downloadCSV(){
  if(!currentPatient || !currentPatient.results){ alert('Run the simulator for a patient before exporting data.'); return; }
  const p = currentPatient, r = p.results;
  const rows = [];

  rows.push(['MOLAB Cloud - Patient Prognosis Data Export']);
  rows.push(['Generated', new Date().toString()]);
  rows.push(['Hospital', `${currentHospital.name} (${currentHospital.city}, ${currentHospital.country})`]);
  rows.push(['Patient code', p.code]);
  rows.push(['Age / Sex', `${p.age||'—'} / ${p.sex||'—'}`]);
  rows.push(['Cancer type', p.type||'—']);
  rows.push(['Stage', p.stage||'—']);
  rows.push(['Risk band', r.risk]);
  rows.push(['Median doubling time (days)', r.medianDT!==null? r.medianDT.toFixed(1) : 'n/a']);
  rows.push(['Consensus +90d volume (mm3)', r.consensusDay90.toFixed(1)]);
  rows.push([]);

  rows.push(['SECTION: Observed measurements (as entered)']);
  rows.push(['t (days)','Volume (mm3)']);
  simDataset.forEach(pt => rows.push([pt.t, pt.v]));
  rows.push([]);

  rows.push(['SECTION: Model projections over time (sampled every 5 days across the fitted horizon)']);
  const tLast = Math.max(...simDataset.map(d=>d.t));
  const horizon = tLast + 120;
  const header = ['t (days)', ...r.results.map(m=>m.name+' (mm3)')];
  rows.push(header);
  for(let t=0; t<=horizon; t+=5){
    const row = [t];
    r.results.forEach(m => row.push(interpolateTrajectory(m.trajectory, t).toFixed(2)));
    rows.push(row);
  }
  rows.push([]);

  rows.push(['SECTION: Per-model fit metrics']);
  rows.push(['Model','Equation','Parameters','RMSE','R2','AIC','Doubling time (days)','+90d volume (mm3)']);
  r.results.forEach(res => {
    rows.push([
      res.name, res.eq,
      Object.entries(res.params).map(([k,v])=>`${k}=${v.toFixed(4)}`).join('; '),
      res.rmse.toFixed(2), res.r2.toFixed(3), res.aic.toFixed(1),
      res.doublingTime!==null? res.doublingTime.toFixed(1) : 'n/a',
      res.day90.toFixed(1),
    ]);
  });
  rows.push([]);
  rows.push(['DISCLAIMER: Research prototype output. Not a certified medical device. Requires clinician review before any clinical use.']);

  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`MOLAB_data_${p.code}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function downloadChartPDF(){
  if(!currentPatient || !currentPatient.results){ alert('Run the simulator for a patient before exporting a chart.'); return; }
  if(!window.jspdf){ alert('PDF library failed to load — check your internet connection and try again.'); return; }
  const p = currentPatient, r = p.results;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('MOLAB Cloud — Prognosis Simulation', margin, 50);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`Generated ${new Date().toString()}`, margin, 66);
  doc.text(`Hospital: ${currentHospital.name} (${currentHospital.city}, ${currentHospital.country})`, margin, 80);
  doc.text(`Patient: ${p.code}  |  ${p.age||'—'} / ${p.sex||'—'}  |  ${p.type||'—'}  |  Stage ${p.stage||'—'}`, margin, 94);

  const canvas = document.getElementById('canvasChart');
  const imgData = canvas.toDataURL('image/png');
  const imgW = pageW - margin*2;
  const imgH = imgW * (canvas.height / canvas.width);
  doc.addImage(imgData, 'PNG', margin, 112, imgW, imgH);

  let y = 112 + imgH + 24;
  doc.setTextColor(0); doc.setFont('helvetica','bold'); doc.setFontSize(12);
  doc.text(`Consensus risk band: ${r.risk}`, margin, y); y += 16;
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text(`Median doubling time: ${r.medianDT!==null? r.medianDT.toFixed(1)+' days':'n/a'}`, margin, y); y += 14;
  doc.text(`Projected volume at +90 days: ${r.consensusDay90.toFixed(0)} mm3 (range ${r.minDay90.toFixed(0)}-${r.maxDay90.toFixed(0)})`, margin, y); y += 14;
  const best = r.results.find(x=>x.key===r.bestKey);
  doc.text(`Best-fit model (lowest AIC): ${best.name} — ${best.eq}`, margin, y); y += 20;

  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text('Per-model metrics', margin, y); y += 14;
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  r.results.forEach(res => {
    const line = `${res.name}: RMSE=${res.rmse.toFixed(2)}  R2=${res.r2.toFixed(3)}  AIC=${res.aic.toFixed(1)}  doubling=${res.doublingTime!==null?res.doublingTime.toFixed(1)+'d':'n/a'}  +90d=${res.day90.toFixed(0)}mm3`;
    doc.text(line, margin, y); y += 12;
  });
  y += 10;
  doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(150);
  doc.text('Research prototype output. Not a certified medical device. Requires clinician review before any clinical use.', margin, y, { maxWidth: pageW - margin*2 });

  doc.save(`MOLAB_chart_${p.code}.pdf`);
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
