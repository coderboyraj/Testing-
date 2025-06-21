async function start(){
  const payload={
    cookie:document.getElementById('cookie').value.trim(),
    postId:document.getElementById('postId').value.trim(),
    comment:document.getElementById('comment').value.trim(),
    delay:Number(document.getElementById('delay').value)
  };
  if(Object.values(payload).some(v=>!v)){
    alert('All fields are required');return;
  }
  const r = await fetch('/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const j = await r.json();
  if(j.sessionId){
    alert('Started session '+j.sessionId);
    refresh();
  }else{alert(j.error||'Unknown error')}
}

async function stop(id){
  await fetch('/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:id})});
  refresh();
}

async function refresh(){
  const tbody=document.getElementById('list');
  tbody.innerHTML='';
  const res = await fetch('/sessions');
  const list = await res.json();
  list.sort((a,b)=>a.sessionId.localeCompare(b.sessionId));
  list.forEach(s=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${s.sessionId.slice(0,8)}</td>
      <td>${s.active?'Active':'Stopped'}</td>
      <td>${s.lastActivity?new Date(s.lastActivity).toLocaleString(): '-'}</td>
      <td><button class="stop" onclick="stop('${s.sessionId}')">Stop</button></td>`;
    tbody.appendChild(tr);
  });
}
refresh();
setInterval(refresh,5000);