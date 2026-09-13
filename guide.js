const state={};
const $=id=>document.getElementById(id);
const select=$('guideSelect');
const empty=$('guideEmptyState');
const viewer=$('guideViewer');
const content=$('guideContent');
const logoutButton=$('adminLogoutButton');
const refreshButton=$('guideRefreshButton');

function adminUI(){
  const panel=$('guideAdminPanel');
  const status=$('guideStatus');
  const logoutButton=$('adminLogoutButton');
  if(panel){ panel.hidden=!state.admin; panel.classList.toggle('hidden',!state.admin); }
  if(status) status.textContent=state.admin?(window.ECM_T?.('ADMIN MODE • UPLOAD / DELETE ENABLED')||'ADMIN MODE • UPLOAD / DELETE ENABLED'):(window.ECM_T?.('VIEW-ONLY • PUBLIC')||'VIEW-ONLY • PUBLIC');
  if(logoutButton) logoutButton.hidden=!state.admin;
  const loginBox=$('adminLoginBox');
  const signedBox=$('adminSignedInBox');
  if(loginBox) loginBox.hidden=!!state.admin;
  if(signedBox) signedBox.hidden=!state.admin;
}

async function api(url,opt={}){
  const h=new Headers(opt.headers||{});
  
  return fetch(url,{...opt,headers:h});
}
async function loadGuides(){
  const r=await fetch('/api/guides',{cache:'no-store'});
  if(!r.ok) throw Error(window.ECM_T?.('Không thể tải danh sách Firmware Guide.')||'Không thể tải danh sách Firmware Guide.');
  const raw=await r.json();
  const guides=Array.isArray(raw)?raw:(raw.guides||[]);
  if(select){
    select.innerHTML=`<option value="">${window.ECM_T?.('Select a guide...')||'Select a guide...'}</option>`;
    for(const g of guides){
      const o=document.createElement('option'); o.value=g.id; o.textContent=g.title; select.appendChild(o);
    }
  }
  if(empty) empty.textContent=guides.length?(window.ECM_T?.('Chọn tài liệu để xem.')||'Chọn tài liệu để xem.'):(window.ECM_T?.('Chưa có Firmware Guide. Admin có thể đăng nhập và upload PDF hoặc DOCX.')||'Chưa có Firmware Guide. Admin có thể đăng nhập và upload PDF hoặc DOCX.');
}
async function openGuide(id){
  if(!id){ if(viewer)viewer.hidden=true; if(empty)empty.hidden=false; return; }
  const r=await fetch('/api/guides/'+encodeURIComponent(id),{cache:'no-store'});
  if(!r.ok) throw Error(window.ECM_T?.('Không thể mở tài liệu.')||'Không thể mở tài liệu.');
  const d=await r.json();
  if(empty) empty.hidden=true;
  if(viewer) viewer.hidden=false;
  if(content) content.innerHTML=d.html||'<p>Tài liệu chưa có nội dung hiển thị.</p>';
}

const adminSettingsButton=$('adminSettingsButton');
const adminModal=$('adminModal');
const adminModalClose=$('adminModalClose');
const adminModalBackdrop=$('adminModalBackdrop');
const adminLoginAction=$('adminLoginAction');
const adminPasswordInput=$('adminPasswordInput');
const adminLoginError=$('adminLoginError');
const adminManageAction=$('adminManageAction');
function openAdminModal(){
  if(!adminModal)return; adminModal.hidden=false; adminUI();
  setTimeout(()=>{ if(state.admin) adminManageAction?.focus(); else adminPasswordInput?.focus(); },50);
}
function closeAdminModal(){ if(adminModal) adminModal.hidden=true; if(adminLoginError)adminLoginError.hidden=true; }
if(adminSettingsButton) adminSettingsButton.onclick=openAdminModal;
if(adminModalClose) adminModalClose.onclick=closeAdminModal;
if(adminModalBackdrop) adminModalBackdrop.onclick=closeAdminModal;
if(adminPasswordInput) adminPasswordInput.addEventListener('keydown',e=>{if(e.key==='Enter')adminLoginAction?.click();});
if(adminLoginAction) adminLoginAction.onclick=async()=>{
  const password=adminPasswordInput?.value||''; if(!password)return;
  const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok){ if(adminLoginError){adminLoginError.textContent=d.error||'Admin login failed.';adminLoginError.hidden=false;} return; }
  state.admin=true; if(adminPasswordInput)adminPasswordInput.value=''; adminUI();
};
if(adminManageAction) adminManageAction.onclick=()=>{closeAdminModal();$('firmwareGuideCard')?.scrollIntoView({behavior:'smooth',block:'start'});};
if(logoutButton) logoutButton.onclick=async()=>{await fetch('/api/admin/logout',{method:'POST'}).catch(()=>{}); state.admin=false; adminUI(); closeAdminModal();};
if(refreshButton) refreshButton.onclick=()=>loadGuides().catch(e=>alert(e.message));
if(select) select.onchange=()=>openGuide(select.value).catch(e=>alert(e.message));

const upload=$('guideUploadButton');
if(upload) upload.onclick=async()=>{
  const f=$('guideFileInput')?.files[0]; if(!f)return alert('Hãy chọn file PDF hoặc DOCX.');
  if(!/\.(pdf|docx)$/i.test(f.name))return alert('Chỉ hỗ trợ PDF hoặc DOCX.');
  const b=new Uint8Array(await f.arrayBuffer()); let bin='';
  for(let i=0;i<b.length;i+=0x8000)bin+=String.fromCharCode(...b.subarray(i,i+0x8000));
  const r=await api('/api/admin/guides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:$('guideTitleInput')?.value.trim()||f.name,filename:f.name,mimeType:f.type,data:btoa(bin)})});
  const d=await r.json().catch(()=>({})); if(!r.ok)return alert(d.error||'Upload thất bại.');
  $('guideFileInput').value=''; $('guideTitleInput').value=''; await loadGuides();
  if(select)select.value=d.id; await openGuide(d.id); alert('Đã upload tài liệu.');
};
const del=$('guideDeleteButton');
if(del) del.onclick=async()=>{
  const id=select?.value; if(!id)return alert('Hãy chọn tài liệu cần xóa.');
  if(!confirm('Xóa Firmware Guide này?'))return;
  const r=await api('/api/admin/guides?id='+encodeURIComponent(id),{method:'DELETE'});
  const d=await r.json().catch(()=>({})); if(!r.ok)return alert(d.error||'Xóa thất bại.');
  await loadGuides(); await openGuide('');
};
adminUI(); loadGuides().catch(e=>console.warn(e.message));

window.addEventListener('ecm-language-change',()=>{
  adminUI();
  loadGuides().catch(()=>{});
});
