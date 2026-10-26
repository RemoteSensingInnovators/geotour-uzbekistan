/* Editable browser application: API requests, Leaflet layers and UI rendering. */
'use strict';
const $ = (id) => document.getElementById(id);
const state = { index:'ESI', layer:'ESI', query:'', type:'', basemap:'osm', points:[], favorites:[], limit:60 };
const basemaps = {
  osm:{url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution:'© OpenStreetMap contributors',maxNativeZoom:19},
  satellite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attribution:'Tiles © Esri',maxNativeZoom:18},
  terrain:{url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',attribution:'© OpenTopoMap · © OpenStreetMap contributors',maxNativeZoom:17}
};
const palette = ['#d73027','#fc8d59','#fee08b','#91cf60','#1a9850'];
const legends = {
  NDVI:{labels:['−0.2','0','0.2','0.4','0.8'],colors:['#7f3b08','#fdb863','#ffffbf','#b2df8a','#1b7837']},
  NDWI:{labels:['−0.5','−0.1','0.2','0.5','0.8'],colors:['#737373','#d9f0ff','#92c5de','#4393c3','#2166ac']},
  ELEVATION:{labels:['0','500','1500','3000','4500 m'],colors:['#1a9850','#91cf60','#fee08b','#a6611a','#fff']},
  SLOPE:{labels:['0°','5°','15°','30°','45°'],colors:['#fff','#ffffb2','#fecc5c','#fd8d3c','#bd0026']},
  CLIMATE:{labels:['Noqulay','Past','O‘rta','Yaxshi','Qulay'],colors:['#2166ac','#67a9cf','#ffffbf','#fdae61','#b2182b']},
  POPULATION:{labels:['Siyrak','Past','O‘rta','Yuqori','Zich'],colors:['#ffffcc','#dfc27d','#c2a5cf','#9970ab','#542788']},
  LULC:{labels:['Daraxt','Ekin','Yer','Suv'],colors:['#006400','#ffbb22','#ffff4c','#f096ff','#fa0000','#b4b4b4','#f0f0f0','#0064c8','#0096a0','#00cf75','#fae6a0']}
};
let catalog, map, baseLayer, raster, regionGroup, pointGroup, refreshVersion=0, toastTimer;
function el(tag, className, text) {
  const node=document.createElement(tag);
  if(className) node.className=className;
  if(text!==undefined) node.textContent=text;
  return node;
}
function toast(message) {
  $('toast').textContent=message; $('toast').hidden=false;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,3500);
}
async function api(url,options) {
  const response=await fetch(url,options);
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||'Server bilan aloqa yo‘q');
  return data;
}
function mapMessage(message) { $('map-message').textContent=message; $('map-message').hidden=!message; }
function setBasemap(key) {
  if(baseLayer) map.removeLayer(baseLayer);
  state.basemap=key;
  if(basemaps[key]) {
    baseLayer=L.tileLayer(basemaps[key].url,{...basemaps[key],maxZoom:19}).addTo(map);
    baseLayer.on('tileerror',()=>mapMessage('Fon xaritasi yuklanmadi. Internetni tekshiring yoki boshqa fonni tanlang.'));
    baseLayer.on('load',()=>mapMessage(''));
  } else { baseLayer=null; mapMessage(''); }
  document.querySelectorAll('[data-map]').forEach(button=>button.classList.toggle('selected',button.dataset.map===key));
}
function drawRaster() {
  if(raster) map.removeLayer(raster);
  const layer=catalog.layers.find(l=>l.key===state.layer);
  raster=L.imageOverlay(layer.imageUrl,layer.bounds,{opacity:Number($('opacity').value)/100,interactive:false});
  raster.on('error',()=>mapMessage('Raster fayli yuklanmadi. frontend/rasters papkasini tekshiring.'));
  if($('raster-toggle').checked) raster.addTo(map);
  $('legend-title').textContent=state.layer+' · '+layer.label;
  $('layer-description').textContent=catalog.indices[state.layer]?.description||layer.label;
  const legend=legends[state.layer]||{labels:['0–20','21–40','41–60','61–80','81–100'],colors:palette};
  $('legend-colors').replaceChildren(...legend.colors.map(color=>{const i=el('i');i.style.background=color;return i;}));
  $('legend-labels').replaceChildren(...legend.labels.map(label=>el('span','',label)));
}
function focusPoint(point) { map.flyTo([point.lat,point.lng],12); }
function googleLink(point) {
  const link=el('a','','Google Maps ↗');
  link.href=`https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
  link.target='_blank'; link.rel='noreferrer'; return link;
}
function popup(point) {
  const node=el('div'); node.append(el('b','',point.name),el('small','',point.type),el('br'),googleLink(point),el('br'));
  const save=el('button','','☆ Saqlash');
  save.addEventListener('click',()=>saveFavorite(point));node.append(save);return node;
}
function drawRegions() {
  regionGroup.clearLayers();
  for(const region of catalog.regions) {
    const color=catalog.indices[state.index].color;
    const marker=L.circleMarker([region.lat,region.lng],{radius:8,weight:2,color:'#fff',fillColor:color,fillOpacity:1});
    marker.bindTooltip(region.name,{direction:'top'});
    const content=el('div');content.append(el('b','',region.name));
    for(const index of Object.keys(catalog.indices)) content.append(el('div','',`${index}: ${region[index]} / 100`));
    marker.bindPopup(content);regionGroup.addLayer(marker);
  }
}
function drawPoints() {
  pointGroup.clearLayers();
  const zoom=map.getZoom(), bounds=map.getBounds();
  // National view aggregates into screen-sized cells. Zoom in to inspect individual places.
  if(zoom<10) {
    const cells=new Map();
    for(const point of state.points) {
      if(!bounds.contains([point.lat,point.lng])) continue;
      const pos=map.project([point.lat,point.lng],zoom),key=`${Math.floor(pos.x/36)},${Math.floor(pos.y/36)}`;
      const cell=cells.get(key)||{lat:0,lng:0,count:0,point};
      cell.lat+=point.lat;cell.lng+=point.lng;cell.count++;cells.set(key,cell);
    }
    for(const cell of cells.values()) {
      const lat=cell.lat/cell.count,lng=cell.lng/cell.count;
      const marker=L.circleMarker([lat,lng],{radius:Math.min(17,4+Math.log2(cell.count+1)*2),weight:1,color:'#fff',fillColor:'#0c6c66',fillOpacity:.8});
      if(cell.count===1) marker.bindPopup(popup(cell.point));
      else {marker.bindTooltip(`${cell.count} ta obyekt`);marker.on('click',()=>map.flyTo([lat,lng],Math.min(12,zoom+2)));}
      pointGroup.addLayer(marker);
    }
  } else {
    for(const point of state.points) {
      if(!bounds.contains([point.lat,point.lng])) continue;
      pointGroup.addLayer(L.circleMarker([point.lat,point.lng],{radius:4,weight:1,color:'#fff',fillColor:'#087e78',fillOpacity:.9}).bindPopup(popup(point)));
    }
  }
}
function pointRow(point, favorite=false) {
  const row=el('div','point-row'), focus=el('button');
  focus.append(document.createTextNode(point.name),el('small','',point.type));
  focus.addEventListener('click',()=>{focusPoint(point);L.popup().setLatLng([point.lat,point.lng]).setContent(popup(point)).openOn(map);});
  const saved=state.favorites.some(f=>f.pointId===point.id);
  const action=el('button','save'+(saved?' saved':''),favorite?'×':saved?'★':'☆');
  action.setAttribute('aria-label',favorite?'Saqlangan joyni o‘chirish':`${point.name}ni saqlash`);
  action.disabled=!favorite&&saved;
  action.addEventListener('click',()=>favorite?deleteFavorite(point.id):saveFavorite(point));row.append(focus,action);return row;
}
function renderPointList() {
  $('points').replaceChildren(...state.points.slice(0,state.limit).map(p=>pointRow(p)));
  $('point-summary').textContent=`${state.points.length.toLocaleString()} ta obyekt topildi · ${Math.min(state.limit,state.points.length)} tasi ro‘yxatda`;
  $('more').hidden=state.limit>=state.points.length;
}
async function refresh() {
  const version=++refreshVersion;
  try {
    const params=new URLSearchParams({q:state.query,type:state.type,limit:20000});
    const [pointsResult,regions]=await Promise.all([
      api('/api/points?'+params),api('/api/regions?'+new URLSearchParams({index:state.index,q:state.query}))
    ]);
    if(version!==refreshVersion) return;
    state.points=pointsResult.points;state.limit=60;
    $('point-count').textContent=pointsResult.total.toLocaleString();
    $('region-count').textContent=regions.length;
    $('ranking-label').textContent=catalog.indices[state.index].uz+' · /100';
    $('ranking').replaceChildren(...regions.map((region,i)=>{
      const row=el('button','rank-row'),main=el('span','rank-main',region.name),bar=el('div','bar'),fill=el('i');
      fill.style.width=region[state.index]+'%';fill.style.background=catalog.indices[state.index].color;bar.append(fill);main.append(bar);
      row.append(el('span','rank-number',String(i+1).padStart(2,'0')),main,el('b','score',region[state.index]));
      row.addEventListener('click',()=>{map.flyTo([region.lat,region.lng],9);});return row;
    }));
    if(!regions.length) $('ranking').append(el('p','muted','Mos hudud topilmadi.'));
    renderPointList();drawPoints();
  } catch(error) {toast(error.message);}
}
async function loadFavorites() {
  state.favorites=await api('/api/favorites');
  $('favorite-count').textContent=state.favorites.length;
  $('favorites').replaceChildren(...state.favorites.map(point=>pointRow(point,true)));
  if(!state.favorites.length) $('favorites').append(el('p','muted','☆ tugmasi bilan joylarni saqlang.'));
  renderPointList();
}
async function saveFavorite(point) {
  try { await api('/api/favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pointId:point.pointId||point.id})}); await loadFavorites();toast('Joy saqlandi'); }
  catch(error) {toast(error.message);}
}
async function deleteFavorite(id) {
  try {await api('/api/favorites/'+encodeURIComponent(id),{method:'DELETE'});await loadFavorites();toast('Joy o‘chirildi');}
  catch(error) {toast(error.message);}
}
function exportCSV() {
  const indices=Object.keys(catalog.indices);
  const cell=value=>'"'+String(value).replaceAll('"','""')+'"';
  const rows=[['Hudud',...indices],...catalog.regions.map(r=>[r.name,...indices.map(i=>r[i])])];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const link=el('a');link.href=url;link.download='geotour-hududlar.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function init() {
  catalog=await api('/api/catalog');
  if(!window.L) throw new Error('Leaflet topilmadi: frontend/vendor papkasini tekshiring.');
  map=L.map('map',{center:[41.1,64.6],zoom:6,minZoom:4,maxZoom:19,zoomControl:false,preferCanvas:true});
  L.control.zoom({position:'topright'}).addTo(map);
  regionGroup=L.layerGroup().addTo(map);pointGroup=L.layerGroup().addTo(map);
  setBasemap('osm');
  for(const [key,index] of Object.entries(catalog.indices)) {
    const card=el('button','index-card'+(key===state.index?' active':''));card.dataset.index=key;card.style.setProperty('--accent',index.color);
    const label=el('span');label.append(el('strong','',index.uz),el('small','',index.name));card.append(el('span','index-code',key),label);
    card.addEventListener('click',()=>{
      state.index=key;state.layer=key;$('layer').value=key;
      document.querySelectorAll('.index-card').forEach(c=>c.classList.toggle('active',c.dataset.index===key));
      drawRaster();drawRegions();refresh();
    });$('indices').append(card);
  }
  for(const layer of catalog.layers) {const option=el('option','',`${layer.key} — ${layer.label}`);option.value=layer.key;$('layer').append(option);}
  for(const type of catalog.types) {const option=el('option','',type.replaceAll('_',' '));option.value=type;$('type').append(option);}
  $('layer').addEventListener('change',()=>{state.layer=$('layer').value;drawRaster();});
  $('raster-toggle').addEventListener('change',()=>{$('raster-toggle').checked?raster.addTo(map):map.removeLayer(raster);});
  $('opacity').addEventListener('input',()=>{raster.setOpacity(Number($('opacity').value)/100);$('opacity-value').textContent=$('opacity').value+'%';});
  for(const [id,group] of [['regions-toggle',regionGroup],['points-toggle',pointGroup]]) $(id).addEventListener('change',()=>$(id).checked?group.addTo(map):map.removeLayer(group));
  document.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',()=>setBasemap(button.dataset.map)));
  let searchTimer;
  $('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=$('search').value.trim();refresh();},250);});
  $('type').addEventListener('change',()=>{state.type=$('type').value;refresh();});
  $('more').addEventListener('click',()=>{state.limit+=60;renderPointList();});
  $('reset').addEventListener('click',()=>map.flyTo([41.1,64.6],6));
  $('export').addEventListener('click',exportCSV);
  $('about-button').addEventListener('click',()=>$('about').showModal());
  $('close-about').addEventListener('click',()=>$('about').close());
  map.on('moveend',drawPoints);new ResizeObserver(()=>map.invalidateSize()).observe($('map'));
  drawRaster();drawRegions();await Promise.all([refresh(),loadFavorites()]);
  $('status').textContent=`● API ulandi · ${catalog.pointCount.toLocaleString()} obyekt`;
}
init().catch(error=>{$('status').textContent='Ulanishda xato';toast(error.message);mapMessage(error.message);});
