function drawEmptyChart(canvasId, message){
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#4E6156'; ctx.font = '12px Inter'; ctx.textAlign = 'center';
  ctx.fillText(message, canvas.width/2, canvas.height/2);
}

/**
 * dataset: [{t,v}] observed points
 * modelResults: array from server simulation, each with {trajectory:[{t,v}], color, ...}
 */
function drawModelChart(canvasId, dataset, modelResults){
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const W = canvas.width, H = canvas.height, pad = 40;
  ctx.clearRect(0,0,W,H);

  let allT = [], allV = [];
  dataset.forEach(d => { allT.push(d.t); allV.push(d.v); });
  modelResults.forEach(res => res.trajectory.forEach(pt => { allT.push(pt.t); allV.push(pt.v); }));
  const tMin = 0, tMax = Math.max(...allT);
  const vMin = 0, vMax = Math.max(...allV) * 1.08;
  const X = t => pad + (t - tMin) / (tMax - tMin || 1) * (W - pad*1.5);
  const Y = v => H - pad - (v - vMin) / (vMax - vMin || 1) * (H - pad*1.6);

  ctx.strokeStyle = '#141C16'; ctx.lineWidth = 1; ctx.font = "10px 'IBM Plex Mono'"; ctx.fillStyle = '#4E6156';
  for (let i=0;i<=4;i++){ const v=vMin+(vMax-vMin)*i/4; const y=Y(v); ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad*0.5,y); ctx.stroke(); ctx.fillText(v.toFixed(0),4,y+3); }
  for (let i=0;i<=5;i++){ const t=tMin+(tMax-tMin)*i/5; const x=X(t); ctx.fillText(t.toFixed(0)+'d',x-8,H-pad+14); }

  const tLast = Math.max(...dataset.map(d=>d.t));
  ctx.strokeStyle = '#27392F'; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(X(tLast),pad*0.3); ctx.lineTo(X(tLast),H-pad); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#7FA08F'; ctx.fillText('today', X(tLast)-10, pad*0.3-4);

  modelResults.forEach(res => {
    ctx.strokeStyle = res.color; ctx.lineWidth = 2; ctx.beginPath();
    res.trajectory.forEach((pt, idx) => { const x=X(pt.t), y=Y(pt.v); idx===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y); });
    ctx.stroke();
  });
  dataset.forEach(pt => {
    ctx.beginPath(); ctx.arc(X(pt.t),Y(pt.v),4,0,Math.PI*2);
    ctx.fillStyle = '#F2EFE6'; ctx.fill(); ctx.strokeStyle = '#0E1410'; ctx.lineWidth = 1.5; ctx.stroke();
  });
}
