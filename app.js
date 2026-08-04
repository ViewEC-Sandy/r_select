import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, addDoc, deleteDoc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const FIELDS = [
  ['specManagementId','商品規格管理編號','text','import'],['productManagementId','商品管理編號','text','import'],['title','商品標題','text','import'],
  ['spec1','規格1','text','import'],['spec2','規格2','text','import'],['spec3','規格3','text','import'],['note','備註','textarea','editable'],
  ['taiwanUrl','台灣URL','url','import'],['japanUrl','日本URL','url','import'],['rtwBaseSku','RTWBase SKU','text','import'],['storeCode','店鋪編號','text','calculated'],['storeName','店鋪名','text','calculated'],
  ['active','上架','boolean','editable'],['priceJPY','日幣售價(JPY)','number','editable'],['weightG','重量(g)','number','editable'],
  ['productCostTWD','商品成本(TWD)','number','calculated'],['domesticShippingJPY','日本國內運費(JPY)','number','calculated'],['domesticShippingTWD','日本國內運費(TWD)','number','calculated'],['logisticsMethod','物流方式','text','calculated'],
  ['uniCostTWD','統一成本(TWD)','number','calculated'],['nisshinCostTWD','新日誠成本(TWD)','number','calculated'],['fixedLogisticsCostTWD','固定規則物流成本(TWD)','number','calculated'],
  ['manualPriceTWD','商品台幣售價(手動)','number','calculated'],['customerShippingTWD','客收運費(TWD)','number','calculated'],['grossReceivedTWD','原實收(TWD)','number','calculated'],
  ['platformFeeTWD','平台費(TWD)','number','calculated'],['profitTWD','利潤(TWD)','number','calculated'],['profitRate','利潤率','percent','calculated'],
  ['suggestedPrice30TWD','30%利潤建議售價(TWD)','number','calculated'],['pageViews','頁面檢視總數','number','import'],['unitsSold','銷售商品數','number','import'],
  ['orderCount','銷售訂單數','number','import'],['salesRevenueTWD','營業額(TWD)','number','calculated'],['shippingReceivedTWD','已收運費(TWD)','number','calculated'],['conversionRate','轉換率','percent','calculated']
];
const FIELD_MAP = Object.fromEntries(FIELDS.map(f=>[f[0],{key:f[0],label:f[1],type:f[2],mode:f[3]}]));
const IMPORT_ALIASES = {
  specManagementId:['商品規格管理編號','SKU','sku'], productManagementId:['商品管理編號','商品管理編號 (Base SKU)','商品管理編號(Base SKU)','Base SKU','商品編號'], title:['商品標題','商品名稱','商品名'],
  spec1:['規格1'], spec2:['規格2'], spec3:['規格3'], note:['備註'], taiwanUrl:['商品網址','台灣URL','台灣網址'], japanUrl:['參考URL #1','參考URL#1','日本URL','日本網址'], rtwBaseSku:['RTWBase SKU','RTWBaseSKU'],
  priceJPY:['日幣售價(JPY)','日幣售價','日幣售價 (JPY)','售價(JPY)','售價 (JPY)','日本售價','日本價格','JPY價格'],
  manualPriceTWD:['價格','商品台幣售價(手動)','商品台幣售價','台幣售價','售價(TWD)','售價 (TWD)','TWD價格'],
  weightG:['重量(g)','重量'], pageViews:['頁面檢視','頁面檢視總數','頁面檢視總數/月'],
  unitsSold:['售出單位','銷售商品數','銷售數'], orderCount:['訂單計數','銷售訂單數']
};
const DEFAULT_PARAMS = { productCostRate:.2, freeDomesticJPY:3980, domesticShippingJPY:800, platformFeeRate:.12, targetProfitRate:.3, customerShippingPerKgTWD:199, freeShippingTWD:5000, uniFirstKgTWD:205, uniEachHalfKgTWD:102.5, nisshinRate:.2, nisshinDiscount:.85, nisshinFixedFeeTWD:82, tiers:[[.5,1450],[.6,1600],[.7,1750],[.8,1900],[.9,2050],[1,2200],[1.25,2500],[1.5,2800],[1.75,3100],[2,3400],[2.5,3900],[3,4400],[3.5,4900],[4,5400],[4.5,5900],[5,6400],[5.5,6900],[6,7400],[7,8200],[8,9000],[9,9800],[10,10600],[11,11400],[12,12200],[13,13000]] };
const PARAM_DEFS = [['productCostRate','商品成本匯率'],['freeDomesticJPY','日本國內免運門檻(JPY)'],['domesticShippingJPY','預設日本國內運費(JPY)'],['platformFeeRate','平台費率'],['targetProfitRate','目標利潤率'],['customerShippingPerKgTWD','客收運費/公斤(TWD)'],['freeShippingTWD','台幣免運門檻(TWD)'],['uniFirstKgTWD','統一數網首重1kg(TWD)'],['uniEachHalfKgTWD','統一數網續重0.5kg(TWD)'],['nisshinRate','新日誠物流匯率'],['nisshinDiscount','新日誠物流折扣'],['nisshinFixedFeeTWD','新日誠物流固定作業費(TWD)']];
const PLATFORMS=[{id:'taiwan_rakuten',name:'台灣樂天'},{id:'rianyou_shopify',name:'日安優物 Shopline'}];
const MAINT_COLLECTIONS={products:'商品主檔',sales:'銷售',orders:'唯一訂單',imports:'匯入紀錄',platforms:'平台資料',stores:'店鋪資料'};
const DEFAULT_COLUMNS=['specManagementId','productManagementId','title','storeCode','taiwanUrl','japanUrl','active','priceJPY','domesticShippingJPY','domesticShippingTWD','weightG','manualPriceTWD','profitTWD','profitRate'];
const SALES_COLUMNS=['specManagementId','productManagementId','title','storeCode','taiwanUrl','japanUrl','active','pageViews','unitsSold','orderCount','salesRevenueTWD','shippingReceivedTWD','conversionRate','manualPriceTWD','profitTWD','profitRate'];
let products=[], stores=[], salesHistory=[], storeMap=new Map(), params={...DEFAULT_PARAMS}, visibleColumns=JSON.parse(localStorage.getItem('visibleColumns')||'null')||DEFAULT_COLUMNS, salesVisibleColumns=JSON.parse(localStorage.getItem('salesVisibleColumns')||'null')||SALES_COLUMNS, page=1; const PAGE_SIZE=50;
let currentView='products', selectedProductIds=new Set(), discountResults=[], salesTrendChart=null, rankingChart=null, trafficTrendChart=null, platformRevenueChart=null;
let crossSort={key:'revenue',direction:'desc'}, platformSort={key:'revenue',direction:'desc'};
let sortState={key:'',direction:'asc'}, columnFilters={}, activeFilterKey='';
const $=id=>document.getElementById(id); const n=v=>Number(v)||0; const round=v=>Math.round(v); const ceilKg=g=>Math.ceil(n(g)/1000);
function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),2800)}
function setImportProgress(message,percent=null){
  const el=$('importStatus');
  if(!el)return;
  const pct=percent===null?'':` ${Math.max(0,Math.min(100,Math.round(percent)))}%`;
  el.textContent=`${message}${pct}`;
}
function yieldToUI(){return new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)))}
async function withTimeout(promise,ms,message){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms)})])}finally{clearTimeout(timer)}}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function cleanText(v){return String(v??'').replace(/\u00a0/g,' ').replace(/\u3000/g,' ').replace(/[\r\n\t]+/g,' ').trim()}
function cleanHeader(v){return cleanText(v).replace(/\s+/g,'').replace(/[（]/g,'(').replace(/[）]/g,')')}
function cleanNumber(v){
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number')return Number.isFinite(v)?v:null;

  let s=String(v).trim();
  if(!s)return null;

  // Excel / CSV 常見「以文字儲存的數字」正規化。
  const fw={'０':'0','１':'1','２':'2','３':'3','４':'4','５':'5','６':'6','７':'7','８':'8','９':'9','．':'.','－':'-','＋':'+','％':'%','，':','};
  s=s.replace(/[０-９．－＋％，]/g,ch=>fw[ch]||ch).replace(/\u00A0/g,' ').trim();

  // (1,234) 視為 -1234。
  let negative=false;
  if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1)}

  // 移除千分位、貨幣符號、一般文字，只保留數字、小數點與正負號。
  s=s.replace(/[,，\s]/g,'')
     .replace(/NT\$|TWD|JPY|USD|RMB|CNY|¥|￥|\$/gi,'')
     .replace(/[^0-9.+-]/g,'');
  if(!s||s==='-'||s==='+'||s==='.')return null;

  const value=Number(s);
  if(!Number.isFinite(value))return null;
  return negative?-Math.abs(value):value;
}
function validUrl(v){const s=cleanText(v);if(!s)return '';try{return new URL(s).href}catch{return /^www\./i.test(s)?`https://${s}`:''}}
function extractStoreCode(...values){for(const value of values){const s=cleanText(value).toUpperCase();const m=s.match(/(?:^|[^A-Z0-9])(R\d{1,4})(?=[^A-Z0-9]|$)/i)||s.match(/^(R\d{1,4})/i);if(m)return m[1].toUpperCase()}return ''}
function getStore(base){const code=extractStoreCode(base.storeCode,base.productManagementId,base.specManagementId);return code?storeMap.get(code):null}
function compute(base){
  const p={...base}, ov=p.overrides||{}, price=n(p.priceJPY), weight=n(p.weightG), store=getStore(p);
  const storeCode=store?.code||extractStoreCode(p.storeCode,p.productManagementId,p.specManagementId);
  const storeName=store?.name||p.storeName||'';
  const japanUrl=validUrl(p.japanUrl)||'';
  const productCost=price?price*params.productCostRate:null;
  const domesticJPY=price?(price>=params.freeDomesticJPY?0:n(store?.shippingJPY)||params.domesticShippingJPY):null;
  const domestic=domesticJPY===null?null:domesticJPY*params.productCostRate;
  const method=weight?(weight<=600?'統一':'新日誠'):'';
  const uni=weight?(weight<=1000?params.uniFirstKgTWD:params.uniFirstKgTWD+Math.ceil((weight-1000)/500)*params.uniEachHalfKgTWD):null;
  let nisshin=null;if(weight){const kg=weight/1000;if(kg>13)nisshin='超重';else{const tier=params.tiers.find(([max])=>kg<=max);nisshin=tier?round(tier[1]*params.nisshinRate*params.nisshinDiscount+params.nisshinFixedFeeTWD):null}}
  const fixed=method==='統一'?uni:nisshin;
  const suggested=price?calcSuggested(productCost,domestic,fixed,weight):null;
  const manual=ov.manualPriceTWD?n(p.manualPriceTWD):suggested;
  const customer=manual!==null?(manual>=params.freeShippingTWD?0:ceilKg(weight)*params.customerShippingPerKgTWD):null;
  const gross=manual!==null?manual+customer:null;
  const fee=manual!==null?manual*params.platformFeeRate:null;
  const profit=gross!==null&&typeof fixed==='number'?gross-fee-fixed-productCost-domestic:null;
  const margin=gross?profit/gross:null;
  const conversion=n(p.pageViews)>0?n(p.orderCount)/n(p.pageViews):null;
  const values={storeCode,storeName,japanUrl,productCostTWD:productCost,domesticShippingJPY:domesticJPY,domesticShippingTWD:domestic,logisticsMethod:method,uniCostTWD:uni,nisshinCostTWD:nisshin,fixedLogisticsCostTWD:fixed,manualPriceTWD:manual,customerShippingTWD:customer,grossReceivedTWD:gross,platformFeeTWD:fee,profitTWD:profit,profitRate:margin,suggestedPrice30TWD:suggested,conversionRate:conversion};
  Object.keys(values).forEach(k=>{if(ov[k])values[k]=p[k]});return {...p,...values};
}
function calcSuggested(j,k,o,weight){const target=params.targetProfitRate,denom=1-params.platformFeeRate-target;if(denom<=0)return null;const ship=ceilKg(weight)*params.customerShippingPerKgTWD;const candidate=((n(j)+n(k)+n(o))-ship*(1-target))/denom;return round(candidate>=params.freeShippingTWD?(n(j)+n(k)+n(o))/denom:candidate)}
function reverseJPYFromTargetTWD(targetPriceTWD,weight,store){
  const manual=Number(targetPriceTWD), rate=Number(params.productCostRate), target=Number(params.targetProfitRate);
  if(!Number.isFinite(manual)||manual<=0||!Number.isFinite(rate)||rate<=0)return null;
  const w=n(weight);
  const method=w?(w<=600?'統一':'新日誠'):'';
  const uni=w?(w<=1000?params.uniFirstKgTWD:params.uniFirstKgTWD+Math.ceil((w-1000)/500)*params.uniEachHalfKgTWD):0;
  let nisshin=0;
  if(w){const kg=w/1000;if(kg>13)return null;const tier=params.tiers.find(([max])=>kg<=max);nisshin=tier?round(tier[1]*params.nisshinRate*params.nisshinDiscount+params.nisshinFixedFeeTWD):0}
  const fixed=method==='統一'?n(uni):method==='新日誠'?n(nisshin):0;
  const customer=manual>=params.freeShippingTWD?0:ceilKg(w)*params.customerShippingPerKgTWD;
  const gross=manual+customer;
  const fee=manual*params.platformFeeRate;
  const marginForJPY=jpy=>{
    const productCost=jpy*rate;
    const domesticJPY=jpy>=params.freeDomesticJPY?0:(n(store?.shippingJPY)||params.domesticShippingJPY);
    const domestic=domesticJPY*rate;
    const profit=gross-fee-fixed-productCost-domestic;
    return gross?profit/gross:-Infinity;
  };
  // 找出使既有 Params 利潤率最接近目標利潤率的日幣價格。
  let lo=0,hi=Math.max(params.freeDomesticJPY*2,manual/rate*2,10000);
  while(marginForJPY(hi)>target&&hi<100000000)hi*=2;
  for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(marginForJPY(mid)>target)lo=mid;else hi=mid}
  const candidates=[Math.floor(lo),Math.ceil(lo),Math.floor(hi),Math.ceil(hi),Math.floor(params.freeDomesticJPY-1),Math.ceil(params.freeDomesticJPY)].filter(x=>Number.isFinite(x)&&x>=0);
  let best=null,bestDiff=Infinity;
  for(const x of candidates){const diff=Math.abs(marginForJPY(x)-target);if(diff<bestDiff){best=x;bestDiff=diff}}
  return best===null?null:Math.round(best);
}
function formatInteger(v){const value=Number(v);return Number.isFinite(value)?Math.round(value).toLocaleString('zh-TW'):esc(v)}
function format(k,v){const t=FIELD_MAP[k]?.type;if(v===null||v===undefined||v==='')return '';if(k==='title'){const full=cleanText(v),shown=full.length>20?full.slice(0,20)+'…':full;return `<span class="title-cell" title="${esc(full)}">${esc(shown)}</span>`;}if(k==='storeCode'){const code=cleanText(v).toUpperCase(),url=validUrl(storeMap.get(code)?.url);return url?`<a class="url-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(code)} ↗</a>`:esc(code)}if(t==='url'){const url=validUrl(v);return url?`<a class="url-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">開啟 ↗</a>`:''}if(t==='percent')return(n(v)*100).toFixed(1)+'%';if(t==='number')return formatInteger(v);if(t==='boolean')return v?'<span class="badge">上架</span>':'<span class="badge off">下架</span>';return esc(v)}
async function ensurePlatforms(){for(const x of PLATFORMS)await setDoc(doc(db,'platforms',x.id),{name:x.name,active:true,updatedAt:serverTimestamp()},{merge:true})}
async function loadStores(){const snap=await getDocs(collection(db,'stores'));stores=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));storeMap=new Map(stores.map(s=>[String(s.code||s.id).toUpperCase(),s]))}
async function loadAll(){await ensurePlatforms();const setting=await getDoc(doc(db,'settings','params'));params=setting.exists()?{...DEFAULT_PARAMS,...setting.data()}:structuredClone(DEFAULT_PARAMS);await loadStores();const snap=await getDocs(collection(db,'products'));products=snap.docs.map(d=>({id:d.id,...d.data()})).map(compute);const salesSnap=await getDocs(collection(db,'sales'));salesHistory=salesSnap.docs.map(d=>({id:d.id,...d.data()}));renderAll();renderParams();if(currentView==='overview')renderOverview()}
function filterValueKey(key,value){const type=FIELD_MAP[key]?.type;if(value===null||value===undefined||value==='')return'__BLANK__';if(type==='boolean')return value?'true':'false';return String(value)}
function filterValueLabel(key,value){const type=FIELD_MAP[key]?.type;if(value===null||value===undefined||value==='')return'(空白)';if(type==='boolean')return value?'上架':'下架';if(type==='percent')return(n(value)*100).toFixed(1)+'%';if(type==='number')return formatInteger(value);return String(value)}
function matchesColumnFilter(p,key,filter){
  if(!filter)return true;
  const type=FIELD_MAP[key]?.type,value=p[key];
  if(Array.isArray(filter.selected)&&filter.selected.length&&!filter.selected.includes(filterValueKey(key,value)))return false;
  if(type==='number'||type==='percent'){
    const numeric=Number(value),min=filter.min===''||filter.min===undefined?null:Number(filter.min),max=filter.max===''||filter.max===undefined?null:Number(filter.max);
    if(!Number.isFinite(numeric))return min===null&&max===null;
    const compared=type==='percent'?numeric*100:numeric;
    return(min===null||compared>=min)&&(max===null||compared<=max);
  }
  if(type==='boolean')return true;
  return!filter.text||String(value??'').toLowerCase().includes(String(filter.text).toLowerCase());
}
function compareValues(a,b,key){const type=FIELD_MAP[key]?.type,av=a[key],bv=b[key];if(type==='number'||type==='percent')return(n(av)-n(bv));if(type==='boolean')return Number(!!av)-Number(!!bv);return String(av??'').localeCompare(String(bv??''),'zh-Hant',{numeric:true,sensitivity:'base'})}
function salesRowsInRange(){const start=$('salesFilterStart')?.value||'',end=$('salesFilterEnd')?.value||'';return salesHistory.filter(r=>dateInRange(r.date,start,end))}
function aggregateSalesProducts(){
  const result=new Map(products.map(p=>[p.id,{...p,pageViews:0,unitsSold:0,orderCount:0,salesRevenueTWD:0,shippingReceivedTWD:0,conversionRate:null}]));
  for(const r of salesRowsInRange()){
    const matches=products.filter(p=>cleanText(p.productManagementId)===cleanText(r.baseSKU))||[];
    const targets=matches.length?matches:(products.filter(p=>cleanText(p.specManagementId)===cleanText(r.specManagementId)));
    if(!targets.length)continue;
    const div=targets.length;
    for(const p of targets){const x=result.get(p.id);x.pageViews+=n(r.pageViews)/div;x.unitsSold+=n(r.unitsSold)/div;x.orderCount+=n(r.orderCount)/div;x.salesRevenueTWD+=n(r.revenueTWD||salesRowRevenue(r))/div;x.shippingReceivedTWD+=n(r.shippingReceivedTWD)/div;}
  }
  for(const x of result.values()){x.pageViews=round(x.pageViews);x.unitsSold=round(x.unitsSold);x.orderCount=round(x.orderCount);x.salesRevenueTWD=round(x.salesRevenueTWD);x.shippingReceivedTWD=round(x.shippingReceivedTWD);x.conversionRate=x.pageViews?x.orderCount/x.pageViews:null;}
  return [...result.values()];
}
function currentProductList(){return currentView==='sales'?aggregateSalesProducts():products}
function filtered(){
  const q=$('searchInput').value.trim().toLowerCase(),status=$('statusFilter').value;
  const list=currentProductList().filter(p=>(status==='all'||String(!!p.active)===status)&&(!q||[p.specManagementId,p.productManagementId,p.title,p.spec1,p.spec2,p.spec3,p.note,p.storeCode,p.storeName].some(v=>String(v||'').toLowerCase().includes(q)))&&Object.entries(columnFilters).every(([key,filter])=>matchesColumnFilter(p,key,filter)));
  if(sortState.key)list.sort((a,b)=>compareValues(a,b,sortState.key)*(sortState.direction==='asc'?1:-1));
  return list;
}
function renderAll(){renderTable();const list=filtered();$('statProducts').textContent=formatInteger(list.length);$('statActive').textContent=formatInteger(list.filter(p=>p.active).length);const margins=list.map(p=>p.profitRate).filter(Number.isFinite);$('statMargin').textContent=margins.length?(margins.reduce((a,b)=>a+b,0)/margins.length*100).toFixed(1)+'%':'0%';$('statUnits').textContent=formatInteger(list.reduce((s,p)=>s+n(p.unitsSold),0));if($('statRevenue'))$('statRevenue').textContent=formatInteger(list.reduce((s,p)=>s+n(p.salesRevenueTWD),0));if($('statShipping'))$('statShipping').textContent=formatInteger(list.reduce((s,p)=>s+n(p.shippingReceivedTWD),0));if($('statRevenueCard'))$('statRevenueCard').classList.toggle('hidden',currentView!=='sales');if($('statShippingCard'))$('statShippingCard').classList.toggle('hidden',currentView!=='sales');if($('salesDateFilters'))$('salesDateFilters').classList.toggle('hidden',currentView!=='sales');updateSelectionCount()}
function getUniqueFilterValues(key){const map=new Map();currentProductList().forEach(p=>{const raw=p[key],k=filterValueKey(key,raw);if(!map.has(k))map.set(k,raw)});return[...map.entries()].sort((a,b)=>compareValues({[key]:a[1]},{[key]:b[1]},key)).slice(0,500)}
function renderTable(){
  const list=filtered(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));page=Math.min(page,pages);
  const rows=list.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  const columns=currentView==='sales'?salesVisibleColumns:visibleColumns;
  const headerCheckbox=currentView==='products'?`<th class="select-cell"><input id="selectPageCheckbox" type="checkbox" title="選取本頁" ${rows.length&&rows.every(p=>selectedProductIds.has(p.id))?'checked':''}></th>`:'';
  $('tableHead').innerHTML='<tr class="column-title-row">'+headerCheckbox+columns.map(k=>{const active=sortState.key===k,hasFilter=!!columnFilters[k]&&Object.values(columnFilters[k]).some(v=>Array.isArray(v)?v.length:v!==''&&v!==undefined);return`<th><div class="excel-header"><span>${esc(FIELD_MAP[k].label)}</span><button type="button" class="excel-filter-button ${active||hasFilter?'active':''}" data-filter-menu="${k}" title="排序與篩選">${active?(sortState.direction==='asc'?'▲':'▼'):'▼'}</button></div></th>`}).join('')+'<th>操作</th></tr>';
  $('tableBody').innerHTML=rows.map(p=>'<tr>'+(currentView==='products'?`<td class="select-cell"><input type="checkbox" data-select-product="${p.id}" ${selectedProductIds.has(p.id)?'checked':''}></td>`:'')+columns.map(k=>`<td>${format(k,p[k])}</td>`).join('')+`<td class="action-cell"><button data-edit="${p.id}">編輯</button><button class="secondary" data-delete="${p.id}">刪除</button></td></tr>`).join('');
  $('pageInfo').textContent=`第 ${page} / ${pages} 頁，共 ${list.length.toLocaleString('zh-TW')} 筆`;$('prevPage').disabled=page<=1;$('nextPage').disabled=page>=pages;
  $('addProductBtn').classList.toggle('hidden',currentView==='sales');
  $('columnBtn').classList.remove('hidden');
}
function closeFilterMenu(){document.getElementById('excelFilterMenu')?.remove();activeFilterKey=''}
function openFilterMenu(key,anchor){closeFilterMenu();activeFilterKey=key;const type=FIELD_MAP[key]?.type,current=columnFilters[key]||{},values=getUniqueFilterValues(key),allKeys=values.map(([k])=>k),selected=Array.isArray(current.selected)&&current.selected.length?current.selected:allKeys;const panel=document.createElement('div');panel.id='excelFilterMenu';panel.className='excel-filter-menu';panel.innerHTML=`<button type="button" data-menu-sort="asc">⬆ 升冪排序</button><button type="button" data-menu-sort="desc">⬇ 降冪排序</button><button type="button" data-menu-clear-sort>清除排序</button><hr>${type==='number'||type==='percent'?`<div class="excel-range"><input type="number" step="any" data-menu-min placeholder="最小值" value="${esc(current.min??'')}"><span>～</span><input type="number" step="any" data-menu-max placeholder="最大值" value="${esc(current.max??'')}"></div>`:`<input class="excel-value-search" type="search" data-menu-search placeholder="搜尋文字或項目" value="${esc(current.text??'')}">`}<label class="excel-check-all"><input type="checkbox" data-menu-all ${selected.length===allKeys.length?'checked':''}>（全選）</label><div class="excel-value-list">${values.map(([valueKey,raw])=>`<label data-value-label="${esc(filterValueLabel(key,raw).toLowerCase())}"><input type="checkbox" data-menu-value value="${esc(valueKey)}" ${selected.includes(valueKey)?'checked':''}>${esc(filterValueLabel(key,raw))}</label>`).join('')}</div>${values.length>=500?'<div class="muted excel-limit">僅顯示前 500 個項目</div>':''}<div class="excel-filter-actions"><button type="button" class="secondary" data-menu-clear>清除篩選</button><button type="button" data-menu-apply>套用</button></div>`;document.body.appendChild(panel);const rect=anchor.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-panel.offsetWidth-12))+'px';panel.style.top=Math.max(8,Math.min(rect.bottom+4,window.innerHeight-panel.offsetHeight-12))+'px'}
function updateSelectionCount(){$('selectionCount').textContent=`已選 ${selectedProductIds.size.toLocaleString('zh-TW')} 筆`}
function setView(view){currentView=view;page=1;closeFilterMenu();['product','sales','overview','crossPlatform','platformCompare','import'].forEach(x=>{const b=$(x+'TabBtn');if(b)b.classList.toggle('active',view===x)});$('databaseView').classList.toggle('hidden',!['products','sales'].includes(view));$('overviewView').classList.toggle('hidden',view!=='overview');$('crossPlatformView').classList.toggle('hidden',view!=='crossPlatform');$('platformCompareView').classList.toggle('hidden',view!=='platformCompare');if($('importView'))$('importView').classList.toggle('hidden',view!=='imports');const title=$('pageTitle');if(title)title.textContent=view==='overview'?'營運總覽':view==='sales'?'銷售狀態':view==='crossPlatform'?'商品跨平台':view==='platformCompare'?'平台比較':view==='imports'?'資料匯入':'商品資料庫';if(view==='overview')renderOverview();else if(view==='crossPlatform')renderCrossPlatform();else if(view==='platformCompare')renderPlatformCompare();else if(view!=='imports')renderAll()}
function calculateDiscountProduct(p,discountPercent){
  const rate=Math.max(0,Math.min(100,n(discountPercent)))/100;
  const discountedPrice=Math.round(n(p.manualPriceTWD)*(1-rate));
  const customerShipping=discountedPrice>=params.freeShippingTWD?0:ceilKg(p.weightG)*params.customerShippingPerKgTWD;
  const gross=discountedPrice+customerShipping;
  const fee=discountedPrice*params.platformFeeRate;
  const profit=typeof p.fixedLogisticsCostTWD==='number'?gross-fee-n(p.fixedLogisticsCostTWD)-n(p.productCostTWD)-n(p.domesticShippingTWD):null;
  const margin=gross&&profit!==null?profit/gross:null;
  return {...p,discountPercent:rate,discountedPriceTWD:discountedPrice,discountedCustomerShippingTWD:customerShipping,discountedGrossTWD:gross,discountedPlatformFeeTWD:fee,discountedProfitTWD:profit,discountedProfitRate:margin};
}
function renderDiscountResults(){
  const percent=n($('discountPercent').value);const selected=products.filter(p=>selectedProductIds.has(p.id));discountResults=selected.map(p=>calculateDiscountProduct(p,percent));
  $('discountTableBody').innerHTML=discountResults.map(r=>`<tr><td>${esc(r.specManagementId||'')}</td><td title="${esc(r.title||'')}">${esc(shortTitle(r.title||''))}</td><td>${formatInteger(r.manualPriceTWD)}</td><td>${formatInteger(r.discountedPriceTWD)}</td><td>${r.discountedProfitTWD===null?'':formatInteger(r.discountedProfitTWD)}</td><td>${r.discountedProfitRate===null?'':(r.discountedProfitRate*100).toFixed(1)+'%'}</td></tr>`).join('');
  const valid=discountResults.filter(r=>Number.isFinite(r.discountedProfitRate));const avg=valid.length?valid.reduce((s,r)=>s+r.discountedProfitRate,0)/valid.length:0;const negative=discountResults.filter(r=>n(r.discountedProfitTWD)<0).length;
  $('discountSummary').innerHTML=`<span>試算商品<strong>${formatInteger(discountResults.length)}</strong></span><span>折扣<strong>${percent.toFixed(1)}%</strong></span><span>平均折後利潤率<strong>${(avg*100).toFixed(1)}%</strong></span><span>負利潤商品<strong>${formatInteger(negative)}</strong></span>`;
}
function openDiscountDialog(){if(!selectedProductIds.size)return toast('請先選取商品，或使用「選取全部篩選結果」');renderDiscountResults();$('discountDialog').showModal()}
function exportDiscountResults(){if(!discountResults.length)return toast('目前沒有試算結果');const rows=discountResults.map(r=>({'商品規格管理編號':r.specManagementId||'','商品管理編號':r.productManagementId||'','商品標題':r.title||'','折扣率':r.discountPercent,'原售價(TWD)':Math.round(n(r.manualPriceTWD)),'折扣後售價(TWD)':r.discountedPriceTWD,'折扣後客收運費(TWD)':r.discountedCustomerShippingTWD,'折扣後平台費(TWD)':Math.round(n(r.discountedPlatformFeeTWD)),'折扣後利潤(TWD)':r.discountedProfitTWD===null?'':Math.round(r.discountedProfitTWD),'折扣後利潤率':r.discountedProfitRate??''}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'折扣利潤試算');XLSX.writeFile(wb,`折扣利潤試算_${new Date().toISOString().slice(0,10)}.xlsx`)}

function renderColumns(){const current=currentView==='sales'?salesVisibleColumns:visibleColumns;const allowed=currentView==='sales'?FIELDS.filter(([k])=>SALES_COLUMNS.includes(k)):FIELDS;$('columnOptions').innerHTML=allowed.map(([k,l])=>`<label><input type="checkbox" value="${k}" ${current.includes(k)?'checked':''}>${esc(l)}</label>`).join('')}
function renderProductForm(p={}){const computed=compute(p);$('productId').value=p.id||'';$('productDialogTitle').textContent=p.id?'編輯商品':'新增商品';const pd=p.platformData||{};const platformHtml=`<div class="platform-editor full-span"><h3>平台資料</h3>${PLATFORMS.map(x=>`<fieldset><legend>${x.name}</legend><label><input type="checkbox" name="platform_${x.id}_enabled" ${pd[x.id]?.enabled?'checked':''}> 啟用此平台</label><label>售價<input type="number" step="any" name="platform_${x.id}_price" value="${esc(pd[x.id]?.price??'')}"></label><label>上架<select name="platform_${x.id}_active"><option value="true" ${pd[x.id]?.active!==false?'selected':''}>上架</option><option value="false" ${pd[x.id]?.active===false?'selected':''}>下架</option></select></label><label>備註<textarea name="platform_${x.id}_note">${esc(pd[x.id]?.note??'')}</textarea></label></fieldset>`).join('')}</div>`;$('productFields').innerHTML=platformHtml+FIELDS.filter(([k])=>!['conversionRate','storeCode','storeName','domesticShippingJPY'].includes(k)).map(([k,l,t,mode])=>{const v=computed[k]??'';if(k==='active')return`<label>${l}<select name="${k}"><option value="true" ${v!==false?'selected':''}>上架</option><option value="false" ${v===false?'selected':''}>下架</option></select></label>`;if(t==='textarea')return`<label>${l}<textarea name="${k}">${esc(v)}</textarea></label>`;const readonly=mode==='calculated'&&k==='logisticsMethod';const inputType=t==='number'||t==='percent'?'number':t==='url'?'url':'text';const step=t==='percent'?'0.0001':'any';const input=`<input name="${k}" type="${inputType}" step="${step}" value="${esc(v)}" ${readonly?'readonly':''}>`;if(mode==='calculated'&&!readonly)return`<label>${l}<span class="override-row">${input}<button type="button" class="secondary reset-override" data-reset="${k}">自動</button></span></label>`;return`<label>${l}${input}</label>`}).join('')}
function renderParams(){$('paramsFields').innerHTML=PARAM_DEFS.map(([k,l])=>`<label>${l}<input name="${k}" type="number" step="any" value="${params[k]}"></label>`).join('');$('shippingTierBody').innerHTML=params.tiers.map((t,i)=>`<tr><td><input name="tierMax_${i}" type="number" step="any" value="${t[0]}"></td><td><input name="tierFee_${i}" type="number" step="any" value="${t[1]}"></td></tr>`).join('')}
async function saveProduct(form){const fd=new FormData(form),id=$('productId').value,old=id?products.find(p=>p.id===id):{};const data={...old,overrides:{...(old?.overrides||{})}};FIELDS.forEach(([k,,t,mode])=>{if(['conversionRate','storeCode','storeName','domesticShippingJPY'].includes(k))return;const raw=fd.get(k);if(raw===null)return;data[k]=t==='number'||t==='percent'?(raw===''?null:Number(raw)):t==='boolean'?raw==='true':String(raw);if(mode==='calculated'&&k!=='logisticsMethod'&&raw!=='')data.overrides[k]=true});data.taiwanUrl=validUrl(data.taiwanUrl);data.japanUrl=validUrl(data.japanUrl);data.platformData={};PLATFORMS.forEach(x=>{data.platformData[x.id]={enabled:fd.get(`platform_${x.id}_enabled`)==='on',price:fd.get(`platform_${x.id}_price`)===''?null:Number(fd.get(`platform_${x.id}_price`)),active:fd.get(`platform_${x.id}_active`)==='true',note:String(fd.get(`platform_${x.id}_note`)||'')}});data.title=String(data.title||'').slice(0,100);data.updatedAt=serverTimestamp();if(!id)data.createdAt=serverTimestamp();const ref=id?doc(db,'products',id):doc(collection(db,'products'));await setDoc(ref,data,{merge:true});toast('商品已儲存');$('productDialog').close();await loadAll()}
function findHeader(row,aliases){const normalized=Object.fromEntries(Object.keys(row).map(k=>[cleanHeader(k),k]));for(const a of aliases){const hit=normalized[cleanHeader(a)];if(hit!==undefined)return hit}return null}
function normalizeImportRows(rows){let parent={productManagementId:'',title:'',note:'',taiwanUrl:'',japanUrl:'',rtwBaseSku:''};return rows.map(row=>{const data={};for(const [key,aliases] of Object.entries(IMPORT_ALIASES)){const h=findHeader(row,aliases);if(h!==null)data[key]=row[h]}for(const k of Object.keys(data))data[k]=typeof data[k]==='string'?cleanText(data[k]):data[k];for(const k of ['productManagementId','title','note','taiwanUrl','japanUrl','rtwBaseSku']){if(cleanText(data[k]))parent[k]=data[k];else data[k]=parent[k]}data.specManagementId=cleanText(data.specManagementId);data.productManagementId=cleanText(data.productManagementId);data.taiwanUrl=validUrl(data.taiwanUrl);data.japanUrl=validUrl(data.japanUrl);return data}).filter(r=>r.specManagementId)}
async function exportProducts(){const rows=products.map(p=>{const r={};FIELDS.forEach(([k,l])=>r[l]=p[k]??'');PLATFORMS.forEach(x=>{const d=p.platformData?.[x.id]||{};r[`${x.name}-啟用`]=!!d.enabled;r[`${x.name}-售價`]=d.price??'';r[`${x.name}-上架`]=d.active!==false;r[`${x.name}-備註`]=d.note??''});return r});const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'商品主檔');XLSX.writeFile(wb,`商品資料庫_${new Date().toISOString().slice(0,10)}.xlsx`)}
function normalizeImportedNumericFields(row){
  const numericHeaders=[
    '價格','商品台幣售價(手動)','商品台幣售價','台幣售價','售價(TWD)','售價 (TWD)','TWD價格',
    '日幣售價(JPY)','日幣售價','日幣售價 (JPY)','售價(JPY)','售價 (JPY)','日本售價','日本價格','JPY價格',
    '重量(g)','重量',
    '頁面檢視','頁面檢視總數','售出單位','銷售商品數','銷售數','數量','訂單計數','銷售訂單數',
    '顧客已付金額','客戶已付金額','實付金額','付款總金額','運費','已收運費','Shipping',
    '商品結帳價格','商品成交價格','商品售價','店鋪運費','店舖運費'
  ];
  const normalized={...row};
  const numericHeaderSet=new Set(numericHeaders.map(h=>normalizeKey(h)));
  for(const key of Object.keys(normalized)){
    if(numericHeaderSet.has(normalizeKey(key))){
      const nval=cleanNumber(normalized[key]);
      if(nval!==null)normalized[key]=nval;
    }
  }
  return normalized;
}
function findRowValue(row,aliases){const h=findHeader(row,aliases);return h===null?'':row[h]}
function normalizeDateValue(v){if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);const s=cleanText(v);if(!s)return new Date().toISOString().slice(0,10);const d=new Date(s.replace(/[.\/]/g,'-'));return isNaN(d)?new Date().toISOString().slice(0,10):d.toISOString().slice(0,10)}
async function importSalesReport(raw,fileName,selectedPlatform,manualStart='',manualEnd=''){
  const parsed=[];
  const orderMap=new Map();
  const isShopline=selectedPlatform==='rianyou_shopify';

  for(const row of raw){
    // 台灣樂天：下載時的訂單狀態為「已取消」者完全排除，不進入流量、銷量、訂單、營業額與運費統計。
    if(!isShopline){
      const downloadStatus=cleanText(findRowValue(row,['下載時的訂單狀態','訂單狀態']));
      if(downloadStatus==='已取消')continue;
    }
    const base=cleanText(isShopline
      ? findRowValue(row,['商品貨號','商品管理編號','Base SKU'])
      : findRowValue(row,['商品管理編號 (Base SKU)','商品管理編號(Base SKU)','Base SKU','商品管理編號']));
    if(!base)continue;

    const spec=cleanText(findRowValue(row,['商品規格管理編號','SKU','sku','規格貨號']));
    const title=cleanText(findRowValue(row,['商品標題','商品名稱','商品名','商品']));
    const sourceDate=isShopline
      ? findRowValue(row,['訂單日期','Order Date','Created at','日期'])
      : findRowValue(row,['訂單日期','日期','Date','資料日期','開始日期','日付']);
    const date=cleanText(sourceDate)?normalizeDateValue(sourceDate):(manualEnd||manualStart||new Date().toISOString().slice(0,10));

    const pageViews=n(cleanNumber(findRowValue(row,['頁面檢視','頁面檢視總數'])));
    const unitsSold=n(cleanNumber(isShopline
      ? findRowValue(row,['數量','售出單位','銷售商品數'])
      : findRowValue(row,['售出單位','銷售商品數','銷售數','數量'])));

    const orderNo=cleanText(findRowValue(row,['訂單號碼','訂單編號','Order ID','Order Number']));
    const customerPaid=cleanNumber(isShopline
      ? findRowValue(row,['付款總金額','顧客已付金額','實付金額'])
      : findRowValue(row,['顧客已付金額','客戶已付金額','實付金額']));
    const shipping=cleanNumber(findRowValue(row,['運費','已收運費','Shipping']));
    const lineRevenue=cleanNumber(isShopline
      ? findRowValue(row,['商品結帳價格','商品成交價格','商品售價'])
      : findRowValue(row,['商品結帳價格']));

    const orderCountSource=cleanNumber(findRowValue(row,['訂單計數','銷售訂單數']));
    const orderCount=isShopline?(orderNo?1:0):n(orderCountSource);

    const rtwBaseSku=cleanText(findRowValue(row,['RTWBase SKU','RTWBaseSKU']));
    const taiwanUrl=validUrl(findRowValue(row,['商品網址','台灣URL','台灣網址']));
    const japanUrl=validUrl(findRowValue(row,['參考URL #1','參考URL#1','日本URL','日本網址']));
    const storeCode=cleanText(findRowValue(row,['店舖編號','店鋪編號','樂天編號'])).toUpperCase()||extractStoreCode(base,spec);
    const storeUrl=validUrl(findRowValue(row,['網址','店舖網址','店鋪網址']));

    const item={base,spec,title,date,pageViews,unitsSold,orderCount,orderNo,customerPaid,shipping,lineRevenue,rtwBaseSku,taiwanUrl,japanUrl,storeCode,storeUrl};
    parsed.push(item);

    if(orderNo){
      const ok=`${selectedPlatform}__${orderNo}`;
      const o=orderMap.get(ok)||{orderNo,customerPaid:null,shipping:null,totalWeight:0,items:[]};
      if(o.customerPaid===null&&customerPaid!==null)o.customerPaid=customerPaid;
      if(o.shipping===null&&shipping!==null)o.shipping=shipping;
      const weight=isShopline&&lineRevenue!==null&&Number.isFinite(Number(lineRevenue))
        ? Math.max(0.000001,n(lineRevenue))
        : Math.max(1,unitsSold||1);
      o.totalWeight+=weight;
      o.items.push({item,weight});
      orderMap.set(ok,o);
    }
  }

  const orderAlloc=new Map();
  for(const o of orderMap.values()){
    for(const x of o.items){
      const share=o.totalWeight?x.weight/o.totalWeight:0;
      orderAlloc.set(x.item,{
        revenue:(o.customerPaid??0)*share,
        shipping:(o.shipping??0)*share,
        orderDetail:{orderNo:o.orderNo,customerPaid:o.customerPaid??0,shipping:o.shipping??0}
      });
    }
  }

  const grouped=new Map();
  for(const item of parsed){
    const key=`${item.date}__${item.base}`;
    const g=grouped.get(key)||{
      date:item.date,periodStart:manualStart||item.date,periodEnd:manualEnd||item.date,
      baseSKU:item.base,specManagementId:item.spec,title:item.title,
      pageViews:0,unitsSold:0,orderCount:0,revenueTWD:0,shippingReceivedTWD:0,
      orderDetails:[],_orderNos:new Set(),
      rtwBaseSku:item.rtwBaseSku,taiwanUrl:item.taiwanUrl,japanUrl:item.japanUrl,storeCode:item.storeCode
    };
    g.pageViews+=item.pageViews;
    g.unitsSold+=item.unitsSold;

    // 所有平台優先以「訂單號碼」認定唯一訂單。
    // 同一訂單在同一檔案中出現多個商品列，只計 1 張訂單。
    // 若來源沒有訂單號碼，才退回來源的「訂單計數」。
    if(item.orderNo)g._orderNos.add(item.orderNo);
    else g.orderCount+=item.orderCount;

    const a=orderAlloc.get(item);
    if(a){
      g.revenueTWD+=a.revenue;
      g.shippingReceivedTWD+=a.shipping;
      if(!g.orderDetails.some(o=>o.orderNo===a.orderDetail.orderNo))g.orderDetails.push(a.orderDetail);
    }else if(isShopline&&item.lineRevenue!==null){
      g.revenueTWD+=n(item.lineRevenue);
    }

    if(!g.specManagementId&&item.spec)g.specManagementId=item.spec;
    if(!g.title&&item.title)g.title=item.title;
    if(!g.rtwBaseSku&&item.rtwBaseSku)g.rtwBaseSku=item.rtwBaseSku;
    if(!g.taiwanUrl&&item.taiwanUrl)g.taiwanUrl=item.taiwanUrl;
    if(!g.japanUrl&&item.japanUrl)g.japanUrl=item.japanUrl;
    if(!g.storeCode&&item.storeCode)g.storeCode=item.storeCode;
    grouped.set(key,g);
  }

  for(const g of grouped.values()){
    if(g._orderNos.size)g.orderCount=g._orderNos.size;
    delete g._orderNos;
  }

  if(!grouped.size)throw new Error(isShopline
    ? '找不到「商品貨號」或 Shopline 銷售欄位'
    : '找不到「商品管理編號 (Base SKU)」或銷售數據欄位');

  const productByBase=new Map();
  products.forEach(p=>{
    const k=cleanText(p.productManagementId);
    if(k){
      if(!productByBase.has(k))productByBase.set(k,[]);
      productByBase.get(k).push(p);
    }
  });
  const productByRtw=new Map();
  products.forEach(p=>{const k=cleanText(p.rtwBaseSku);if(k)productByRtw.set(k,p)});

  // 建立/更新唯一訂單索引：platform + orderNo 為固定 document ID。
  // 重複上傳相同訂單只會覆寫同一筆，不會新增第二筆訂單。
  const uniqueOrders=new Map();
  for(const item of parsed){
    if(!item.orderNo)continue;
    const key=`${selectedPlatform}__${item.orderNo}`;
    if(!uniqueOrders.has(key))uniqueOrders.set(key,{
      orderNo:item.orderNo,
      platform:selectedPlatform,
      date:item.date,
      customerPaid:item.customerPaid??0,
      shipping:item.shipping??0,
      fileName
    });
  }
  if(uniqueOrders.size){
    const orderEntries=[...uniqueOrders.entries()];
    for(let start=0;start<orderEntries.length;start+=300){
      const ob=writeBatch(db);
      for(const [key,o] of orderEntries.slice(start,start+300)){
        const oid=encodeURIComponent(key).replaceAll('%','_');
        ob.set(doc(db,'orders',oid),{...o,updatedAt:serverTimestamp()},{merge:true});
      }
      await ob.commit();
    }
  }

  let matched=0,unmatched=0;
  const rows=[...grouped.values()];
  for(let start=0;start<rows.length;start+=100){
    const batch=writeBatch(db);
    for(const r of rows.slice(start,start+100)){
      let matches=productByBase.get(r.baseSKU)||[];
      if(!matches.length&&r.rtwBaseSku&&productByRtw.has(r.rtwBaseSku))matches=[productByRtw.get(r.rtwBaseSku)];

      if(matches.length){
        matched++;
        const div=matches.length;
        for(const p of matches){
          const patch={
            pageViews:round(r.pageViews/div),
            unitsSold:round(r.unitsSold/div),
            orderCount:round(r.orderCount/div),
            updatedAt:serverTimestamp()
          };
          if(r.taiwanUrl)patch.taiwanUrl=r.taiwanUrl;
          if(r.japanUrl)patch.japanUrl=r.japanUrl;
          if(r.rtwBaseSku)patch.rtwBaseSku=r.rtwBaseSku;
          batch.set(doc(db,'products',p.id),patch,{merge:true});
        }
      }else unmatched++;

      if(r.storeCode){
        const existing=storeMap.get(r.storeCode);
        const parsedRow=parsed.find(x=>x.base===r.baseSKU&&x.storeCode===r.storeCode&&x.storeUrl);
        if(parsedRow?.storeUrl)batch.set(doc(db,'stores',r.storeCode),{
          code:r.storeCode,url:parsedRow.storeUrl,name:existing?.name||'',
          shippingJPY:existing?.shippingJPY??params.domesticShippingJPY,
          updatedAt:serverTimestamp()
        },{merge:true});
      }

      const sid=encodeURIComponent(`${r.date}_${selectedPlatform}_${r.baseSKU}`).replaceAll('%','_');
      batch.set(doc(db,'sales',sid),{
        ...r,revenueTWD:round(r.revenueTWD),shippingReceivedTWD:round(r.shippingReceivedTWD),
        platform:selectedPlatform,fileName,importedAt:serverTimestamp(),updatedAt:serverTimestamp()
      },{merge:true});
    }
    await batch.commit();
  }

  await addDoc(collection(db,'imports'),{
    type:'sales',fileName,rowCount:raw.length,successCount:matched,skippedCount:unmatched,
    periodStart:manualStart||'',periodEnd:manualEnd||'',platform:selectedPlatform,createdAt:serverTimestamp()
  });
  return{matched,unmatched};
}
async function readSpreadsheetFile(file){
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),sheet=wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
}

