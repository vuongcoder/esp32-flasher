const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data', 'guides');
const META_FILE = path.join(ROOT, 'data', 'guides.json');
const sessions = new Map();

if (!ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD is not set. Admin login will be disabled.');
fs.mkdirSync(DATA_DIR, { recursive: true });
let documents = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, 'utf8')) : [];

function saveMeta() { fs.writeFileSync(META_FILE, JSON.stringify(documents, null, 2)); }
function send(res, code, body, type='application/json') { res.writeHead(code, {'Content-Type': type, 'Cache-Control':'no-store'}); res.end(body); }
function json(res, code, obj) { send(res, code, JSON.stringify(obj)); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => { const i=x.indexOf('='); return [x.slice(0,i).trim(), decodeURIComponent(x.slice(i+1))]; })); }
function isAdmin(req) { const token = parseCookies(req).admin_session; return !!token && sessions.has(token); }
function readBody(req, limit=35*1024*1024) { return new Promise((resolve,reject)=>{ let size=0, chunks=[]; req.on('data',c=>{ size+=c.length; if(size>limit){ reject(new Error('Request too large')); req.destroy(); return;} chunks.push(c); }); req.on('end',()=>resolve(Buffer.concat(chunks))); req.on('error',reject); }); }
function safeName(name) { return String(name||'guide').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120); }
function mimeFor(type) { return type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
function passwordOK(value) {
  const a = crypto.createHash('sha256').update(String(value)).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a,b);
}
function publicDocs() { return documents.map(({id,title,category,type,filename,updatedAt})=>({id,title,category,type,filename,updatedAt})); }
function escapeHtml(v){ return String(v||'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }

async function api(req,res,url) {
  if (req.method==='GET' && url.pathname==='/api/guides') return json(res,200,publicDocs());
  if (req.method==='GET' && url.pathname==='/api/guides/file') {
    const doc=documents.find(d=>d.id===url.searchParams.get('id'));
    if(!doc) return send(res,404,'Not found','text/plain');
    const file=path.join(DATA_DIR,doc.storedName);
    if(!fs.existsSync(file)) return send(res,404,'File missing','text/plain');
    const stat=fs.statSync(file);
    res.writeHead(200,{
      'Content-Type':mimeFor(doc.type),
      'Content-Length':stat.size,
      'Content-Disposition':doc.type==='pdf'?'inline':'attachment',
      'X-Content-Type-Options':'nosniff',
      'Cache-Control':'no-cache'
    });
    return fs.createReadStream(file).pipe(res);
  }
  if (req.method==='GET' && url.pathname.startsWith('/api/guides/')) {
    const id=decodeURIComponent(url.pathname.slice('/api/guides/'.length));
    const doc=documents.find(d=>d.id===id);
    if(!doc) return json(res,404,{error:'Guide not found'});
    const fileUrl='/api/guides/file?id='+encodeURIComponent(doc.id);
    let html='';
    if(doc.type==='pdf') html=`<div class="guide-document-head"><div><h1>${escapeHtml(doc.title)}</h1><p>${escapeHtml(doc.filename)}</p></div><a class="guide-open-button" href="${fileUrl}" target="_blank" rel="noopener">OPEN PDF</a></div><div class="guide-pdf-frame"><iframe class="guide-pdf" src="${fileUrl}#toolbar=1&navpanes=0&view=FitH" title="${escapeHtml(doc.title)}"></iframe></div>`;
    else html=`<h1>${escapeHtml(doc.title)}</h1><p>${escapeHtml(doc.filename)}</p><p>DOCX is stored on the server. Use the button below to open the original document.</p><p><a class="guide-open-button" href="${fileUrl}" target="_blank" rel="noopener">OPEN ORIGINAL DOCX</a></p>`;
    return json(res,200,{guide:{...doc,html},html});
  }
  if (req.method==='POST' && url.pathname==='/api/admin/login') {
    if(!ADMIN_PASSWORD) return json(res,503,{error:'ADMIN_PASSWORD is not configured'});
    try { const body=JSON.parse(await readBody(req,64*1024)); if(!passwordOK(body.password||'')) return json(res,401,{error:'Invalid password'}); const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,Date.now()); setTimeout(()=>sessions.delete(token),8*60*60*1000); res.writeHead(200,{'Content-Type':'application/json','Set-Cookie':`admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`}); return res.end(JSON.stringify({ok:true})); } catch(e){ return json(res,400,{error:'Invalid request'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/admin/logout') { const token=parseCookies(req).admin_session; if(token) sessions.delete(token); res.writeHead(200,{'Set-Cookie':'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0','Content-Type':'application/json'}); return res.end('{"ok":true}'); }
  if (url.pathname.startsWith('/api/admin/')) {
    if(!isAdmin(req)) return json(res,401,{error:'Admin authentication required'});
    if(req.method==='POST' && url.pathname==='/api/admin/guides') {
      try { const body=JSON.parse(await readBody(req)); const title=String(body.title||'').trim(); const filename=safeName(body.filename); const ext=path.extname(filename).toLowerCase(); if(!title || !['.pdf','.docx'].includes(ext) || typeof body.data!=='string') return json(res,400,{error:'Title, PDF/DOCX filename and base64 data are required'}); const raw=Buffer.from(body.data,'base64'); if(raw.length>25*1024*1024) return json(res,413,{error:'Maximum document size is 25 MB'}); const id=crypto.randomUUID(); const storedName=id+ext; fs.writeFileSync(path.join(DATA_DIR,storedName),raw); documents.unshift({id,title,category:String(body.category||'').trim(),type:ext==='.pdf'?'pdf':'docx',filename,storedName,updatedAt:new Date().toISOString()}); saveMeta(); return json(res,200,{ok:true,id}); } catch(e){ console.error(e); return json(res,400,{error:e.message||'Upload failed'}); }
    }
    if(req.method==='DELETE' && url.pathname==='/api/admin/guides') { const id=url.searchParams.get('id'); const idx=documents.findIndex(d=>d.id===id); if(idx<0) return json(res,404,{error:'Not found'}); const [doc]=documents.splice(idx,1); try{fs.unlinkSync(path.join(DATA_DIR,doc.storedName));}catch{} saveMeta(); return json(res,200,{ok:true}); }
  }
  return false;
}

const server=http.createServer(async(req,res)=>{
  try { const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); if(url.pathname.startsWith('/api/')) { const handled=await api(req,res,url); if(handled!==false) return; } let p=url.pathname==='/'?'/index.html':url.pathname; const file=path.normalize(path.join(ROOT,p)); if(!file.startsWith(ROOT)) return send(res,403,'Forbidden','text/plain'); if(!fs.existsSync(file)||fs.statSync(file).isDirectory()) return send(res,404,'Not found','text/plain'); const ext=path.extname(file).toLowerCase(); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}; res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache'}); fs.createReadStream(file).pipe(res); } catch(e){ console.error(e); send(res,500,'Server error','text/plain'); }
});
server.listen(PORT,()=>console.log(`ESP32 Flasher v1.2.6 → http://localhost:${PORT}`));
