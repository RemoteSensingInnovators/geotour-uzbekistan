const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createServer}=require('./server.cjs');
test('API filtering, validation, persistence and static isolation',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'geotour-test-'));
  const favoritesFile=path.join(temp,'favorites.json');
  const server=createServer({favoritesFile});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const get=async route=>{const r=await fetch(base+route);assert.equal(r.status,200);return r.json();};
  try {
    const catalog=await get('/api/catalog');assert.equal(catalog.regions.length,14);assert.equal(catalog.layers.length,12);
    const points=await get('/api/points?type=museum&limit=2');assert.equal(points.points.length,2);assert.ok(points.points.every(p=>p.type==='museum'));
    const bounds=await get('/api/points?bbox=69,41,70,42&limit=20000');assert.ok(bounds.points.every(p=>p.lng>=69&&p.lng<=70&&p.lat>=41&&p.lat<=42));
    const regions=await get('/api/regions?index=ESI');assert.equal(regions[0].name,'Surxondaryo');
    assert.equal((await fetch(base+'/api/points?limit=-1')).status,400);
    assert.equal((await fetch(base+'/api/points?bbox=1,2,3')).status,400);
    assert.equal((await fetch(base+'/api/regions?index=invalid')).status,400);
    assert.equal((await fetch(base+'/api/favorites',{method:'POST',body:'not json'})).status,400);
    assert.equal((await fetch(base+'/api/favorites',{method:'POST',body:'null'})).status,400);
    const save=()=>fetch(base+'/api/favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pointId:points.points[0].id})});
    const responses=await Promise.all([save(),save()]);assert.ok(responses.every(r=>r.status===201));
    const favorites=await get('/api/favorites');assert.equal(favorites.length,1);
    assert.equal(JSON.parse(await fs.readFile(favoritesFile,'utf8')).length,1);
    const second=createServer({favoritesFile});await new Promise(resolve=>second.listen(0,'127.0.0.1',resolve));
    try {const r=await fetch(`http://127.0.0.1:${second.address().port}/api/favorites`);assert.equal((await r.json()).length,1);}
    finally {await new Promise(resolve=>second.close(resolve));}
    assert.equal((await fetch(base+'/api/favorites/'+favorites[0].id,{method:'DELETE'})).status,200);assert.equal((await get('/api/favorites')).length,0);
    const html=await fetch(base+'/');assert.equal(html.status,200);assert.match(await html.text(),/GeoTour Uzbekistan/);
    assert.equal((await fetch(base+'/rasters/ESI.png')).status,200);
    assert.equal((await fetch(base+'/vendor/leaflet.js')).status,200);
    assert.equal((await fetch(base+'/backend/data/catalog.json')).status,404);
    assert.equal((await fetch(base+'/%2e%2e%2fbackend/server.cjs')).status,403);
  } finally {await new Promise(resolve=>server.close(resolve));await fs.rm(temp,{recursive:true,force:true});}
});