async function importExcel(){
  const file=$('excelFile').files[0];
  if(!file)return toast('請先選擇 Excel 或 CSV 檔案');

  $('importBtn').disabled=true;
  setImportProgress('準備讀取檔案…',2);

  try{
    await yieldToUI();

    setImportProgress(`讀取檔案：${file.name}`,5);
    const buf=await file.arrayBuffer();
    await yieldToUI();

    setImportProgress('解析 Excel / CSV…',10);
    const wb=XLSX.read(buf,{type:'array'});
    const preferred=wb.SheetNames.find(x=>x.toLowerCase()==='model')||wb.SheetNames[0];
    if(!preferred||!wb.Sheets[preferred])throw new Error('找不到可讀取的工作表');

    await yieldToUI();
    setImportProgress(`解析工作表：${preferred}`,15);

    const raw=XLSX.utils.sheet_to_json(wb.Sheets[preferred],{defval:'',raw:false}).map(normalizeImportedNumericFields);
    if(!raw.length)throw new Error('檔案沒有資料');

    setImportProgress(`已解析 ${raw.length.toLocaleString()} 列，判斷資料類型…`,20);
    await yieldToUI();

    const selectedPlatform=$('importPlatform').value;
    const isShopline=selectedPlatform==='rianyou_shopify';

    const hasBase=raw.some(row=>findHeader(
      row,
      isShopline?['商品貨號','商品管理編號']:['商品管理編號 (Base SKU)','商品管理編號(Base SKU)','Base SKU']
    )!==null);

    const hasMetrics=raw.some(row=>isShopline
      ? (findHeader(row,['訂單號碼'])!==null&&findHeader(row,['付款總金額'])!==null)
      : (
          findHeader(row,['頁面檢視'])!==null||
          findHeader(row,['售出單位'])!==null||
          findHeader(row,['訂單計數'])!==null||
          findHeader(row,['顧客已付金額'])!==null||
          findHeader(row,['訂單號碼'])!==null
        )
    );

    // 銷售報表
    if(hasBase&&hasMetrics){
      setImportProgress(`辨識為銷售報表，共 ${raw.length.toLocaleString()} 列，開始寫入…`,25);
      await yieldToUI();

      const result=await importSalesReport(
        raw,
        file.name,
        selectedPlatform,
        $('salesImportStart').value,
        $('salesImportEnd').value
      );

      setImportProgress(`銷售資料完成：對應 ${result.matched} 個商品，未對應 ${result.unmatched} 個`,100);
      toast('銷售報表匯入完成');

      await yieldToUI();
      await loadAll();
      return;
    }

    // 商品主檔
    setImportProgress('辨識為商品主檔，整理欄位…',25);
    await yieldToUI();

    const rows=normalizeImportRows(raw);
    if(!rows.length)throw new Error('找不到有效的商品規格管理編號');

    const detectedPriceHeader=raw.length?(findHeader(raw[0],IMPORT_ALIASES.manualPriceTWD)||findHeader(raw[0],IMPORT_ALIASES.priceJPY)):null;
    const existing=new Map(
      products
        .filter(p=>p.specManagementId)
        .map(p=>[cleanText(p.specManagementId),p])
    );

    let done=0;
    let skipped=raw.length-rows.length;
    const BATCH_SIZE=10;
    const totalBatches=Math.ceil(rows.length/BATCH_SIZE);

    setImportProgress(
      `商品主檔共 ${rows.length.toLocaleString()} 筆；將以每批 10 筆寫入${detectedPriceHeader?`；讀取價格欄：${detectedPriceHeader}`:'；未偵測到價格欄位'}`,
      30
    );
    await yieldToUI();

    const importStrategy=$('productImportStrategy')?.value||'fast';
    // 正式大量匯入前先驗證 Firestore 是否能完成最小寫入與刪除。
    setImportProgress('測試 Firestore 單筆寫入連線…',29);
    await yieldToUI();
    const probeRef=doc(db,'products',`__import_probe_${auth.currentUser?.uid||'user'}_${Date.now()}`);
    try{
      await withTimeout(setDoc(probeRef,{_probe:true,updatedAt:serverTimestamp()}),15000,'Firestore 單筆寫入測試超過 15 秒');
      await withTimeout(deleteDoc(probeRef),15000,'Firestore 測試資料刪除超過 15 秒');
    }catch(probeError){
      const code=probeError?.code?` [${probeError.code}]`:'';
      throw new Error(`Firestore 單筆寫入測試失敗${code}：${probeError?.message||probeError}。這不是商品欄位數量問題，請先檢查 Firestore Rules、網路或 Firebase 專案狀態。`);
    }

    for(let start=0,batchNo=1;start<rows.length;start+=BATCH_SIZE,batchNo++){
      const chunk=rows.slice(start,start+BATCH_SIZE);
      const writeOps=[];

      for(const row of chunk){
        const data={
          active:true,
          overrides:{},
          platformData:{
            [selectedPlatform]:{enabled:true,active:true,price:null,note:''}
          },
          ...row
        };

        data.manualPriceTWD=cleanNumber(data.manualPriceTWD);
        data.priceJPY=cleanNumber(data.priceJPY);

        // 來源欄位「價格」是已依目標利潤率制定的台幣售價。
        // 不直接除以匯率；改用目前 Params 的完整利潤模型反推日幣價格。
        if(data.manualPriceTWD!==null&&Number.isFinite(Number(data.manualPriceTWD))){
          const importStore=getStore(data);
          data.priceJPY=reverseJPYFromTargetTWD(data.manualPriceTWD,data.weightG,importStore);
          data.overrides={...(data.overrides||{}),manualPriceTWD:true};
        }

        data.weightG=cleanNumber(data.weightG);
        data.pageViews=n(cleanNumber(data.pageViews));
        data.unitsSold=n(cleanNumber(data.unitsSold));
        data.orderCount=n(cleanNumber(data.orderCount));

        const key=cleanText(data.specManagementId);
        const old=existing.get(key);

        if(old&&$('importMode').value==='skip'){
          skipped++;
          continue;
        }

        let ref,merged;
        if(importStrategy==='fast'){
          // 快速建立：固定 document ID，避免先查詢/比對大量文件；只寫商品主檔必要欄位。
          const safeId=encodeURIComponent(key).replace(/%/g,'_').slice(0,1400);
          ref=doc(db,'products',`sku_${safeId}`);
          merged={
            specManagementId:data.specManagementId||'',
            productManagementId:data.productManagementId||'',
            title:data.title||'',
            spec1:data.spec1||'', spec2:data.spec2||'', spec3:data.spec3||'',
            note:data.note||'', active:true,
            manualPriceTWD:data.manualPriceTWD??null,
            priceJPY:data.priceJPY??null,
            weightG:data.weightG??null,
            taiwanUrl:data.taiwanUrl||'', japanUrl:data.japanUrl||'',
            rtwBaseSku:data.rtwBaseSku||'',
            overrides:{manualPriceTWD:data.manualPriceTWD!==null},
            platformData:{[selectedPlatform]:{enabled:true,active:true,price:null,note:''}},
            updatedAt:serverTimestamp()
          };
        }else{
          ref=old?doc(db,'products',old.id):doc(collection(db,'products'));
          merged=old
            ? {
                ...data, active:old.active??true, note:data.note||old.note||'',
                overrides:{...(old.overrides||{}),...(data.overrides||{})},
                platformData:{...(old.platformData||{}),...(data.platformData||{})},
                updatedAt:serverTimestamp()
              }
            : {...data,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
        }

        // 先保存本批次的寫入內容。重試時會建立全新的 WriteBatch，
        // 不可重用已呼叫 commit() 的 batch。
        writeOps.push({ref,data:merged});
        done++;
      }

      if(writeOps.length>0){
        let committed=false;
        let lastError=null;
        for(let attempt=1;attempt<=3&&!committed;attempt++){
          setImportProgress(
            `正在寫入第 ${batchNo} / ${totalBatches} 批（${start+1}-${Math.min(start+chunk.length,rows.length)} 筆）${attempt>1?`，重試 ${attempt}/3`:''}`,
            30+((batchNo-1)/totalBatches)*60
          );
          await yieldToUI();
          try{
            // 每一次嘗試都必須建立新的 WriteBatch。
            // Firestore 的 WriteBatch 一旦 commit() 被呼叫，就不能再次使用。
            const attemptBatch=writeBatch(db);
            writeOps.forEach(op=>attemptBatch.set(op.ref,op.data,{merge:true}));
            await withTimeout(
              attemptBatch.commit(),
              20000,
              `Firestore 寫入逾時：第 ${start+1}-${Math.min(start+chunk.length,rows.length)} 筆超過 20 秒`
            );
            committed=true;
          }catch(err){
            lastError=err;
            console.error(`Batch ${batchNo} attempt ${attempt} failed`,err);
            if(attempt<3){
              await new Promise(r=>setTimeout(r,1500*attempt));
              await yieldToUI();
            }
          }
        }
        if(!committed){const code=lastError?.code?` [${lastError.code}]`:'';throw new Error(`商品資料第 ${start+1}-${Math.min(start+chunk.length,rows.length)} 筆寫入失敗${code}：${lastError?.message||'未知錯誤'}。`);}
      }

      const progressAfter=30+(batchNo/totalBatches)*60;
      setImportProgress(
        `已成功寫入 ${Math.min(start+chunk.length,rows.length).toLocaleString()} / ${rows.length.toLocaleString()} 筆（第 ${batchNo}/${totalBatches} 批）`,
        progressAfter
      );
      await yieldToUI();
    }

    setImportProgress('建立匯入紀錄…',92);
    await addDoc(collection(db,'imports'),{
      type:'products',
      strategy:importStrategy,
      fileName:file.name,
      rowCount:raw.length,
      successCount:done,
      skippedCount:skipped,
      createdAt:serverTimestamp()
    });

    setImportProgress(
      `商品匯入完成：${done.toLocaleString()} 筆，略過 ${skipped.toLocaleString()} 筆`+
      (detectedPriceHeader?`；讀取價格欄：${detectedPriceHeader}`:'；未偵測到價格欄位'),
      96
    );
    toast('商品匯入完成');

    // 先讓「完成」訊息顯示，再重新載入資料庫，避免畫面長時間停在「讀取中」。
    await yieldToUI();
    setImportProgress('重新載入商品資料…',98);
    await loadAll();

    setImportProgress(
      `完成：${done.toLocaleString()} 筆，略過 ${skipped.toLocaleString()} 筆`+
      (detectedPriceHeader?`；讀取價格欄：${detectedPriceHeader}`:'；未偵測到價格欄位'),
      100
    );
  }catch(e){
    console.error('Import failed:',e);
    setImportProgress(`匯入失敗：${e?.message||String(e)}`);
    toast('匯入失敗，請查看錯誤訊息');
  }finally{
    $('importBtn').disabled=false;
  }
}

function renderStores(){const q=cleanText($('storeSearch').value).toLowerCase();const list=stores.filter(s=>!q||[s.code,s.name,s.url,s.shippingJPY].some(v=>String(v||'').toLowerCase().includes(q)));$('storeTableBody').innerHTML=list.map(s=>`<tr><td>${esc(s.code)}</td><td>${esc(s.name||'')}</td><td>${format('japanUrl',s.url)}</td><td>${esc(s.shippingJPY??params.domesticShippingJPY)}</td><td class="action-cell"><button type="button" data-store-edit="${esc(s.id)}">編輯</button><button type="button" class="secondary" data-store-delete="${esc(s.id)}">刪除</button></td></tr>`).join('');$('storeCount').textContent=`共 ${list.length} 間店鋪`}
function openStoreForm(store={}){$('storeId').value=store.id||'';$('storeCode').value=store.code||'';$('storeName').value=store.name||'';$('storeUrl').value=store.url||'';$('storeShipping').value=store.shippingJPY??params.domesticShippingJPY;$('storeFormTitle').textContent=store.id?'編輯店鋪':'新增店鋪';$('storeEditDialog').showModal()}
async function saveStore(form){const fd=new FormData(form),id=$('storeId').value,code=cleanText(fd.get('code')).toUpperCase();if(!/^R\d{1,4}$/i.test(code))return toast('店鋪編號格式需為 R 加數字，例如 R60');const data={code,name:cleanText(fd.get('name')),url:validUrl(fd.get('url')),shippingJPY:n(fd.get('shippingJPY'))||params.domesticShippingJPY,updatedAt:serverTimestamp()};if(!id)data.createdAt=serverTimestamp();await setDoc(doc(db,'stores',id||code),data,{merge:true});$('storeEditDialog').close();await loadAll();renderStores();toast('店鋪已儲存')}
async function importStores(){const file=$('storeExcelFile').files[0];if(!file)return toast('請先選擇店鋪 Excel');$('storeImportStatus').textContent='讀取中…';try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),merged=new Map();for(const sheetName of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:'',raw:false});for(const row of rows){const code=cleanText(row['樂天編號']||row['店鋪編號']||row['店舖編號']||row['編號']).toUpperCase();if(!code)continue;const old=merged.get(code)||{};merged.set(code,{code,name:cleanText(row['店家名']||row['店鋪名']||row['店鋪名稱']||old.name),url:validUrl(row['網址']||row['店鋪網址']||old.url),shippingJPY:cleanNumber(row['運費'])??old.shippingJPY??params.domesticShippingJPY})}}if(!merged.size)throw new Error('找不到「樂天編號」欄位');const list=[...merged.values()];for(let i=0;i<list.length;i+=400){const batch=writeBatch(db);list.slice(i,i+400).forEach(s=>batch.set(doc(db,'stores',s.code),{...s,updatedAt:serverTimestamp()},{merge:true}));await batch.commit()}await addDoc(collection(db,'imports'),{type:'stores',fileName:file.name,rowCount:list.length,successCount:list.length,createdAt:serverTimestamp()});$('storeImportStatus').textContent=`完成：${list.length} 間店鋪`;await loadAll();renderStores();toast('店鋪總表匯入完成')}catch(e){console.error(e);$('storeImportStatus').textContent='匯入失敗：'+e.message}}
async function resyncProducts(){await loadAll();renderStores();toast(`已依 ${stores.length} 間店鋪重新計算 ${products.length} 筆商品`)}
function dateInRange(date,start,end){const d=cleanText(date);return(!start||d>=start)&&(!end||d<=end)}
function getOverviewRows(){const start=$('overviewStart').value,end=$('overviewEnd').value,platform=$('overviewPlatform').value;return salesHistory.filter(r=>dateInRange(r.date,start,end)&&(platform==='all'||r.platform===platform))}
function productForSalesRow(r){return products.find(p=>cleanText(p.productManagementId)===cleanText(r.baseSKU))||products.find(p=>cleanText(p.specManagementId)===cleanText(r.specManagementId))}
function shortTitle(v){const s=cleanText(v);return s.length>20?s.slice(0,20)+'…':s}
function salesRowRevenue(r){if(Number.isFinite(Number(r.revenueTWD))&&n(r.revenueTWD)!==0)return n(r.revenueTWD);const p=productForSalesRow(r);return n(r.unitsSold)*n(p?.manualPriceTWD)}
function uniqueOrderTotals(rows){const seen=new Set();let revenue=0,shipping=0;for(const r of rows){for(const o of (Array.isArray(r.orderDetails)?r.orderDetails:[])){const key=`${r.platform||''}__${o.orderNo}`;if(!o.orderNo||seen.has(key))continue;seen.add(key);revenue+=n(o.customerPaid);shipping+=n(o.shipping)}}const hasOrders=seen.size>0;if(!hasOrders){revenue=rows.reduce((s,r)=>s+salesRowRevenue(r),0);shipping=rows.reduce((s,r)=>s+n(r.shippingReceivedTWD),0)}return{revenue,shipping,orderCount:seen.size,hasOrders}}
function sortRanking(rows){const mode=$('rankingSort')?.value||'units_desc';return rows.sort((a,b)=>{if(mode==='units_asc')return a.units-b.units;if(mode==='revenue_desc')return b.revenue-a.revenue;if(mode==='revenue_asc')return a.revenue-b.revenue;if(mode==='orders_desc')return b.orders-a.orders;if(mode==='price_desc')return b.price-a.price;return b.units-a.units||b.orders-a.orders})}
function renderOverview(){if(currentView!=='overview')return;const rows=getOverviewRows();const pv=rows.reduce((s,r)=>s+n(r.pageViews),0),units=rows.reduce((s,r)=>s+n(r.unitsSold),0),orders=rows.reduce((s,r)=>s+n(r.orderCount),0),totals=uniqueOrderTotals(rows),revenue=totals.revenue;$('ovPageViews').textContent=formatInteger(pv);$('ovUnitsSold').textContent=formatInteger(units);$('ovOrders').textContent=formatInteger(totals.hasOrders?totals.orderCount:orders);$('ovConversion').textContent=pv?`${((totals.hasOrders?totals.orderCount:orders)/pv*100).toFixed(2)}%`:'0%';$('ovRevenue').textContent=formatInteger(revenue);if($('ovShipping'))$('ovShipping').textContent=formatInteger(totals.shipping);const byDate=new Map(),byProduct=new Map(),byPlatform=new Map();for(const r of rows){const d=byDate.get(r.date)||{units:0,orders:0,pageViews:0,revenue:0};d.units+=n(r.unitsSold);d.orders+=n(r.orderCount);d.pageViews+=n(r.pageViews);d.revenue+=salesRowRevenue(r);byDate.set(r.date,d);byPlatform.set(r.platform,(byPlatform.get(r.platform)||0)+salesRowRevenue(r));const p=productForSalesRow(r),key=cleanText(r.baseSKU)||cleanText(r.specManagementId);const g=byProduct.get(key)||{baseSKU:r.baseSKU,specManagementId:r.specManagementId||p?.specManagementId||'',title:r.title||p?.title||'',price:n(p?.manualPriceTWD),units:0,orders:0,revenue:0,platform:r.platform};g.units+=n(r.unitsSold);g.orders+=n(r.orderCount);g.revenue+=salesRowRevenue(r);if(!g.title)g.title=p?.title||'';if(!g.price)g.price=n(p?.manualPriceTWD);byProduct.set(key,g)}const ranking=sortRanking([...byProduct.values()]);$('rankingTableBody').innerHTML=ranking.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.specManagementId)}</td><td>${esc(r.baseSKU)}</td><td title="${esc(r.title)}">${esc(shortTitle(r.title))}</td><td>${formatInteger(r.price)}</td><td>${formatInteger(r.units)}</td><td>${formatInteger(r.orders)}</td><td>${formatInteger(r.revenue)}</td></tr>`).join('')||'<tr><td colspan="8" class="muted">此期間尚無銷售資料</td></tr>';$('rankingPeriod').textContent=($('overviewStart').value||'最早')+' ～ '+($('overviewEnd').value||'最新');const dates=[...byDate.keys()].sort();if(salesTrendChart)salesTrendChart.destroy();salesTrendChart=new Chart($('salesTrendChart'),{data:{labels:dates,datasets:[{type:'bar',label:'銷售額',data:dates.map(d=>byDate.get(d).revenue),yAxisID:'y'},{type:'line',label:'銷售件數',data:dates.map(d=>byDate.get(d).units),yAxisID:'y1',tension:.2}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,position:'left'},y1:{beginAtZero:true,position:'right',grid:{drawOnChartArea:false}}}}});const top=[...ranking].sort((a,b)=>b.units-a.units).slice(0,10).reverse();if(rankingChart)rankingChart.destroy();rankingChart=new Chart($('rankingChart'),{type:'bar',data:{labels:top.map(r=>shortTitle(r.title||r.baseSKU)),datasets:[{label:'銷售數量',data:top.map(r=>r.units)}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});if(trafficTrendChart)trafficTrendChart.destroy();trafficTrendChart=new Chart($('trafficTrendChart'),{type:'line',data:{labels:dates,datasets:[{label:'商品頁流量',data:dates.map(d=>byDate.get(d).pageViews),tension:.2},{label:'訂單數',data:dates.map(d=>byDate.get(d).orders),tension:.2}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}});if(platformRevenueChart)platformRevenueChart.destroy();const pLabels=[...byPlatform.keys()].map(x=>PLATFORMS.find(p=>p.id===x)?.name||x);platformRevenueChart=new Chart($('platformRevenueChart'),{type:'doughnut',data:{labels:pLabels,datasets:[{data:[...byPlatform.values()]}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%'}})}
function rowsForSection(startId,endId,platformId){const start=$(startId)?.value||'',end=$(endId)?.value||'',platform=$(platformId)?.value||'all';return salesHistory.filter(r=>dateInRange(r.date,start,end)&&(platform==='all'||r.platform===platform))}
function sortDataRows(list,state){return list.sort((a,b)=>{const av=a[state.key],bv=b[state.key];const numeric=['revenue','shipping','units','orders','pv','conversion'].includes(state.key);const cmp=numeric?n(av)-n(bv):String(av??'').localeCompare(String(bv??''),'zh-Hant',{numeric:true});return cmp*(state.direction==='asc'?1:-1)})}
function sortHeader(label,key,scope,state){return `<div class="excel-header"><span>${esc(label)}</span><select class="mini-sort" data-${scope}-sort="${key}" aria-label="${esc(label)}排序"><option value="">排序</option><option value="asc" ${state.key===key&&state.direction==='asc'?'selected':''}>▲ 小→大</option><option value="desc" ${state.key===key&&state.direction==='desc'?'selected':''}>▼ 大→小</option></select></div>`}
function renderCrossPlatform(){const rows=rowsForSection('crossStart','crossEnd','crossPlatformFilter'),map=new Map();for(const r of rows){const p=productForSalesRow(r),key=`${r.platform}_${r.baseSKU}`;const g=map.get(key)||{spec:p?.specManagementId||r.specManagementId,base:r.baseSKU,title:p?.title||r.title,platform:r.platform,revenue:0,shipping:0,units:0,orders:0,rows:[]};g.rows.push(r);g.units+=n(r.unitsSold);g.orders+=n(r.orderCount);g.revenue+=salesRowRevenue(r);g.shipping+=n(r.shippingReceivedTWD);map.set(key,g)}let list=[...map.values()];sortDataRows(list,crossSort);const allTotals=uniqueOrderTotals(rows);$('crossRevenue').textContent=formatInteger(allTotals.revenue);if($('crossShipping'))$('crossShipping').textContent=formatInteger(allTotals.shipping);$('crossUnits').textContent=formatInteger(list.reduce((s,x)=>s+x.units,0));$('crossCount').textContent=formatInteger(list.length);if($('crossPlatformHead'))$('crossPlatformHead').innerHTML=`<tr><th>${sortHeader('商品規格管理編號','spec','cross',crossSort)}</th><th>${sortHeader('商品管理編號','base','cross',crossSort)}</th><th>${sortHeader('商品名','title','cross',crossSort)}</th><th>${sortHeader('平台','platform','cross',crossSort)}</th><th>${sortHeader('營業額','revenue','cross',crossSort)}</th><th>${sortHeader('已收運費','shipping','cross',crossSort)}</th><th>${sortHeader('銷量','units','cross',crossSort)}</th><th>${sortHeader('訂單數','orders','cross',crossSort)}</th></tr>`;$('crossPlatformBody').innerHTML=list.map(x=>`<tr><td>${esc(x.spec)}</td><td>${esc(x.base)}</td><td>${esc(shortTitle(x.title))}</td><td>${esc(PLATFORMS.find(p=>p.id===x.platform)?.name||x.platform)}</td><td>${formatInteger(x.revenue)}</td><td>${formatInteger(x.shipping)}</td><td>${formatInteger(x.units)}</td><td>${formatInteger(x.orders)}</td></tr>`).join('')||'<tr><td colspan="8" class="muted">此期間尚無資料</td></tr>'}
function renderPlatformCompare(){const rows=rowsForSection('platformStart','platformEnd','platformFilter'),map=new Map();for(const r of rows){const g=map.get(r.platform)||{rows:[],units:0,orders:0,pv:0};g.rows.push(r);g.units+=n(r.unitsSold);g.orders+=n(r.orderCount);g.pv+=n(r.pageViews);map.set(r.platform,g)}let list=[...map].map(([k,g])=>{const totals=uniqueOrderTotals(g.rows),orders=totals.hasOrders?totals.orderCount:g.orders;return{platform:k,revenue:totals.revenue,shipping:totals.shipping,units:g.units,orders,pv:g.pv,conversion:g.pv?orders/g.pv:0}});sortDataRows(list,platformSort);if($('platformCompareHead'))$('platformCompareHead').innerHTML=`<tr><th>${sortHeader('平台','platform','platform',platformSort)}</th><th>${sortHeader('營業額','revenue','platform',platformSort)}</th><th>${sortHeader('已收運費','shipping','platform',platformSort)}</th><th>${sortHeader('銷量','units','platform',platformSort)}</th><th>${sortHeader('訂單數','orders','platform',platformSort)}</th><th>${sortHeader('頁面檢視','pv','platform',platformSort)}</th><th>${sortHeader('轉換率','conversion','platform',platformSort)}</th></tr>`;$('platformCompareBody').innerHTML=list.map(g=>`<tr><td>${esc(PLATFORMS.find(p=>p.id===g.platform)?.name||g.platform)}</td><td>${formatInteger(g.revenue)}</td><td>${formatInteger(g.shipping)}</td><td>${formatInteger(g.units)}</td><td>${formatInteger(g.orders)}</td><td>${formatInteger(g.pv)}</td><td>${(g.conversion*100).toFixed(2)}%</td></tr>`).join('')||'<tr><td colspan="7" class="muted">此期間尚無資料</td></tr>'}
function initOverviewDates(){const dates=salesHistory.map(r=>cleanText(r.date)).filter(Boolean).sort();if(dates.length&&!$('overviewStart').value&&!$('overviewEnd').value){$('overviewStart').value=dates[0];$('overviewEnd').value=dates[dates.length-1]}}

async function countCollection(name){const s=await getDocs(collection(db,name));return s.size}
async function refreshMaintenance(){const entries=await Promise.all(Object.entries(MAINT_COLLECTIONS).map(async([k,l])=>[k,l,await countCollection(k)]));$('maintenanceCounts').innerHTML=entries.map(([k,l,c])=>`<label class="maintenance-row"><input type="checkbox" value="${k}"><span>${l}</span><strong>${c}</strong></label>`).join('');await runHealthCheck(false)}
function productKeys(){const s=new Set();products.forEach(p=>[p.specManagementId,p.productManagementId].forEach(v=>{if(cleanText(v))s.add(cleanText(v))}));return s}
function recordProductKey(d){for(const k of ['商品規格管理編號','商品管理編號','specManagementId','productManagementId','sku','SKU','商品編號'])if(cleanText(d[k]))return cleanText(d[k]);return''}
async function runHealthCheck(showToast=true){const keys=productKeys(),result={};for(const name of ['sales','ads','productAnalysis']){const snap=await getDocs(collection(db,name));let unmatched=0;snap.forEach(x=>{const key=recordProductKey(x.data());if(!key||!keys.has(key))unmatched++});result[name]=unmatched}$('healthSales').textContent=result.sales;$('healthAds').textContent=result.ads;$('healthAnalysis').textContent=result.productAnalysis;if(showToast)toast('商品對應健康檢查完成');return result}
async function deleteCollection(name){const snap=await getDocs(collection(db,name));for(let i=0;i<snap.docs.length;i+=450){const batch=writeBatch(db);snap.docs.slice(i,i+450).forEach(d=>batch.delete(d.ref));await batch.commit()}}
async function deleteSelectedCollections(){if($('deleteConfirm').value!=='DELETE')return toast('請輸入 DELETE 才能刪除');const selected=[...$('maintenanceCounts').querySelectorAll('input:checked')].map(x=>x.value);if(!selected.length)return toast('請先勾選資料');for(const c of selected)await deleteCollection(c);$('deleteConfirm').value='';await loadAll();await refreshMaintenance();toast('指定資料已刪除')}
async function clearImportedData(){if($('deleteConfirm').value!=='DELETE')return toast('請輸入 DELETE 才能刪除');for(const c of ['products','sales','ads','productAnalysis','imports','platforms','stores'])await deleteCollection(c);$('deleteConfirm').value='';await ensurePlatforms();await loadAll();await refreshMaintenance();toast('全部匯入資料已清空；登入帳號未變更')}
async function rebuildProductIndex(){await deleteCollection('productIndex');for(let i=0;i<products.length;i+=400){const batch=writeBatch(db);products.slice(i,i+400).forEach(p=>{for(const[type,key]of[['spec',p.specManagementId],['product',p.productManagementId]])if(cleanText(key)){const id=encodeURIComponent(`${type}_${cleanText(key)}`).replaceAll('%','_');batch.set(doc(db,'productIndex',id),{type,key:cleanText(key),productId:p.id,updatedAt:serverTimestamp()})}});await batch.commit()}toast(`商品索引重建完成：${products.length} 筆商品`)}
async function recalcDashboard(){const health=await runHealthCheck(false);const sales=await countCollection('sales'),ads=await countCollection('ads'),analysis=await countCollection('productAnalysis');await setDoc(doc(db,'settings','dashboardSummary'),{productCount:products.length,activeCount:products.filter(p=>p.active).length,totalUnits:products.reduce((s,p)=>s+n(p.unitsSold),0),salesCount:sales,adsCount:ads,analysisCount:analysis,unmatched:health,updatedAt:serverTimestamp()});toast('Dashboard 已重新計算')}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('loginEmail').value,$('loginPassword').value)}catch(err){$('loginError').textContent='登入失敗：'+err.message}});
$('logoutBtn').onclick=()=>signOut(auth);$('searchInput').oninput=()=>{page=1;renderAll()};$('statusFilter').onchange=()=>{page=1;renderAll()};$('prevPage').onclick=()=>{page--;renderTable()};$('nextPage').onclick=()=>{page++;renderTable()};
$('tableHead').addEventListener('click',e=>{const btn=e.target.closest('[data-filter-menu]');if(!btn)return;e.stopPropagation();openFilterMenu(btn.dataset.filterMenu,btn)});
document.addEventListener('click',e=>{const panel=e.target.closest('#excelFilterMenu');if(!panel){closeFilterMenu();return}e.stopPropagation();const key=activeFilterKey;if(e.target.closest('[data-menu-sort]')){sortState={key,direction:e.target.closest('[data-menu-sort]').dataset.menuSort};page=1;renderAll();closeFilterMenu();return}if(e.target.closest('[data-menu-clear-sort]')){if(sortState.key===key)sortState={key:'',direction:'asc'};renderAll();closeFilterMenu();return}if(e.target.matches('[data-menu-all]')){panel.querySelectorAll('[data-menu-value]').forEach(x=>x.checked=e.target.checked);return}if(e.target.closest('[data-menu-clear]')){delete columnFilters[key];page=1;renderAll();closeFilterMenu();return}if(e.target.closest('[data-menu-apply]')){const selected=[...panel.querySelectorAll('[data-menu-value]:checked')].map(x=>x.value),allCount=panel.querySelectorAll('[data-menu-value]').length,next={selected:selected.length===allCount?[]:selected};const min=panel.querySelector('[data-menu-min]'),max=panel.querySelector('[data-menu-max]'),search=panel.querySelector('[data-menu-search]');if(min)next.min=min.value;if(max)next.max=max.value;if(search)next.text=search.value;columnFilters[key]=next;page=1;renderAll();closeFilterMenu()}});
document.addEventListener('input',e=>{if(!e.target.matches('#excelFilterMenu [data-menu-search]'))return;const q=e.target.value.toLowerCase();e.target.closest('#excelFilterMenu').querySelectorAll('[data-value-label]').forEach(label=>label.classList.toggle('hidden',!label.dataset.valueLabel.includes(q)))});
$('clearColumnFiltersBtn').onclick=()=>{columnFilters={};sortState={key:'',direction:'asc'};page=1;renderAll()};function initSalesFilterDates(){const dates=salesHistory.map(r=>cleanText(r.date)).filter(Boolean).sort();if(dates.length&&!$('salesFilterStart')?.value&&!$('salesFilterEnd')?.value){$('salesFilterStart').value=dates[0];$('salesFilterEnd').value=dates[dates.length-1]}}if($('salesFilterStart'))$('salesFilterStart').onchange=()=>{page=1;renderAll()};if($('salesFilterEnd'))$('salesFilterEnd').onchange=()=>{page=1;renderAll()};

for(const id of ['crossStart','crossEnd','crossPlatformFilter'])if($(id))$(id).onchange=renderCrossPlatform;
for(const id of ['platformStart','platformEnd','platformFilter'])if($(id))$(id).onchange=renderPlatformCompare;
document.addEventListener('change',e=>{if(e.target.matches('[data-cross-sort]')&&e.target.value){crossSort={key:e.target.dataset.crossSort,direction:e.target.value};renderCrossPlatform()}if(e.target.matches('[data-platform-sort]')&&e.target.value){platformSort={key:e.target.dataset.platformSort,direction:e.target.value};renderPlatformCompare()}});

$('productTabBtn').onclick=()=>setView('products');if($('importTabBtn'))$('importTabBtn').onclick=()=>setView('imports');$('salesTabBtn').onclick=()=>{initSalesFilterDates();setView('sales')};$('overviewTabBtn').onclick=()=>{initOverviewDates();setView('overview')};$('crossPlatformTabBtn').onclick=()=>{initOverviewDates();setView('crossPlatform')};$('platformCompareTabBtn').onclick=()=>{initOverviewDates();setView('platformCompare')};$('applyOverviewBtn').onclick=renderOverview;$('overviewStart').onchange=renderOverview;$('overviewEnd').onchange=renderOverview;$('overviewPlatform').onchange=renderOverview;$('rankingSort').onchange=renderOverview;$('resetOverviewBtn').onclick=()=>{$('overviewStart').value='';$('overviewEnd').value='';$('overviewPlatform').value='all';renderOverview()};$('selectFilteredBtn').onclick=()=>{filtered().forEach(p=>selectedProductIds.add(p.id));renderTable();updateSelectionCount();toast('已選取全部篩選結果')};$('clearSelectionBtn').onclick=()=>{selectedProductIds.clear();renderTable();updateSelectionCount()};$('discountCalcBtn').onclick=openDiscountDialog;$('recalcDiscountBtn').onclick=renderDiscountResults;$('discountPercent').oninput=renderDiscountResults;$('exportDiscountBtn').onclick=exportDiscountResults;
$('addProductBtn').onclick=()=>{renderProductForm({active:true});$('productDialog').showModal()};$('productForm').addEventListener('submit',async e=>{e.preventDefault();await saveProduct(e.currentTarget)});
$('productFields').addEventListener('click',e=>{const k=e.target.dataset.reset;if(!k)return;const input=e.target.closest('label').querySelector(`[name="${k}"]`);input.value=''});
$('tableBody').addEventListener('change',e=>{const id=e.target.dataset.selectProduct;if(!id)return;e.target.checked?selectedProductIds.add(id):selectedProductIds.delete(id);updateSelectionCount()});
$('tableHead').addEventListener('change',e=>{if(e.target.id!=='selectPageCheckbox')return;const list=filtered().slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);list.forEach(p=>e.target.checked?selectedProductIds.add(p.id):selectedProductIds.delete(p.id));renderTable();updateSelectionCount()});
$('tableBody').addEventListener('click',async e=>{const id=e.target.dataset.edit||e.target.dataset.delete;if(!id)return;if(e.target.dataset.edit){renderProductForm(products.find(p=>p.id===id));$('productDialog').showModal()}else if(confirm('確定刪除此商品？')){await deleteDoc(doc(db,'products',id));await loadAll();toast('已刪除')}});
$('openParamsBtn').onclick=()=>$('paramsDialog').showModal();$('paramsForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),next={};PARAM_DEFS.forEach(([k])=>next[k]=Number(fd.get(k)));next.tiers=params.tiers.map((_,i)=>[Number(fd.get(`tierMax_${i}`)),Number(fd.get(`tierFee_${i}`))]).sort((a,b)=>a[0]-b[0]);await setDoc(doc(db,'settings','params'),{...next,updatedAt:serverTimestamp()});params={...params,...next};$('paramsDialog').close();await loadAll();toast('參數已更新')});
$('columnBtn').onclick=()=>{renderColumns();$('columnsDialog').showModal()};$('columnOptions').addEventListener('change',()=>{const next=[...$('columnOptions').querySelectorAll('input:checked')].map(x=>x.value);if(currentView==='sales'){salesVisibleColumns=next;localStorage.setItem('salesVisibleColumns',JSON.stringify(salesVisibleColumns))}else{visibleColumns=next;localStorage.setItem('visibleColumns',JSON.stringify(visibleColumns))}renderTable()});$('selectDefaultColumns').onclick=()=>{if(currentView==='sales'){salesVisibleColumns=[...SALES_COLUMNS];localStorage.setItem('salesVisibleColumns',JSON.stringify(salesVisibleColumns))}else{visibleColumns=[...DEFAULT_COLUMNS];localStorage.setItem('visibleColumns',JSON.stringify(visibleColumns))}renderColumns();renderTable()};
$('importBtn').onclick=importExcel;$('exportBtn').onclick=exportProducts;
$('storeManagerBtn').onclick=()=>{renderStores();$('storesDialog').showModal()};$('storeSearch').oninput=renderStores;$('addStoreBtn').onclick=()=>openStoreForm();$('storeForm').addEventListener('submit',async e=>{e.preventDefault();await saveStore(e.currentTarget)});$('storeImportBtn').onclick=importStores;$('resyncStoresBtn').onclick=resyncProducts;
$('storeTableBody').addEventListener('click',async e=>{const edit=e.target.dataset.storeEdit,del=e.target.dataset.storeDelete;if(edit)openStoreForm(stores.find(s=>s.id===edit));if(del&&confirm('確定刪除此店鋪？未指定店鋪的商品將改用預設運費。')){await deleteDoc(doc(db,'stores',del));await loadAll();renderStores();toast('店鋪已刪除')}});
$('maintenanceBtn').onclick=async()=>{$('maintenanceDialog').showModal();await refreshMaintenance()};$('deleteSelectedBtn').onclick=deleteSelectedCollections;$('clearAllBtn').onclick=clearImportedData;$('rebuildIndexBtn').onclick=rebuildProductIndex;$('recalcDashboardBtn').onclick=recalcDashboard;$('healthCheckBtn').onclick=()=>runHealthCheck(true);$('resyncMaintenanceBtn').onclick=resyncProducts;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
onAuthStateChanged(auth,async user=>{if(user){$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');$('userEmail').textContent=user.email;await loadAll()}else{$('appView').classList.add('hidden');$('loginView').classList.remove('hidden')}});
