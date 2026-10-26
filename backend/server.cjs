// Zero-dependency HTTP backend. Static frontend and API share one origin.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const catalog = require('./data/catalog.json');
const points = require('./data/tourism-poi.json');
const frontend = path.resolve(__dirname, '../frontend');
const rasterKeys = ['ESI','TSI','TPI','TRSI','ETSI','NDVI','NDWI','LULC','ELEVATION','SLOPE','CLIMATE','POPULATION'];
const labels = ['Ekoturizmga moslik','Turizmga moslik','Turistik salohiyat','Rekreatsiya mosligi','Ekoturizm-turizm mosligi','O‘simlik qoplami','Suv indeksi','Yer qoplami','Balandlik','Qiyalik','Iqlim','Aholi'];
const layers = rasterKeys.map((key,i) => ({key, label:labels[i], imageUrl:`/rasters/${key}.png`, bounds:[[37.17,55.99],[45.59,73.15]]}));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8'};
function send(res, status, value) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw)>8192) throw Object.assign(new Error('So‘rov juda katta'),{status:413});
  }
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('JSON noto‘g‘ri'),{status:400}); }
}
function createServer({favoritesFile = path.join(__dirname,'data/favorites.json')} = {}) {
  // Serialize read-modify-write operations to avoid losing concurrent changes.
  let queue = Promise.resolve();
  async function readFavorites() {
    try { return JSON.parse(await fs.readFile(favoritesFile,'utf8')); }
    catch(e) { if(e.code==='ENOENT') return []; throw e; }
  }
  function mutate(fn) {
    const operation = queue.then(async () => {
      const list = await readFavorites();
      const result = fn(list);
      await fs.mkdir(path.dirname(favoritesFile),{recursive:true});
      await fs.writeFile(favoritesFile+'.tmp',JSON.stringify(list,null,2));
      await fs.rename(favoritesFile+'.tmp',favoritesFile);
      return result;
    });
    queue = operation.catch(()=>{});
    return operation;
  }
  return http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      const url = new URL(req.url,'http://localhost');
      const route = decodeURIComponent(url.pathname);
      const q = url.searchParams;
      if(route.startsWith('/api/')) {
        if(req.method==='GET' && route==='/api/health') return send(res,200,{status:'ok'});
        if(req.method==='GET' && route==='/api/catalog') return send(res,200,{...catalog,layers,pointCount:points.length,types:[...new Set(points.map(p=>p.type))].sort()});
        if(req.method==='GET' && route==='/api/regions') {
          const index=q.get('index')||'ESI';
          if(!catalog.indices[index]) return send(res,400,{error:'Indeks topilmadi'});
          const search=(q.get('q')||'').toLocaleLowerCase();
          return send(res,200,catalog.regions.filter(r=>r.name.toLocaleLowerCase().includes(search)).sort((a,b)=>b[index]-a[index]));
        }
        if(req.method==='GET' && route==='/api/points') {
          const limit=Number(q.get('limit')||200), offset=Number(q.get('offset')||0);
          if(!Number.isInteger(limit)||limit<1||limit>20000||!Number.isInteger(offset)||offset<0) return send(res,400,{error:'limit: 1–20000, offset: 0 yoki katta butun son'});
          const bounds=q.has('bbox')?q.get('bbox').split(',').map(Number):null;
          if(bounds && (bounds.length!==4 || bounds.some(n=>!Number.isFinite(n)) || bounds[0]>bounds[2] || bounds[1]>bounds[3])) return send(res,400,{error:'bbox: west,south,east,north'});
          const search=(q.get('q')||'').toLocaleLowerCase();
          const found=points.filter(p=>(!search||p.name.toLocaleLowerCase().includes(search))&&(!q.get('type')||p.type===q.get('type'))&&(!bounds||(p.lng>=bounds[0]&&p.lat>=bounds[1]&&p.lng<=bounds[2]&&p.lat<=bounds[3])));
          return send(res,200,{total:found.length,offset,limit,points:found.slice(offset,offset+limit)});
        }
        if(req.method==='GET' && route==='/api/favorites') { await queue; return send(res,200,await readFavorites()); }
        if(req.method==='POST' && route==='/api/favorites') {
          const data=await body(req), point=points.find(p=>p.id===data?.pointId);
          if(!point) return send(res,400,{error:'Nuqta topilmadi'});
          const favorite=await mutate(list=> {
            const existing=list.find(f=>f.pointId===point.id);
            if(existing) return existing;
            const item={id:randomUUID(),pointId:point.id,name:point.name,lat:point.lat,lng:point.lng,type:point.type,createdAt:new Date().toISOString()};
            list.push(item); return item;
          });
          return send(res,201,favorite);
        }
        if(req.method==='DELETE' && /^\/api\/favorites\/[^/]+$/.test(route)) {
          const id=route.split('/').pop();
          const deleted=await mutate(list=>{const i=list.findIndex(f=>f.id===id); if(i<0)return false;list.splice(i,1);return true;});
          return send(res,deleted?200:404,deleted?{ok:true}:{error:'Topilmadi'});
        }
        return send(res,404,{error:'API yo‘li topilmadi'});
      }
      if(!['GET','HEAD'].includes(req.method)) return send(res,405,{error:'Method not allowed'});
      const file=path.resolve(frontend,'.'+(route==='/'?'/index.html':route));
      if(!file.startsWith(frontend+path.sep)) return send(res,403,{error:'Forbidden'});
      let content;
      try { content=await fs.readFile(file); } catch(e) { if(['ENOENT','EISDIR','ENOTDIR'].includes(e.code)) return send(res,404,{error:'Fayl topilmadi'}); throw e; }
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
      res.end(req.method==='HEAD'?undefined:content);
    } catch(e) { console.error(e.message); send(res,e.status||500,{error:e.status?e.message:'Server xatosi'}); }
  });
}
if(require.main===module) {
  const port=Number(process.env.PORT||3000);
  const server=createServer();
  server.on('error',e=>{console.error('Server ishga tushmadi:',e.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`GeoTour: http://localhost:${port}`));
}
module.exports={createServer};
