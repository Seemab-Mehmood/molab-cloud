async function loadPublicData(){
  try {
    const stats = await API.get('/api/public/stats');
    document.getElementById('statHospitals').innerText = stats.hospitalsRegistered;
    document.getElementById('statPatients').innerText = stats.patientsUnderSupervision;
    document.getElementById('statModels').innerText = stats.modelsInRegistry;
  } catch (e) {
    console.error('Failed to load public stats', e);
  }
  try {
    const { models } = await API.get('/api/public/models');
    document.getElementById('modelTable').innerHTML = models.map(m => `
      <tr>
        <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${m.color};margin-right:8px;"></span>${m.name}</td>
        <td class="font-mono" style="color:var(--accent);">${m.eq}</td>
        <td style="color:#C7D6CC;">${m.use}</td>
        <td class="font-mono" style="font-size:10px; color:var(--muted);">${m.ref}</td>
      </tr>`).join('');
  } catch (e) {
    console.error('Failed to load model registry', e);
  }
}

async function renderTopRight(){
  const el = document.getElementById('topRight');
  try {
    const { session } = await API.get('/api/auth/me');
    if (session && session.role === 'hospital') {
      el.innerHTML = `<a href="/dashboard.html" class="btn btn-ghost">Open Dashboard →</a>`;
      return;
    }
  } catch (e) { /* not logged in */ }
  el.innerHTML = '';
}

loadPublicData();
renderTopRight();
