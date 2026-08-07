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
const MAINT_COLLECTIONS={products:'商品主檔',sales:'銷售',orders:'唯一訂單',trafficReports:'全店訪問報告',imports:'匯入紀錄',platforms:'平台資料',stores:'店鋪資料'};
const DEFAULT_COLUMNS=['specManagementId','productManagementId','title','storeCode','taiwanUrl','japanUrl','active','priceJPY','domesticShippingJPY','domesticShippingTWD','weightG','manualPriceTWD','profitTWD','profitRate'];
const SALES_COLUMNS=['specManagementId','productManagementId','title','storeCode','taiwanUrl','japanUrl','active','pageViews','unitsSold','orderCount','salesRevenueTWD','shippingReceivedTWD','conversionRate','manualPriceTWD','profitTWD','profitRate'];
let products=[], stores=[], salesHistory=[], ordersHistory=[], trafficHistory=[], storeMap=new Map(), params={...DEFAULT_PARAMS}, visibleColumns=JSON.parse(localStorage.getItem('visibleColumns')||'null')||DEFAULT_COLUMNS, salesVisibleColumns=JSON.parse(localStorage.getItem('salesVisibleColumns')||'null')||SALES_COLUMNS, page=1; const PAGE_SIZE=50;
let currentView='products', selectedProductIds=new Set(), discountResults=[], salesTrendChart=null, rankingChart=null, trafficTrendChart=null, platformRevenueChart=null;
let crossSort={key:'revenue',direction:'desc'}, platformSort={key:'revenue',direction:'desc'};
const CROSS_COLUMN_DEFS=[['spec','商品規格管理編號'],['base','商品管理編號'],['title','商品名'],['platform','平台'],['revenue','營業額'],['shipping','已收運費'],['units','銷量'],['orders','訂單數']];
let crossVisibleColumns=JSON.parse(localStorage.getItem('crossVisibleColumns')||'null')||CROSS_COLUMN_DEFS.map(x=>x[0]);
let sortState={key:'',direction:'asc'}, columnFilters={}, activeFilterKey='';
let productFormOriginal=null, productFormManualOverrides=new Set();
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

  const autoProductCost=price?price*params.productCostRate:null;
  const productCost=ov.productCostTWD?n(p.productCostTWD):autoProductCost;

  const domesticJPY=price?(price>=params.freeDomesticJPY?0:n(store?.shippingJPY)||params.domesticShippingJPY):null;
  const autoDomestic=domesticJPY===null?null:domesticJPY*params.productCostRate;
  const domestic=ov.domesticShippingTWD?n(p.domesticShippingTWD):autoDomestic;

  const method=weight?(weight<600?'統一':'新日誠'):'';
  const autoUni=weight?(weight<=1000?params.uniFirstKgTWD:params.uniFirstKgTWD+Math.ceil((weight-1000)/500)*params.uniEachHalfKgTWD):null;
  const uni=ov.uniCostTWD?n(p.uniCostTWD):autoUni;

  let autoNisshin=null;
  if(weight){const kg=weight/1000;if(kg>13)autoNisshin='超重';else{const tier=params.tiers.find(([max])=>kg<=max);autoNisshin=tier?round(tier[1]*params.nisshinRate*params.nisshinDiscount+params.nisshinFixedFeeTWD):null}}
  const nisshin=ov.nisshinCostTWD?n(p.nisshinCostTWD):autoNisshin;

  const autoFixed=method==='統一'?uni:nisshin;
  const fixed=ov.fixedLogisticsCostTWD?n(p.fixedLogisticsCostTWD):autoFixed;

  const autoSuggested=price?calcSuggested(productCost,domestic,fixed,weight):null;
  const suggested=ov.suggestedPrice30TWD?n(p.suggestedPrice30TWD):autoSuggested;
  const manual=ov.manualPriceTWD?n(p.manualPriceTWD):suggested;
  const autoCustomer=manual!==null?(manual>=params.freeShippingTWD?0:ceilKg(weight)*params.customerShippingPerKgTWD):null;
  const customer=ov.customerShippingTWD?n(p.customerShippingTWD):autoCustomer;
  const autoGross=manual!==null?manual+customer:null;
  const gross=ov.grossReceivedTWD?n(p.grossReceivedTWD):autoGross;
  const autoFee=manual!==null?manual*params.platformFeeRate:null;
  const fee=ov.platformFeeTWD?n(p.platformFeeTWD):autoFee;
  const autoProfit=gross!==null&&typeof fixed==='number'?gross-fee-fixed-productCost-domestic:null;
  const profit=ov.profitTWD?n(p.profitTWD):autoProfit;
  const autoMargin=gross?profit/gross:null;
  const margin=ov.profitRate?n(p.profitRate):autoMargin;
  const conversion=n(p.pageViews)>0?n(p.orderCount)/n(p.pageViews):null;
  const values={storeCode,storeName,japanUrl,productCostTWD:productCost,domesticShippingJPY:domesticJPY,domesticShippingTWD:domestic,logisticsMethod:method,uniCostTWD:uni,nisshinCostTWD:nisshin,fixedLogisticsCostTWD:fixed,manualPriceTWD:manual,customerShippingTWD:customer,grossReceivedTWD:gross,platformFeeTWD:fee,profitTWD:profit,profitRate:margin,suggestedPrice30TWD:suggested,conversionRate:conversion};
  return {...p,...values};
}
function calcSuggested(j,k,o,weight){const target=params.targetProfitRate,denom=1-params.platformFeeRate-target;if(denom<=0)return null;const ship=ceilKg(weight)*params.customerShippingPerKgTWD;const candidate=((n(j)+n(k)+n(o))-ship*(1-target))/denom;return round(candidate>=params.freeShippingTWD?(n(j)+n(k)+n(o))/denom:candidate)}
function reverseJPYFromTargetTWD(targetPriceTWD,weight,store){
  const manual=Number(targetPriceTWD), rate=Number(params.productCostRate), target=Number(params.targetProfitRate);
  if(!Number.isFinite(manual)||manual<=0||!Number.isFinite(rate)||rate<=0)return null;
  const w=n(weight);
  const method=w?(w<600?'統一':'新日誠'):'';
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
async function safeCollectionDocs(name){
  try{
    const snap=await getDocs(collection(db,name));
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){
    console.error(`讀取 ${name} 失敗`,e);
    return [];
  }
}
async function loadAll(){
  try{await ensurePlatforms()}catch(e){console.error('ensurePlatforms failed',e)}
  try{
    const setting=await getDoc(doc(db,'settings','params'));
    params=setting.exists()?{...DEFAULT_PARAMS,...setting.data()}:structuredClone(DEFAULT_PARAMS);
  }catch(e){console.error('params load failed',e);params=structuredClone(DEFAULT_PARAMS)}
  try{await loadStores()}catch(e){console.error('stores load failed',e);stores=[];storeMap=new Map()}
  products=(await safeCollectionDocs('products')).map(compute);
  salesHistory=await safeCollectionDocs('sales');
  ordersHistory=await safeCollectionDocs('orders');
  trafficHistory=await safeCollectionDocs('trafficReports');
  renderAll();
  renderParams();
  if(currentView==='overview')renderOverview();
  else if(currentView==='platformCompare')renderPlatformCompare();
  else if(currentView==='crossPlatform')renderCrossPlatform();
}
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
function salesRowsInRange(){const start=$('salesFilterStart')?.value||'',end=$('salesFilterEnd')?.value||'';return salesHistory.filter(r=>dateInRange(r.date||r.periodEnd||r.periodStart,start,end))}
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
function renderAll(){renderTable();const list=filtered();$('statProducts').textContent=formatInteger(list.length);$('statActive').textContent=formatInteger(list.filter(p=>p.active).length);const margins=list.map(p=>p.profitRate).filter(Number.isFinite);$('statMargin').textContent=margins.length?(margins.reduce((a,b)=>a+b,0)/margins.length*100).toFixed(1)+'%':'0%';$('statUnits').textContent=formatInteger(list.reduce((s,p)=>s+n(p.unitsSold),0));if($('statRevenue')){
  if(currentView==='sales'){
    const s=$('salesFilterStart')?.value||'',e=$('salesFilterEnd')?.value||'';
    const totals=orderTotalsForRange(s,e,'all');
    $('statRevenue').textContent=formatInteger(totals.revenue);
    if($('statShipping'))$('statShipping').textContent=formatInteger(totals.shipping);
  }else{
    $('statRevenue').textContent=formatInteger(list.reduce((sum,p)=>sum+n(p.salesRevenueTWD),0));
    if($('statShipping'))$('statShipping').textContent=formatInteger(list.reduce((sum,p)=>sum+n(p.shippingReceivedTWD),0));
  }
}if($('statRevenueCard'))$('statRevenueCard').classList.toggle('hidden',currentView!=='sales');if($('statShippingCard'))$('statShippingCard').classList.toggle('hidden',currentView!=='sales');if($('salesDateFilters'))$('salesDateFilters').classList.toggle('hidden',currentView!=='sales');updateSelectionCount()}
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
function setView(view){currentView=view;page=1;closeFilterMenu();['product','pricing','sales','overview','crossPlatform','platformCompare','import'].forEach(x=>{const b=$(x+'TabBtn');if(b)b.classList.toggle('active',view===x)});$('databaseView').classList.toggle('hidden',!['products','sales'].includes(view));$('overviewView').classList.toggle('hidden',view!=='overview');if($('pricingView'))$('pricingView').classList.toggle('hidden',view!=='pricing');$('crossPlatformView').classList.toggle('hidden',view!=='crossPlatform');$('platformCompareView').classList.toggle('hidden',view!=='platformCompare');if($('importView'))$('importView').classList.toggle('hidden',view!=='imports');const title=$('pageTitle');if(title)title.textContent=view==='overview'?'營運總覽':view==='pricing'?'定價試算':view==='sales'?'銷售狀態':view==='crossPlatform'?'商品跨平台':view==='platformCompare'?'平台比較':view==='imports'?'資料匯入':'商品資料庫';if($('columnBtn'))$('columnBtn').classList.toggle('hidden',!['products','sales','crossPlatform'].includes(view));if($('clearColumnFiltersBtn'))$('clearColumnFiltersBtn').classList.toggle('hidden',!['products','sales'].includes(view));if($('exportBtn'))$('exportBtn').textContent=view==='pricing'?'下載定價試算 Excel':'匯出本頁 Excel';if(view==='overview')renderOverview();else if(view==='pricing')renderPricingPage();else if(view==='crossPlatform')renderCrossPlatform();else if(view==='platformCompare')renderPlatformCompare();else if(view!=='imports')renderAll()}
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

function renderColumns(){if(currentView==='crossPlatform'){$('columnOptions').innerHTML=CROSS_COLUMN_DEFS.map(([k,l])=>`<label><input type="checkbox" value="${k}" ${crossVisibleColumns.includes(k)?'checked':''}>${esc(l)}</label>`).join('');return}const current=currentView==='sales'?salesVisibleColumns:visibleColumns;const allowed=currentView==='sales'?FIELDS.filter(([k])=>SALES_COLUMNS.includes(k)):FIELDS;$('columnOptions').innerHTML=allowed.map(([k,l])=>`<label><input type="checkbox" value="${k}" ${current.includes(k)?'checked':''}>${esc(l)}</label>`).join('')}
function renderProductForm(p={}){
  productFormOriginal={...p};
  productFormManualOverrides=new Set(Object.entries(p.overrides||{}).filter(([,v])=>!!v).map(([k])=>k));
  const computed=compute(p);$('productId').value=p.id||'';$('productDialogTitle').textContent=p.id?'編輯商品':'新增商品';const pd=p.platformData||{};
  const platformHtml=`<div class="platform-editor full-span"><h3>平台資料</h3>${PLATFORMS.map(x=>`<fieldset><legend>${x.name}</legend><label><input type="checkbox" name="platform_${x.id}_enabled" ${pd[x.id]?.enabled?'checked':''}> 啟用此平台</label><label>售價<input type="number" step="any" name="platform_${x.id}_price" value="${esc(pd[x.id]?.price??'')}"></label><label>上架<select name="platform_${x.id}_active"><option value="true" ${pd[x.id]?.active!==false?'selected':''}>上架</option><option value="false" ${pd[x.id]?.active===false?'selected':''}>下架</option></select></label><label>備註<textarea name="platform_${x.id}_note">${esc(pd[x.id]?.note??'')}</textarea></label></fieldset>`).join('')}</div>`;
  $('productFields').innerHTML=platformHtml+FIELDS.filter(([k])=>!['conversionRate','storeCode','storeName','domesticShippingJPY'].includes(k)).map(([k,l,t,mode])=>{
    const v=computed[k]??'';
    if(k==='active')return`<label>${l}<select name="${k}" data-field-key="${k}"><option value="true" ${v!==false?'selected':''}>上架</option><option value="false" ${v===false?'selected':''}>下架</option></select></label>`;
    if(t==='textarea')return`<label>${l}<textarea name="${k}" data-field-key="${k}">${esc(v)}</textarea></label>`;
    const readonly=mode==='calculated'&&k==='logisticsMethod';const inputType=t==='number'||t==='percent'?'number':t==='url'?'url':'text';const step='any';
    const displayValue=t==='percent'&&v!==''&&Number.isFinite(Number(v))?Number(v).toFixed(6).replace(/0+$/,'').replace(/\.$/,''):v;
    const input=`<input name="${k}" data-field-key="${k}" data-field-mode="${mode}" type="${inputType}" step="${step}" value="${esc(displayValue)}" ${readonly?'readonly':''}>`;
    if(mode==='calculated'&&!readonly)return`<label>${l}<span class="override-row">${input}<button type="button" class="secondary reset-override" data-reset="${k}">自動</button></span></label>`;
    return`<label>${l}${input}</label>`
  }).join('');
}
function readProductFormDraft(){
  const base={...(productFormOriginal||{})}, overrides={};
  productFormManualOverrides.forEach(k=>overrides[k]=true);
  FIELDS.forEach(([k,,t])=>{
    if(['conversionRate','storeCode','storeName','domesticShippingJPY'].includes(k))return;
    const el=$('productFields').querySelector(`[name="${k}"]`);if(!el)return;
    if(t==='number'||t==='percent')base[k]=el.value===''?null:Number(el.value);
    else if(t==='boolean')base[k]=el.value==='true';
    else base[k]=el.value;
  });
  base.overrides=overrides;
  return base;
}
function updateProductFormCalculatedFields(changedKey=''){
  const draft=readProductFormDraft(), computed=compute(draft);
  FIELDS.forEach(([k,,t,mode])=>{
    if(mode!=='calculated'||k==='logisticsMethod'&&false)return;
    const el=$('productFields').querySelector(`[name="${k}"]`);if(!el||k===changedKey||productFormManualOverrides.has(k))return;
    const v=computed[k];
    if(t==='boolean')el.value=v?'true':'false';else if(t==='percent'&&v!==null&&v!==undefined&&Number.isFinite(Number(v)))el.value=Number(v).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');else el.value=v===null||v===undefined?'':v;
  });
  const methodEl=$('productFields').querySelector('[name="logisticsMethod"]');if(methodEl)methodEl.value=computed.logisticsMethod||'';
}
async function saveProduct(form){
  const fd=new FormData(form),id=$('productId').value,old=id?products.find(p=>p.id===id):{};const data={...old,overrides:{}};
  productFormManualOverrides.forEach(k=>data.overrides[k]=true);
  FIELDS.forEach(([k,,t])=>{if(['conversionRate','storeCode','storeName','domesticShippingJPY'].includes(k))return;const raw=fd.get(k);if(raw===null)return;data[k]=t==='number'||t==='percent'?(raw===''?null:Number(raw)):t==='boolean'?raw==='true':String(raw)});
  data.taiwanUrl=validUrl(data.taiwanUrl);data.japanUrl=validUrl(data.japanUrl);data.platformData={};PLATFORMS.forEach(x=>{data.platformData[x.id]={enabled:fd.get(`platform_${x.id}_enabled`)==='on',price:fd.get(`platform_${x.id}_price`)===''?null:Number(fd.get(`platform_${x.id}_price`)),active:fd.get(`platform_${x.id}_active`)==='true',note:String(fd.get(`platform_${x.id}_note`)||'')}});data.title=String(data.title||'').slice(0,100);data.updatedAt=serverTimestamp();if(!id)data.createdAt=serverTimestamp();const ref=id?doc(db,'products',id):doc(collection(db,'products'));await setDoc(ref,data,{merge:true});toast('商品已儲存');$('productDialog').close();await loadAll()
}
function findHeader(row,aliases){const normalized=Object.fromEntries(Object.keys(row).map(k=>[cleanHeader(k),k]));for(const a of aliases){const hit=normalized[cleanHeader(a)];if(hit!==undefined)return hit}return null}
function normalizeImportRows(rows){let parent={productManagementId:'',title:'',note:'',taiwanUrl:'',japanUrl:'',rtwBaseSku:''};return rows.map(row=>{const data={};for(const [key,aliases] of Object.entries(IMPORT_ALIASES)){const h=findHeader(row,aliases);if(h!==null)data[key]=row[h]}for(const k of Object.keys(data))data[k]=typeof data[k]==='string'?cleanText(data[k]):data[k];for(const k of ['productManagementId','title','note','taiwanUrl','japanUrl','rtwBaseSku']){if(cleanText(data[k]))parent[k]=data[k];else data[k]=parent[k]}data.specManagementId=cleanText(data.specManagementId);data.productManagementId=cleanText(data.productManagementId);data.taiwanUrl=validUrl(data.taiwanUrl);data.japanUrl=validUrl(data.japanUrl);return data}).filter(r=>r.specManagementId)}
async function exportProducts(){const rows=products.map(p=>{const r={};FIELDS.forEach(([k,l])=>r[l]=p[k]??'');PLATFORMS.forEach(x=>{const d=p.platformData?.[x.id]||{};r[`${x.name}-啟用`]=!!d.enabled;r[`${x.name}-售價`]=d.price??'';r[`${x.name}-上架`]=d.active!==false;r[`${x.name}-備註`]=d.note??''});return r});const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'商品主檔');XLSX.writeFile(wb,`商品資料庫_${new Date().toISOString().slice(0,10)}.xlsx`)}
function normalizeImportHeader(v){
  return String(v??'')
    .replace(/\uFEFF/g,'')
    .replace(/\u00A0/g,' ')
    .replace(/[\s　\r\n\t]+/g,'')
    .replace(/[（）]/g,m=>m==='（'?'(':')')
    .trim()
    .toLowerCase();
}
function normalizeImportedNumericFields(row){
  const numericHeaders=[
    '價格','商品台幣售價(手動)','商品台幣售價','台幣售價','售價(TWD)','售價 (TWD)','TWD價格',
    '日幣售價(JPY)','日幣售價','日幣售價 (JPY)','售價(JPY)','售價 (JPY)','日本售價','日本價格','JPY價格',
    '重量(g)','重量',
    '頁面檢視','頁面檢視總數','非重複訪客','不重複訪客','轉換率','售出單位','銷售商品數','銷售數','數量','訂單計數','銷售訂單數','銷售',
    '顧客已付金額','客戶已付金額','實付金額','付款總金額','運費','已收運費','Shipping',
    '商品結帳價格','商品成交價格','商品售價','店鋪運費','店舖運費'
  ];
  const normalized={...row};
  const numericHeaderSet=new Set(numericHeaders.map(h=>normalizeImportHeader(h)));
  for(const key of Object.keys(normalized)){
    if(numericHeaderSet.has(normalizeImportHeader(key))){
      const nval=cleanNumber(normalized[key]);
      if(nval!==null)normalized[key]=nval;
    }
  }
  return normalized;
}
function findRowValue(row,aliases){const h=findHeader(row,aliases);return h===null?'':row[h]}
function normalizeDateValue(v){if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);const s=cleanText(v);if(!s)return new Date().toISOString().slice(0,10);const d=new Date(s.replace(/[.\/]/g,'-'));return isNaN(d)?new Date().toISOString().slice(0,10):d.toISOString().slice(0,10)}
function sheetToObjectsUsingDetectedHeader(sheet,requiredAliases){
  // 不假設第一列就是表頭。掃描前 50 列，找出包含 Base SKU 與至少一個指定數據欄位的列。
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  let headerIndex=-1;
  for(let i=0;i<Math.min(matrix.length,50);i++){
    const cells=matrix[i].map(v=>cleanHeader(v));
    const hasBase=['商品管理編號(BaseSKU)','BaseSKU','商品管理編號'].some(a=>cells.includes(cleanHeader(a)));
    const hasMetric=requiredAliases.some(a=>cells.includes(cleanHeader(a)));
    if(hasBase&&hasMetric){headerIndex=i;break}
  }
  if(headerIndex<0){
    // fallback：沿用原本 SheetJS 第一列表頭方式
    return XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false}).map(normalizeImportedNumericFields);
  }
  const headers=matrix[headerIndex].map(v=>cleanText(v));
  return matrix.slice(headerIndex+1)
    .filter(row=>row.some(v=>cleanText(v)!==''))
    .map(row=>{
      const obj={};
      headers.forEach((h,i)=>{if(h)obj[h]=row[i]??''});
      return normalizeImportedNumericFields(obj);
    });
}

function parsePercentValue(v){
  if(v===null||v===undefined||v==='')return null;
  const s=String(v).trim();
  const num=cleanNumber(v);
  if(num===null)return null;
  // 來源含 % 時，例如 0.98% -> 0.0098。
  if(/[%％]/.test(s))return num/100;
  // Excel 百分比常以 0.0098 儲存；若是 0~1 直接視為比例。
  if(num>=0&&num<=1)return num;
  // 沒有 %、但值 >1 時視為百分點，例如 1.25 -> 1.25%。
  return num/100;
}

async function importRakutenProductMetrics(raw,fileName,manualStart='',manualEnd=''){
  const grouped=new Map();
  for(const row of raw){
    const base=cleanText(findRowValue(row,['商品管理編號 (Base SKU)','商品管理編號(Base SKU)','Base SKU','商品管理編號']));
    if(!base)continue;
    const sales=n(cleanNumber(findRowValue(row,['銷售','売上','Sales'])));
    const units=n(cleanNumber(findRowValue(row,['售出單位','銷售商品數','銷售數','數量'])));
    const orders=n(cleanNumber(findRowValue(row,['訂單計數','銷售訂單數'])));
    const pageViews=n(cleanNumber(findRowValue(row,['頁面檢視','頁面檢視總數','アクセス数','PV'])));
    const visitors=n(cleanNumber(findRowValue(row,['非重複訪客','不重複訪客','Unique Visitors'])));
    const sourceConversion=parsePercentValue(findRowValue(row,['轉換率','Conversion Rate']));
    const sourceDate=findRowValue(row,['訂單日期','日期','Date','資料日期','開始日期','日付']);
    const date=cleanText(sourceDate)?normalizeDateValue(sourceDate):(manualEnd||manualStart||new Date().toISOString().slice(0,10));
    const key=`${date}__${base}`;
    const g=grouped.get(key)||{date,baseSKU:base,salesAmount:0,unitsSold:0,orderCount:0,pageViews:0,visitors:0,conversionRate:null,_conversionWeighted:0,_conversionWeight:0};
    g.salesAmount+=sales;
    g.unitsSold+=units;
    g.orderCount+=orders;
    g.pageViews+=pageViews;
    g.visitors+=visitors;
    if(sourceConversion!==null){
      const w=pageViews||1;
      g._conversionWeighted+=sourceConversion*w;
      g._conversionWeight+=w;
    }
    grouped.set(key,g);
  }
  for(const g of grouped.values()){
    // 優先使用報表原始「轉換率」；若沒有，再用 訂單計數 ÷ 頁面檢視 計算。
    g.conversionRate=g._conversionWeight
      ? g._conversionWeighted/g._conversionWeight
      : (g.pageViews?g.orderCount/g.pageViews:null);
    delete g._conversionWeighted;
    delete g._conversionWeight;
  }

  if(!grouped.size)throw new Error('找不到【商品管理編號 (Base SKU)】或商品銷售數據');

  const productByBase=new Map();
  products.forEach(p=>{
    const k=cleanText(p.productManagementId);
    if(k){
      if(!productByBase.has(k))productByBase.set(k,[]);
      productByBase.get(k).push(p);
    }
  });

  let matched=0,unmatched=0;
  const rows=[...grouped.values()];
  for(let start=0;start<rows.length;start+=100){
    const batch=writeBatch(db);
    for(const r of rows.slice(start,start+100)){
      const matches=productByBase.get(r.baseSKU)||[];
      if(matches.length){
        matched++;
        const div=matches.length;
        for(const p of matches){
          batch.set(doc(db,'products',p.id),{
            salesAmount:round(r.salesAmount/div),
            unitsSold:round(r.unitsSold/div),
            orderCount:round(r.orderCount/div),
            pageViews:round(r.pageViews/div),
            visitors:round(r.visitors/div),
            conversionRate:r.conversionRate,
            updatedAt:serverTimestamp()
          },{merge:true});
        }
      }else unmatched++;

      // 固定 ID：相同期間 + Base SKU 重複上傳只覆寫，不累加。
      const sid=encodeURIComponent(`${r.date}_taiwan_rakuten_${r.baseSKU}_productmetrics`).replaceAll('%','_');
      batch.set(doc(db,'sales',sid),{
        date:r.date,periodStart:manualStart||r.date,periodEnd:manualEnd||r.date,
        baseSKU:r.baseSKU,salesAmount:round(r.salesAmount),
        // 商品層級銷售額保留獨立欄位；不混入唯一訂單營業額 revenueTWD。
        productSalesTWD:round(r.salesAmount),
        unitsSold:round(r.unitsSold),orderCount:round(r.orderCount),
        pageViews:round(r.pageViews),visitors:round(r.visitors),conversionRate:r.conversionRate,
        revenueTWD:0,shippingReceivedTWD:0,
        platform:'taiwan_rakuten',dataType:'product_metrics',
        fileName,importedAt:serverTimestamp(),updatedAt:serverTimestamp()
      },{merge:true});
    }
    await batch.commit();
  }
  await addDoc(collection(db,'imports'),{
    type:'rakuten_product_metrics',fileName,rowCount:raw.length,successCount:matched,skippedCount:unmatched,
    periodStart:manualStart||'',periodEnd:manualEnd||'',platform:'taiwan_rakuten',createdAt:serverTimestamp()
  });
  return{matched,unmatched};
}

async function handleRakutenProductMetricsImport(){
  const file=$('rakutenProductMetricsFile')?.files?.[0];
  if(!file)return toast('請先選擇台灣樂天商品銷售數據檔案');
  const btn=$('importRakutenProductMetricsBtn');
  if(btn)btn.disabled=true;
  try{
    setImportProgress('讀取台灣樂天商品銷售數據…',5);
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    const raw=sheetToObjectsUsingDetectedHeader(sheet,['銷售','售出單位','訂單計數','頁面檢視','轉換率']);
    if(!raw.length)throw new Error('檔案沒有資料');

    const baseHeader=findHeader(raw[0],['商品管理編號 (Base SKU)','商品管理編號(Base SKU)','Base SKU','商品管理編號']);
    const pvHeader=findHeader(raw[0],['頁面檢視','頁面檢視總數','アクセス数','PV']);
    const convHeader=findHeader(raw[0],['轉換率','Conversion Rate']);
    const unitsHeader=findHeader(raw[0],['售出單位','銷售商品數','銷售數','數量']);
    const ordersHeader=findHeader(raw[0],['訂單計數','銷售訂單數']);

    if(!baseHeader)throw new Error('找不到【商品管理編號 (Base SKU)】表頭');
    if(!pvHeader)throw new Error(`找不到【頁面檢視】表頭。實際表頭：${Object.keys(raw[0]).join(' / ')}`);

    const pvValues=raw.map(r=>cleanNumber(r[pvHeader])).filter(v=>v!==null);
    const pvTotal=pvValues.reduce((s,v)=>s+n(v),0);
    const unitTotal=unitsHeader?raw.reduce((s,r)=>s+n(cleanNumber(r[unitsHeader])),0):0;
    const orderTotal=ordersHeader?raw.reduce((s,r)=>s+n(cleanNumber(r[ordersHeader])),0):0;

    const start=$('salesImportStart')?.value||'', end=$('salesImportEnd')?.value||'';
    setImportProgress(
      `偵測表頭：頁面檢視=${pvHeader}；有效 ${pvValues.length.toLocaleString()} 筆／總和 ${formatInteger(pvTotal)}；售出單位總和 ${formatInteger(unitTotal)}；訂單計數總和 ${formatInteger(orderTotal)}${convHeader?`；轉換率=${convHeader}`:'；未找到轉換率欄'}`,
      30
    );
    await yieldToUI();
    if(pvValues.length===0)throw new Error(`已找到【${pvHeader}】欄，但沒有任何可轉換為數值的內容。請確認來源檔該欄不是空白。`);

    const result=await importRakutenProductMetrics(raw,file.name,start,end);
    setImportProgress(`商品銷售數據匯入完成：對應 ${result.matched.toLocaleString()} 筆，未對應 ${result.unmatched.toLocaleString()} 筆`,100);
    await loadAll();
    toast('台灣樂天商品銷售數據匯入完成');
  }catch(e){
    console.error(e);
    setImportProgress(`匯入失敗：${e.message||e}`,100);
  }finally{
    if(btn)btn.disabled=false;
  }
}

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

    const pageViews=isShopline?n(cleanNumber(findRowValue(row,['頁面檢視','頁面檢視總數']))):0;
    const unitsSold=isShopline
      ? n(cleanNumber(findRowValue(row,['數量','售出單位','銷售商品數'])))
      : 0;

    const orderNo=cleanText(findRowValue(row,['訂單號碼','訂單編號','Order ID','Order Number']));
    const customerPaid=cleanNumber(isShopline
      ? findRowValue(row,['付款總金額','顧客已付金額','實付金額'])
      : findRowValue(row,['顧客已付金額','客戶已付金額','實付金額']));
    const shipping=cleanNumber(findRowValue(row,['運費','已收運費','Shipping']));
    const lineRevenue=cleanNumber(isShopline
      ? findRowValue(row,['商品結帳價格','商品成交價格','商品售價'])
      : findRowValue(row,['商品結帳價格']));

    const orderCountSource=cleanNumber(findRowValue(row,['訂單計數','銷售訂單數']));
    const orderCount=isShopline?(orderNo?1:0):0;

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
          findHeader(row,['顧客已付金額'])!==null||
          findHeader(row,['運費'])!==null||
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
function normalizeFilterDate(v){
  const s=cleanText(v);
  if(!s)return '';
  const m=s.match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  return s.slice(0,10);
}
function dateInRange(date,start,end){
  const d=normalizeFilterDate(date),s=normalizeFilterDate(start),e=normalizeFilterDate(end);
  if(!d)return false;
  return(!s||d>=s)&&(!e||d<=e);
}
function periodsOverlap(periodStart,periodEnd,start,end){
  const ps=normalizeFilterDate(periodStart),pe=normalizeFilterDate(periodEnd),s=normalizeFilterDate(start),e=normalizeFilterDate(end);
  if(!ps&&!pe)return false;
  const a=ps||pe,b=pe||ps;
  return(!s||b>=s)&&(!e||a<=e);
}
function ordersForRange(start='',end='',platform='all'){
  return ordersHistory.filter(o=>dateInRange(o.date||o.periodEnd||o.periodStart,start,end)&&(platform==='all'||o.platform===platform));
}
function orderTotalsForRange(start='',end='',platform='all'){
  const rows=ordersForRange(start,end,platform);
  if(rows.length){
    // 舊資料或重複匯入也再次以「平台 + 訂單號碼」去重，避免總營業額重複計算。
    const unique=new Map();
    for(const o of rows){
      const orderNo=cleanText(o.orderNo||o.orderNumber||o.orderId||o.id);
      if(!orderNo)continue;
      const key=`${cleanText(o.platform)}__${orderNo}`;
      if(!unique.has(key))unique.set(key,o);
    }
    const vals=[...unique.values()];
    return{
      revenue:round(vals.reduce((s,o)=>s+n(o.customerPaid),0)),
      shipping:round(vals.reduce((s,o)=>s+n(o.shipping),0)),
      orderCount:vals.length,
      hasOrders:true
    };
  }
  const sales=salesHistory.filter(r=>dateInRange(r.date||r.periodEnd||r.periodStart,start,end)&&(platform==='all'||r.platform===platform));
  return uniqueOrderTotals(sales);
}
function trafficReportsForRange(start='',end='',platform='all'){
  // 全店訪問報告是「期間彙總」而非逐日資料，只要報告期間與篩選期間有交集就納入。
  return trafficHistory.filter(t=>(platform==='all'||t.platform===platform)&&periodsOverlap(t.periodStart,t.periodEnd,start,end));
}
function trafficTotalsForRange(start='',end='',platform='all'){
  const reports=trafficReportsForRange(start,end,platform);
  return reports.reduce((a,t)=>{a.pv+=n(t.totalPV);a.uv+=n(t.totalUV);return a},{pv:0,uv:0});
}
function parseTrafficRange(v){
  const s=cleanText(v).replace(/\s+/g,' ');

  // 格式 1：YYYY/MM/DD ~ YYYY/MM/DD
  let m=s.match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\s*[~～\-–—]\s*(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if(m){
    const fmt=(y,mo,d)=>`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return{start:fmt(m[1],m[2],m[3]),end:fmt(m[4],m[5],m[6]),granularity:'day'};
  }

  // 格式 2：YYYY/MM ~ YYYY/MM
  // 月份格式會自動換成該月第一天到結束月份最後一天。
  m=s.match(/(\d{4})[\/.-](\d{1,2})\s*[~～\-–—]\s*(\d{4})[\/.-](\d{1,2})/);
  if(m){
    const sy=Number(m[1]),sm=Number(m[2]),ey=Number(m[3]),em=Number(m[4]);
    if(sm<1||sm>12||em<1||em>12)return null;
    const lastDay=new Date(ey,em,0).getDate();
    const fmt=(y,mo,d)=>`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return{start:fmt(sy,sm,1),end:fmt(ey,em,lastDay),granularity:'month'};
  }

  return null;
}
async function importRakutenWholeShopTraffic(file){
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),sheet=wb.Sheets[wb.SheetNames[0]];
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  if(matrix.length<4)throw new Error('全店訪問報告格式不足，至少需要時間範圍、表頭與資料列');
  const timeRow=matrix.find(r=>cleanHeader(r[0])==='時間範圍');
  const range=parseTrafficRange(timeRow?.[1]);if(!range)throw new Error('找不到或無法解析【時間範圍】');
  let headerIndex=matrix.findIndex(r=>cleanHeader(r[0])==='頁面'&&r.some(v=>cleanHeader(v)==='所有頁面檢視')&&r.some(v=>cleanHeader(v)==='所有非重複訪客'));
  if(headerIndex<0)throw new Error('找不到包含【頁面／所有頁面檢視／所有非重複訪客】的表頭列');
  const headers=matrix[headerIndex].map(cleanHeader),pvIdx=headers.indexOf(cleanHeader('所有頁面檢視')),uvIdx=headers.indexOf(cleanHeader('所有非重複訪客'));
  const wanted={'全店頁面':'wholeShop','商品頁面':'productPage','店家類別頁面':'categoryPage','店家首頁':'storeHome'};const pages={};
  for(const row of matrix.slice(headerIndex+1)){const label=cleanText(row[0]);if(!wanted[label])continue;pages[wanted[label]]={label,pv:n(cleanNumber(row[pvIdx])),uv:n(cleanNumber(row[uvIdx]))}}
  if(!pages.wholeShop)throw new Error('找不到【全店頁面】資料列');
  const id=`taiwan_rakuten_${range.start}_${range.end}`.replace(/[^A-Za-z0-9_-]/g,'_');
  await setDoc(doc(db,'trafficReports',id),{platform:'taiwan_rakuten',periodStart:range.start,periodEnd:range.end,totalPV:pages.wholeShop.pv,totalUV:pages.wholeShop.uv,pages,fileName:file.name,updatedAt:serverTimestamp()},{merge:true});
  await addDoc(collection(db,'imports'),{type:'whole_shop_traffic',platform:'taiwan_rakuten',fileName:file.name,periodStart:range.start,periodEnd:range.end,totalPV:pages.wholeShop.pv,totalUV:pages.wholeShop.uv,createdAt:serverTimestamp()});
  return{...range,pages,totalPV:pages.wholeShop.pv,totalUV:pages.wholeShop.uv};
}
async function handleRakutenWholeShopTrafficImport(){
  const files=[...($('rakutenWholeShopTrafficFile')?.files||[])];
  if(!files.length)return toast('請先選擇台灣樂天全店訪問報告');
  const btn=$('importRakutenWholeShopTrafficBtn');
  if(btn)btn.disabled=true;
  try{
    const results=[];
    for(let i=0;i<files.length;i++){
      const file=files[i];
      setImportProgress(`讀取全店訪問報告 ${i+1}/${files.length}：${file.name}`,Math.round(5+(i/files.length)*85));
      const r=await importRakutenWholeShopTraffic(file);
      results.push(r);
      await yieldToUI();
    }
    const pv=results.reduce((s,r)=>s+n(r.totalPV),0),uv=results.reduce((s,r)=>s+n(r.totalUV),0);
    setImportProgress(`全店流量匯入完成：${results.length} 份報告；PV ${formatInteger(pv)}；UV ${formatInteger(uv)}；月份格式會自動換算為該月完整日期區間`,100);
    await loadAll();
    toast(`全店訪問報告匯入完成：${results.length} 份`);
  }catch(e){
    console.error(e);
    setImportProgress(`匯入失敗：${e.message||e}`,100);
  }finally{
    if(btn)btn.disabled=false;
  }
}

function getOverviewRows(){const start=$('overviewStart').value,end=$('overviewEnd').value,platform=$('overviewPlatform').value;return salesHistory.filter(r=>dateInRange(r.date||r.periodEnd||r.periodStart,start,end)&&(platform==='all'||r.platform===platform))}
function productForSalesRow(r){return products.find(p=>cleanText(p.productManagementId)===cleanText(r.baseSKU))||products.find(p=>cleanText(p.specManagementId)===cleanText(r.specManagementId))}
function shortTitle(v){const s=cleanText(v);return s.length>20?s.slice(0,20)+'…':s}
function salesRowRevenue(r){if(Number.isFinite(Number(r.revenueTWD))&&n(r.revenueTWD)!==0)return n(r.revenueTWD);const p=productForSalesRow(r);return n(r.unitsSold)*n(p?.manualPriceTWD)}
function uniqueOrderTotals(rows){const seen=new Set();let revenue=0,shipping=0;for(const r of rows){for(const o of (Array.isArray(r.orderDetails)?r.orderDetails:[])){const key=`${r.platform||''}__${o.orderNo}`;if(!o.orderNo||seen.has(key))continue;seen.add(key);revenue+=n(o.customerPaid);shipping+=n(o.shipping)}}const hasOrders=seen.size>0;if(!hasOrders){revenue=rows.reduce((s,r)=>s+salesRowRevenue(r),0);shipping=rows.reduce((s,r)=>s+n(r.shippingReceivedTWD),0)}return{revenue,shipping,orderCount:seen.size,hasOrders}}
function sortRanking(rows){const mode=$('rankingSort')?.value||'units_desc';return rows.sort((a,b)=>{if(mode==='units_asc')return a.units-b.units;if(mode==='revenue_desc')return b.revenue-a.revenue;if(mode==='revenue_asc')return a.revenue-b.revenue;if(mode==='orders_desc')return b.orders-a.orders;if(mode==='price_desc')return b.price-a.price;return b.units-a.units||b.orders-a.orders})}
function safeChart(canvasId,oldChart,config){
  try{
    if(oldChart)oldChart.destroy();
    const el=$(canvasId);
    if(!el)return null;
    return new Chart(el,config);
  }catch(e){
    console.error(`Chart ${canvasId} render failed`,e);
    return null;
  }
}
function renderOverview(){
  if(currentView!=='overview')return;
  const startDate=$('overviewStart').value,endDate=$('overviewEnd').value,platform=$('overviewPlatform').value;
  const rows=getOverviewRows();
  const units=rows.reduce((s,r)=>s+n(r.unitsSold),0);
  const fallbackOrders=rows.reduce((s,r)=>s+n(r.orderCount),0);
  const totals=orderTotalsForRange(startDate,endDate,platform);
  const orders=totals.hasOrders?totals.orderCount:fallbackOrders,revenue=totals.revenue;
  const traffic=trafficTotalsForRange(startDate,endDate,platform),pv=traffic.pv,uv=traffic.uv;if($('overviewDataStatus'))$('overviewDataStatus').textContent=`已載入：商品 ${products.length.toLocaleString()}／銷售紀錄 ${salesHistory.length.toLocaleString()}／唯一訂單 ${ordersHistory.length.toLocaleString()}／全店訪問報告 ${trafficHistory.length.toLocaleString()} 份（流量報告為期間彙總資料）`;
  $('ovUniqueVisitors').textContent=formatInteger(uv);
  $('ovUnitsSold').textContent=formatInteger(units);
  $('ovOrders').textContent=formatInteger(orders);
  $('ovConversion').textContent=uv?`${(orders/uv*100).toFixed(2)}%`:'0%';
  $('ovRevenue').textContent=formatInteger(revenue);
  if($('ovShipping'))$('ovShipping').textContent=formatInteger(totals.shipping);
  $('ovPvUv').textContent=uv?(pv/uv).toFixed(2):'0';
  $('ovAov').textContent=orders?formatInteger(revenue/orders):'0';
  $('ovUvValue').textContent=uv?formatInteger(revenue/uv):'0';

  const byProduct=new Map(),byPlatform=new Map();
  for(const r of rows){
    if(r.dataType==='product_metrics'){
      const p=productForSalesRow(r),key=cleanText(r.baseSKU)||cleanText(r.specManagementId);
      const g=byProduct.get(key)||{baseSKU:r.baseSKU,specManagementId:r.specManagementId||p?.specManagementId||'',title:r.title||p?.title||'',price:n(p?.manualPriceTWD),units:0,orders:0,revenue:0,platform:r.platform};
      g.units+=n(r.unitsSold);g.orders+=n(r.orderCount);g.revenue+=n(r.productSalesTWD||r.salesAmount);
      if(!g.title)g.title=p?.title||'';if(!g.price)g.price=n(p?.manualPriceTWD);byProduct.set(key,g);
    }
  }
  const orderRows=ordersForRange(startDate,endDate,platform);
  if(orderRows.length){for(const o of orderRows)byPlatform.set(o.platform,(byPlatform.get(o.platform)||0)+n(o.customerPaid))}
  else{for(const r of rows)if(r.dataType!=='product_metrics')byPlatform.set(r.platform,(byPlatform.get(r.platform)||0)+salesRowRevenue(r))}

  const ranking=sortRanking([...byProduct.values()]);
  $('rankingTableBody').innerHTML=ranking.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.specManagementId)}</td><td>${esc(r.baseSKU)}</td><td title="${esc(r.title)}">${esc(shortTitle(r.title))}</td><td>${formatInteger(r.price)}</td><td>${formatInteger(r.units)}</td><td>${formatInteger(r.orders)}</td><td>${formatInteger(r.revenue)}</td></tr>`).join('')||'<tr><td colspan="8" class="muted">此期間尚無商品銷售資料</td></tr>';
  $('rankingPeriod').textContent=(startDate||'最早')+' ～ '+(endDate||'最新');

  // 銷售趨勢：使用唯一訂單資料，避免商品彙總報表被整批塞在結束日造成異常尖峰。
  const salesByDate=new Map();
  if(orderRows.length){for(const o of orderRows){const d=salesByDate.get(o.date)||{revenue:0,orders:0};d.revenue+=n(o.customerPaid);d.orders+=1;salesByDate.set(o.date,d)}}
  else{for(const r of rows){if(r.dataType==='product_metrics')continue;const d=salesByDate.get(r.date)||{revenue:0,orders:0};d.revenue+=n(r.revenueTWD);d.orders+=n(r.orderCount);salesByDate.set(r.date,d)}}
  const dates=[...salesByDate.keys()].sort();
  if(salesTrendChart)salesTrendChart.destroy();
  salesTrendChart=safeChart('salesTrendChart',salesTrendChart,{type:'bar',data:{labels:dates,datasets:[{type:'bar',label:'營業額',data:dates.map(d=>salesByDate.get(d).revenue),yAxisID:'y'},{type:'line',label:'銷售訂單數',data:dates.map(d=>salesByDate.get(d).orders),yAxisID:'y1',tension:.2}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,position:'left'},y1:{beginAtZero:true,position:'right',grid:{drawOnChartArea:false}}}}});

  const top=[...ranking].sort((a,b)=>b.units-a.units).slice(0,10).reverse();if(rankingChart)rankingChart.destroy();rankingChart=new Chart($('rankingChart'),{type:'bar',data:{labels:top.map(r=>shortTitle(r.title||r.baseSKU)),datasets:[{label:'銷售數量',data:top.map(r=>r.units)}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});

  // 流量趨勢：改用全店訪問報告的非重複訪客數，不再使用商品頁 PV。
  const reports=trafficReportsForRange(startDate,endDate,platform).sort((a,b)=>String(a.periodEnd).localeCompare(String(b.periodEnd)));
  const trafficLabels=reports.map(r=>`${r.periodStart}～${r.periodEnd}`);
  const trafficDatasets=[
    {label:'非重複訪客數',data:reports.map(r=>n(r.totalUV)),tension:.2,pointRadius:5,pointHoverRadius:7},
    {label:'訂單數',data:reports.map(r=>orderTotalsForRange(r.periodStart,r.periodEnd,r.platform).orderCount),tension:.2,pointRadius:5,pointHoverRadius:7}
  ];
  if(reports.length===1){
    // 單一彙總報告沒有時間序列，改用柱狀圖避免看起來像空白。
    trafficTrendChart=safeChart('trafficTrendChart',trafficTrendChart,{type:'bar',data:{labels:trafficLabels,datasets:trafficDatasets},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}},plugins:{tooltip:{enabled:true}}}});
    if($('trafficTrendNote'))$('trafficTrendNote').textContent='目前只有 1 份期間彙總報告，因此顯示單一期間比較，尚無法形成真正的時間趨勢。請匯入 2 份以上不同時間範圍的全店訪問報告。';
  }else if(reports.length>1){
    trafficTrendChart=safeChart('trafficTrendChart',trafficTrendChart,{type:'line',data:{labels:trafficLabels,datasets:trafficDatasets},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}});
    if($('trafficTrendNote'))$('trafficTrendNote').textContent=`目前以 ${reports.length} 份全店訪問報告呈現期間趨勢。`;
  }else{
    trafficTrendChart=safeChart('trafficTrendChart',trafficTrendChart,{type:'bar',data:{labels:[],datasets:trafficDatasets},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}});
    if($('trafficTrendNote'))$('trafficTrendNote').textContent='目前篩選期間沒有全店訪問報告。請先至「資料匯入」上傳台灣樂天全店訪問報告。';
  }

  if(platformRevenueChart)platformRevenueChart.destroy();const pLabels=[...byPlatform.keys()].map(x=>PLATFORMS.find(p=>p.id===x)?.name||x);platformRevenueChart=new Chart($('platformRevenueChart'),{type:'doughnut',data:{labels:pLabels,datasets:[{data:[...byPlatform.values()]}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%'}});
}
function rowsForSection(startId,endId,platformId){const start=$(startId)?.value||'',end=$(endId)?.value||'',platform=$(platformId)?.value||'all';return salesHistory.filter(r=>dateInRange(r.date||r.periodEnd||r.periodStart,start,end)&&(platform==='all'||r.platform===platform))}
function sortDataRows(list,state){return list.sort((a,b)=>{const av=a[state.key],bv=b[state.key];const numeric=['revenue','shipping','units','orders','pv','uv','conversion'].includes(state.key);const cmp=numeric?n(av)-n(bv):String(av??'').localeCompare(String(bv??''),'zh-Hant',{numeric:true});return cmp*(state.direction==='asc'?1:-1)})}
function sortHeader(label,key,scope,state){return `<div class="excel-header"><span>${esc(label)}</span><select class="mini-sort" data-${scope}-sort="${key}" aria-label="${esc(label)}排序"><option value="">排序</option><option value="asc" ${state.key===key&&state.direction==='asc'?'selected':''}>▲ 小→大</option><option value="desc" ${state.key===key&&state.direction==='desc'?'selected':''}>▼ 大→小</option></select></div>`}
function renderCrossPlatform(){
  const rows=rowsForSection('crossStart','crossEnd','crossPlatformFilter'),map=new Map();
  for(const r of rows){const p=productForSalesRow(r),key=`${r.platform}_${r.baseSKU}`;const g=map.get(key)||{spec:p?.specManagementId||r.specManagementId,base:r.baseSKU,title:p?.title||r.title,platform:r.platform,revenue:0,shipping:0,units:0,orders:0,rows:[]};g.rows.push(r);g.units+=n(r.unitsSold);g.orders+=n(r.orderCount);g.revenue+=salesRowRevenue(r);g.shipping+=n(r.shippingReceivedTWD);map.set(key,g)}
  let list=[...map.values()];sortDataRows(list,crossSort);const allTotals=uniqueOrderTotals(rows);$('crossRevenue').textContent=formatInteger(allTotals.revenue);if($('crossShipping'))$('crossShipping').textContent=formatInteger(allTotals.shipping);$('crossUnits').textContent=formatInteger(list.reduce((s,x)=>s+x.units,0));$('crossCount').textContent=formatInteger(list.length);
  const labels=Object.fromEntries(CROSS_COLUMN_DEFS),cols=crossVisibleColumns.filter(k=>labels[k]);
  if($('crossPlatformHead'))$('crossPlatformHead').innerHTML='<tr>'+cols.map(k=>`<th>${sortHeader(labels[k],k,'cross',crossSort)}</th>`).join('')+'</tr>';
  const cell=(x,k)=>k==='spec'?esc(x.spec):k==='base'?esc(x.base):k==='title'?esc(shortTitle(x.title)):k==='platform'?esc(PLATFORMS.find(p=>p.id===x.platform)?.name||x.platform):formatInteger(x[k]);
  $('crossPlatformBody').innerHTML=list.map(x=>'<tr>'+cols.map(k=>`<td>${cell(x,k)}</td>`).join('')+'</tr>').join('')||`<tr><td colspan="${Math.max(1,cols.length)}" class="muted">此期間尚無資料</td></tr>`;
}
function renderPlatformCompare(){
  try{
    const startDate=$('platformStart')?.value||'',endDate=$('platformEnd')?.value||'',selected=$('platformFilter')?.value||'all';
    const platformIds=selected==='all'?PLATFORMS.map(p=>p.id):[selected];if($('platformDataStatus'))$('platformDataStatus').textContent=`已載入：銷售紀錄 ${salesHistory.length.toLocaleString()}／唯一訂單 ${ordersHistory.length.toLocaleString()}／全店訪問報告 ${trafficHistory.length.toLocaleString()}`;
    let list=platformIds.map(k=>{
      const rows=salesHistory.filter(r=>dateInRange(r.date||r.periodEnd||r.periodStart,startDate,endDate)&&r.platform===k);
      const units=rows.reduce((s,r)=>s+n(r.unitsSold),0);
      const fallbackOrders=rows.reduce((s,r)=>s+n(r.orderCount),0);
      const totals=orderTotalsForRange(startDate,endDate,k),orders=totals.hasOrders?totals.orderCount:fallbackOrders;
      const traffic=trafficTotalsForRange(startDate,endDate,k),uv=traffic.uv;
      return{platform:k,revenue:totals.revenue,shipping:totals.shipping,units,orders,uv,conversion:uv?orders/uv:0};
    }).filter(x=>x.revenue||x.shipping||x.units||x.orders||x.uv);
    sortDataRows(list,platformSort);
    if($('platformCompareHead'))$('platformCompareHead').innerHTML=`<tr><th>${sortHeader('平台','platform','platform',platformSort)}</th><th>${sortHeader('營業額','revenue','platform',platformSort)}</th><th>${sortHeader('已收運費','shipping','platform',platformSort)}</th><th>${sortHeader('銷量','units','platform',platformSort)}</th><th>${sortHeader('訂單數','orders','platform',platformSort)}</th><th>${sortHeader('非重複訪客數','uv','platform',platformSort)}</th><th>${sortHeader('轉換率','conversion','platform',platformSort)}</th></tr>`;
    if($('platformCompareBody'))$('platformCompareBody').innerHTML=list.map(g=>`<tr><td>${esc(PLATFORMS.find(p=>p.id===g.platform)?.name||g.platform)}</td><td>${formatInteger(g.revenue)}</td><td>${formatInteger(g.shipping)}</td><td>${formatInteger(g.units)}</td><td>${formatInteger(g.orders)}</td><td>${formatInteger(g.uv)}</td><td>${(g.conversion*100).toFixed(2)}%</td></tr>`).join('')||'<tr><td colspan="7" class="muted">此期間尚無資料。請確認已匯入銷售資料／唯一訂單／全店訪問報告。</td></tr>';
  }catch(e){
    console.error('平台比較渲染失敗',e);
    if($('platformCompareHead'))$('platformCompareHead').innerHTML='<tr><th>平台比較讀取錯誤</th></tr>';
    if($('platformCompareBody'))$('platformCompareBody').innerHTML=`<tr><td class="muted">${esc(e.message||String(e))}</td></tr>`;
  }
}
function initOverviewDates(){
  const dates=[
    ...salesHistory.map(r=>normalizeFilterDate(r.date||r.periodEnd||r.periodStart)),
    ...ordersHistory.map(r=>normalizeFilterDate(r.date)),
    ...trafficHistory.flatMap(r=>[normalizeFilterDate(r.periodStart),normalizeFilterDate(r.periodEnd)])
  ].filter(Boolean).sort();
  if(!dates.length)return;
  if($('overviewStart')&&!$('overviewStart').value)$('overviewStart').value=dates[0];
  if($('overviewEnd')&&!$('overviewEnd').value)$('overviewEnd').value=dates[dates.length-1];
  if($('platformStart')&&!$('platformStart').value)$('platformStart').value=dates[0];
  if($('platformEnd')&&!$('platformEnd').value)$('platformEnd').value=dates[dates.length-1];
  if($('crossStart')&&!$('crossStart').value)$('crossStart').value=dates[0];
  if($('crossEnd')&&!$('crossEnd').value)$('crossEnd').value=dates[dates.length-1];
}

async function countCollection(name){const s=await getDocs(collection(db,name));return s.size}
async function refreshMaintenance(){const entries=await Promise.all(Object.entries(MAINT_COLLECTIONS).map(async([k,l])=>[k,l,await countCollection(k)]));$('maintenanceCounts').innerHTML=entries.map(([k,l,c])=>`<label class="maintenance-row"><input type="checkbox" value="${k}"><span>${l}</span><strong>${c}</strong></label>`).join('');await runHealthCheck(false)}
function productKeys(){const s=new Set();products.forEach(p=>[p.specManagementId,p.productManagementId].forEach(v=>{if(cleanText(v))s.add(cleanText(v))}));return s}
function recordProductKey(d){for(const k of ['商品規格管理編號','商品管理編號','specManagementId','productManagementId','sku','SKU','商品編號'])if(cleanText(d[k]))return cleanText(d[k]);return''}
async function runHealthCheck(showToast=true){const keys=productKeys(),result={};for(const name of ['sales','ads','productAnalysis']){const snap=await getDocs(collection(db,name));let unmatched=0;snap.forEach(x=>{const key=recordProductKey(x.data());if(!key||!keys.has(key))unmatched++});result[name]=unmatched}$('healthSales').textContent=result.sales;$('healthAds').textContent=result.ads;$('healthAnalysis').textContent=result.productAnalysis;if(showToast)toast('商品對應健康檢查完成');return result}
async function deleteCollection(name){const snap=await getDocs(collection(db,name));for(let i=0;i<snap.docs.length;i+=450){const batch=writeBatch(db);snap.docs.slice(i,i+450).forEach(d=>batch.delete(d.ref));await batch.commit()}}
async function deleteSelectedCollections(){if($('deleteConfirm').value!=='DELETE')return toast('請輸入 DELETE 才能刪除');const selected=[...$('maintenanceCounts').querySelectorAll('input:checked')].map(x=>x.value);if(!selected.length)return toast('請先勾選資料');for(const c of selected)await deleteCollection(c);$('deleteConfirm').value='';await loadAll();await refreshMaintenance();toast('指定資料已刪除')}
async function clearImportedData(){if($('deleteConfirm').value!=='DELETE')return toast('請輸入 DELETE 才能刪除');for(const c of ['products','sales','orders','trafficReports','ads','productAnalysis','imports','platforms','stores'])await deleteCollection(c);$('deleteConfirm').value='';await ensurePlatforms();await loadAll();await refreshMaintenance();toast('全部匯入資料已清空；登入帳號未變更')}
async function rebuildProductIndex(){await deleteCollection('productIndex');for(let i=0;i<products.length;i+=400){const batch=writeBatch(db);products.slice(i,i+400).forEach(p=>{for(const[type,key]of[['spec',p.specManagementId],['product',p.productManagementId]])if(cleanText(key)){const id=encodeURIComponent(`${type}_${cleanText(key)}`).replaceAll('%','_');batch.set(doc(db,'productIndex',id),{type,key:cleanText(key),productId:p.id,updatedAt:serverTimestamp()})}});await batch.commit()}toast(`商品索引重建完成：${products.length} 筆商品`)}
async function recalcDashboard(){const health=await runHealthCheck(false);const sales=await countCollection('sales'),ads=await countCollection('ads'),analysis=await countCollection('productAnalysis');await setDoc(doc(db,'settings','dashboardSummary'),{productCount:products.length,activeCount:products.filter(p=>p.active).length,totalUnits:products.reduce((s,p)=>s+n(p.unitsSold),0),salesCount:sales,adsCount:ads,analysisCount:analysis,unmatched:health,updatedAt:serverTimestamp()});toast('Dashboard 已重新計算')}


let pricingCart=[];
let pricingColumnFilters={},pricingSortState={key:'',direction:'asc'},activePricingFilterKey='';
function pricingShipping(weightG){
  const w=n(weightG); if(!w)return {method:'',cost:0};
  if(w<600)return {method:'統一數網',cost:w<=1000?params.uniFirstKgTWD:params.uniFirstKgTWD+Math.ceil((w-1000)/500)*params.uniEachHalfKgTWD};
  const kg=w/1000;if(kg>13)return {method:'新日誠',cost:null};
  const tier=params.tiers.find(([max])=>kg<=max);return {method:'新日誠',cost:tier?round(tier[1]*params.nisshinRate*params.nisshinDiscount+params.nisshinFixedFeeTWD):null};
}
function pricingFreeShipping(){const el=$('pricingFreeShippingTWD');return el?Math.max(0,n(el.value)):params.freeShippingTWD}
function pricingCustomerShipping(weightG,priceTWD,freeThreshold=null){const threshold=freeThreshold===null?pricingFreeShipping():freeThreshold;return n(priceTWD)>=threshold?0:(n(weightG)/1000)*params.customerShippingPerKgTWD}
function pricingTargetRate(){const raw=n($('pricingTargetRate')?.value);return Math.max(0,Math.min(.8,raw/100))}
function pricingSuggested(p,targetOverride=null){
  const price=n(p.priceJPY),weight=n(p.weightG),store=getStore(p);if(!price||!weight)return null;
  const productCost=price*params.productCostRate;
  const domesticJPY=price>=params.freeDomesticJPY?0:(n(store?.shippingJPY)||params.domesticShippingJPY);
  const domestic=domesticJPY*params.productCostRate, ship=pricingShipping(weight).cost;if(ship===null)return null;
  const target=targetOverride===null?params.targetProfitRate:targetOverride,denom=1-params.platformFeeRate-target;if(denom<=0)return null;
  const customer=(weight/1000)*params.customerShippingPerKgTWD,freeThreshold=pricingFreeShipping();
  let candidate=(productCost+domestic+ship-customer*(1-target))/denom;
  if(candidate>=freeThreshold)candidate=(productCost+domestic+ship)/denom;
  return round(candidate);
}
function pricingFinancialAtPrice(p,salePrice){
  const price=n(p.priceJPY),weight=n(p.weightG),sale=n(salePrice),store=getStore(p);if(!price||!weight||!sale)return null;
  const productCost=price*params.productCostRate;
  const domesticJPY=price>=params.freeDomesticJPY?0:(n(store?.shippingJPY)||params.domesticShippingJPY);
  const domestic=domesticJPY*params.productCostRate,ship=pricingShipping(weight).cost;if(ship===null)return null;
  const customer=pricingCustomerShipping(weight,sale),fee=sale*params.platformFeeRate,gross=sale+customer;
  const profit=gross-productCost-domestic-ship-fee;return {gross,profit,margin:gross?profit/gross:null,customer,ship,productCost,domestic,fee};
}
function pricingMarginAtPrice(p,salePrice){return pricingFinancialAtPrice(p,salePrice)?.margin??null}
function pricingBaseRows(){
  const q=cleanText($('pricingSearch')?.value).toLowerCase(),target=pricingTargetRate();
  return products.filter(p=>!q||[p.specManagementId,p.productManagementId,p.title].some(v=>cleanText(v).toLowerCase().includes(q))).map(p=>{
    const ship=pricingShipping(p.weightG),suggested=pricingSuggested(p,target),current=n(p.manualPriceTWD),currentCustomer=pricingCustomerShipping(p.weightG,current),currentMargin=pricingMarginAtPrice(p,current),diff=suggested===null?null:suggested-current;
    return {p,ship,suggested,current,currentCustomer,currentMargin,diff};
  });
}
function pricingRawValue(r,key){return {spec:cleanText(r.p.specManagementId),title:cleanText(r.p.title),priceJPY:n(r.p.priceJPY),weight:n(r.p.weightG),method:r.ship.method,shipCost:r.ship.cost===null?'超過級距':n(r.ship.cost),customer:n(r.currentCustomer),currentPrice:n(r.current),margin:r.currentMargin===null?'—':Number((r.currentMargin*100).toFixed(1)),suggested:r.suggested===null?'—':n(r.suggested),diff:r.diff===null?'—':n(r.diff)}[key]}
function pricingValueKey(r,key){const v=pricingRawValue(r,key);return String(v??'')}
function pricingValueLabel(r,key){const v=pricingRawValue(r,key);if(key==='margin'&&typeof v==='number')return v.toFixed(1)+'%';if(['priceJPY','weight','shipCost','customer','currentPrice','suggested','diff'].includes(key)&&typeof v==='number')return formatInteger(v);return String(v??'')}
function pricingRows(){
  let rows=pricingBaseRows();
  for(const [key,selected] of Object.entries(pricingColumnFilters))if(Array.isArray(selected)&&selected.length)rows=rows.filter(r=>selected.includes(pricingValueKey(r,key)));
  if(pricingSortState.key){const key=pricingSortState.key,dir=pricingSortState.direction==='asc'?1:-1;rows.sort((a,b)=>{const av=pricingRawValue(a,key),bv=pricingRawValue(b,key);if(typeof av==='number'&&typeof bv==='number')return(av-bv)*dir;return String(av).localeCompare(String(bv),'zh-Hant',{numeric:true})*dir})}
  return rows;
}
function pricingUniqueValues(key){const m=new Map();for(const r of pricingBaseRows()){const k=pricingValueKey(r,key);if(!m.has(k))m.set(k,pricingValueLabel(r,key))}return [...m.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'zh-Hant',{numeric:true})).slice(0,500)}
function closePricingFilterMenu(){const x=document.getElementById('pricingExcelFilterMenu');if(x)x.remove();activePricingFilterKey=''}
function openPricingFilterMenu(key,anchor){
  closePricingFilterMenu();activePricingFilterKey=key;const values=pricingUniqueValues(key),allKeys=values.map(x=>x[0]),current=pricingColumnFilters[key],selected=Array.isArray(current)&&current.length?current:allKeys;
  const panel=document.createElement('div');panel.id='pricingExcelFilterMenu';panel.className='excel-filter-menu';
  panel.innerHTML=`<button type="button" data-pricing-menu-sort="asc">⬆ 升冪排序</button><button type="button" data-pricing-menu-sort="desc">⬇ 降冪排序</button><button type="button" data-pricing-menu-clear-sort>清除排序</button><hr><input class="excel-value-search" type="search" data-pricing-menu-search placeholder="搜尋文字或項目"><label class="excel-check-all"><input type="checkbox" data-pricing-menu-all ${selected.length===allKeys.length?'checked':''}>（全選）</label><div class="excel-value-list">${values.map(([k,label])=>`<label data-pricing-value-label="${esc(String(label).toLowerCase())}"><input type="checkbox" data-pricing-menu-value value="${esc(k)}" ${selected.includes(k)?'checked':''}>${esc(label)}</label>`).join('')}</div>${values.length>=500?'<div class="muted excel-limit">僅顯示前 500 個項目</div>':''}<div class="excel-filter-actions"><button type="button" class="secondary" data-pricing-menu-clear>清除篩選</button><button type="button" data-pricing-menu-apply>套用</button></div>`;
  document.body.appendChild(panel);const rect=anchor.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-panel.offsetWidth-12))+'px';panel.style.top=Math.max(8,Math.min(rect.bottom+4,window.innerHeight-panel.offsetHeight-12))+'px';
}
function pricingAdjustedOverall(list){let gross=0,profit=0,count=0;for(const r of list){if(r.suggested===null)continue;const f=pricingFinancialAtPrice(r.p,r.suggested);if(!f)continue;gross+=f.gross;profit+=f.profit;count++}return {margin:gross?profit/gross:null,count}}
function pricingCartSummaryData(){
  if(!pricingCart.length)return null;
  let sales=0,cost=0,domestic=0,weight=0;
  const items=[];
  for(const x of pricingCart){
    const p=products.find(y=>y.id===x.id);if(!p)continue;
    const price=n(p.manualPriceTWD)||n(pricingSuggested(p,pricingTargetRate())),store=getStore(p),qty=Math.max(1,Math.floor(n(x.qty)||1));
    const itemCost=n(p.priceJPY)*params.productCostRate*qty;
    const itemDomestic=(n(p.priceJPY)>=params.freeDomesticJPY?0:(n(store?.shippingJPY)||params.domesticShippingJPY)*params.productCostRate)*qty;
    sales+=price*qty;cost+=itemCost;domestic+=itemDomestic;weight+=n(p.weightG)*qty;
    items.push({p,price,qty,itemCost,itemDomestic,subtotal:price*qty});
  }
  const ship=pricingShipping(weight),customer=n(sales)>=params.freeShippingTWD?0:(weight/1000)*params.customerShippingPerKgTWD,fee=sales*params.platformFeeRate;
  const profit=ship.cost===null?null:sales+customer-cost-domestic-ship.cost-fee,margin=profit===null?null:profit/(sales+customer);
  return {items,sales,cost,domestic,weight,ship,customer,fee,profit,margin};
}
function exportPricingResults(){
  if(typeof XLSX==='undefined')return toast('Excel 匯出元件尚未載入');
  const list=pricingRows(),target=pricingTargetRate(),adjusted=pricingAdjustedOverall(list);
  const margins=list.map(r=>r.currentMargin).filter(Number.isFinite),avg=margins.length?margins.reduce((a,b)=>a+b,0)/margins.length:null;
  const filterSummary=Object.entries(pricingColumnFilters).filter(([,v])=>Array.isArray(v)&&v.length).map(([k,v])=>`${k}: ${v.join('、')}`).join('；')||'無';
  const sortSummary=pricingSortState.key?`${pricingSortState.key} ${pricingSortState.direction==='asc'?'升冪':'降冪'}`:'無';
  const summaryRows=[
    ['匯出時間',new Date().toLocaleString('zh-TW')],
    ['目標利潤率',target],
    ['此表單免運門檻(TWD)',pricingFreeShipping()],
    ['客收運費/公斤(TWD)',params.customerShippingPerKgTWD],
    ['平台費率',params.platformFeeRate],
    ['搜尋關鍵字',cleanText($('pricingSearch')?.value)],
    ['表頭篩選',filterSummary],
    ['排序',sortSummary],
    ['目前篩選商品數',list.length],
    ['目前平均利潤率',avg??''],
    ['參數調整後整體利潤率',adjusted.margin??'']
  ];
  const singleRows=list.map(r=>({
    '商品規格管理編號':r.p.specManagementId||'',
    '商品管理編號':r.p.productManagementId||'',
    '商品標題':r.p.title||'',
    '日幣售價(JPY)':n(r.p.priceJPY),
    '重量(g)':n(r.p.weightG),
    '物流':r.ship.method||'',
    '單件物流成本(TWD)':r.ship.cost===null?'超過級距':n(r.ship.cost),
    '目前售價客收運費(TWD)':n(r.currentCustomer),
    '目前售價(TWD)':n(r.current),
    '目前售價利潤率':r.currentMargin??'',
    '目標利潤率':target,
    '目標利潤建議售價(TWD)':r.suggested??'',
    '建議售價客收運費(TWD)':r.suggested===null?'':pricingCustomerShipping(r.p.weightG,r.suggested),
    '調整金額(TWD)':r.diff??''
  }));
  const cart=pricingCartSummaryData();
  const multiRows=cart?cart.items.map(x=>({
    '商品規格管理編號':x.p.specManagementId||'',
    '商品管理編號':x.p.productManagementId||'',
    '商品標題':x.p.title||'',
    '單價(TWD)':x.price,
    '重量(g)':n(x.p.weightG),
    '數量':x.qty,
    '小計(TWD)':x.subtotal,
    '商品成本(TWD)':x.itemCost,
    '日本國內運費(TWD)':x.itemDomestic
  })):[{'說明':'尚未加入多件訂單試算商品'}];
  const multiSummary=cart?[
    ['商品總額(TWD)',cart.sales],['總重量(g)',cart.weight],['物流方式',cart.ship.method],['實際物流(TWD)',cart.ship.cost??'超過級距'],
    ['客收運費(TWD)',cart.customer],['商品成本(TWD)',cart.cost],['日本國內運費(TWD)',cart.domestic],['平台費(TWD)',cart.fee],
    ['預估淨利(TWD)',cart.profit??''],['訂單利潤率',cart.margin??''],['系統正式免運門檻(TWD)',params.freeShippingTWD]
  ]:[['說明','尚未加入多件訂單試算商品']];
  const wb=XLSX.utils.book_new();
  const summarySheet=XLSX.utils.aoa_to_sheet([['定價試算摘要',''],...summaryRows]);
  const singleSheet=XLSX.utils.json_to_sheet(singleRows.length?singleRows:[{'說明':'目前篩選沒有商品'}]);
  const multiSheet=XLSX.utils.json_to_sheet(multiRows);
  const multiSummarySheet=XLSX.utils.aoa_to_sheet([['多件訂單試算摘要',''],...multiSummary]);
  // 套用百分比格式，Excel 開啟後可直接閱讀與再計算。
  for(const [sheet,labels] of [[summarySheet,['目標利潤率','平台費率','目前平均利潤率','參數調整後整體利潤率']],[multiSummarySheet,['訂單利潤率']]]){
    const range=XLSX.utils.decode_range(sheet['!ref']||'A1:A1');
    for(let R=range.s.r;R<=range.e.r;R++){
      const a=sheet[XLSX.utils.encode_cell({r:R,c:0})],b=sheet[XLSX.utils.encode_cell({r:R,c:1})];
      if(a&&b&&labels.includes(String(a.v))&&typeof b.v==='number')b.z='0.0%';
    }
  }
  if(singleSheet['!ref']){
    const range=XLSX.utils.decode_range(singleSheet['!ref']);
    const header={};for(let C=range.s.c;C<=range.e.c;C++){const cell=singleSheet[XLSX.utils.encode_cell({r:0,c:C})];if(cell)header[String(cell.v)]=C}
    for(const label of ['目前售價利潤率','目標利潤率']){const C=header[label];if(C===undefined)continue;for(let R=1;R<=range.e.r;R++){const cell=singleSheet[XLSX.utils.encode_cell({r:R,c:C})];if(cell&&typeof cell.v==='number')cell.z='0.0%'}}
  }
  XLSX.utils.book_append_sheet(wb,summarySheet,'試算摘要');
  XLSX.utils.book_append_sheet(wb,singleSheet,'單件重新定價');
  XLSX.utils.book_append_sheet(wb,multiSheet,'多件訂單明細');
  XLSX.utils.book_append_sheet(wb,multiSummarySheet,'多件訂單摘要');
  XLSX.writeFile(wb,`定價試算_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast(`已下載定價試算：單件 ${list.length} 筆${cart?`、多件 ${cart.items.length} 項`:''}`);
}
function renderPricingHeaderState(){document.querySelectorAll('[data-pricing-filter-menu]').forEach(btn=>{const key=btn.dataset.pricingFilterMenu,active=pricingSortState.key===key,filtered=Array.isArray(pricingColumnFilters[key])&&pricingColumnFilters[key].length;btn.classList.toggle('active',active||filtered);btn.textContent=active?(pricingSortState.direction==='asc'?'▲':'▼'):'▼'})}
function renderPricingPage(){
  if(!$('pricingTableBody'))return;const target=pricingTargetRate(),list=pricingRows();
  const margins=list.map(r=>r.currentMargin).filter(Number.isFinite),avg=margins.length?margins.reduce((a,b)=>a+b,0)/margins.length:null,adjusted=pricingAdjustedOverall(list);
  if($('pricingAvgCurrentMargin'))$('pricingAvgCurrentMargin').textContent=avg===null?'—':(avg*100).toFixed(1)+'%';
  if($('pricingAdjustedOverallMargin'))$('pricingAdjustedOverallMargin').textContent=adjusted.margin===null?'—':(adjusted.margin*100).toFixed(1)+'%';
  if($('pricingAdjustedOverallNote'))$('pricingAdjustedOverallNote').textContent=`依建議售價、目前篩選 ${adjusted.count} 項商品各 1 件彙總｜免運門檻 ${formatInteger(pricingFreeShipping())} 元`;
  if($('pricingVisibleCount'))$('pricingVisibleCount').textContent=formatInteger(list.length);
  if($('pricingAvgCurrentNote'))$('pricingAvgCurrentNote').textContent=`依目前售價與目前篩選商品的單品利潤率取平均｜此表單免運門檻 ${formatInteger(pricingFreeShipping())} 元`;
  $('pricingTableBody').innerHTML=list.map(r=>{const {p,ship,suggested,current,currentCustomer,currentMargin,diff}=r;return `<tr><td>${esc(p.specManagementId||'')}</td><td>${esc(shortTitle(p.title||''))}</td><td>${formatInteger(p.priceJPY)}</td><td>${formatInteger(p.weightG)}</td><td>${esc(ship.method)}</td><td>${ship.cost===null?'超過級距':formatInteger(ship.cost)}</td><td>${formatInteger(currentCustomer)}</td><td>${formatInteger(current)}</td><td>${currentMargin===null?'—':(currentMargin*100).toFixed(1)+'%'}</td><td><strong>${suggested===null?'—':formatInteger(suggested)}</strong><small class="muted"> ${(target*100).toFixed(1)}%</small></td><td>${suggested===null?'—':(diff>0?'↑ +':diff<0?'↓ ':'')+formatInteger(diff)}</td></tr>`}).join('')||'<tr><td colspan="11" class="muted">沒有符合商品</td></tr>';
  renderPricingHeaderState();renderPricingCart();
}
function renderPricingCart(){if(!$('pricingCartBody'))return;$('pricingCartBody').innerHTML=pricingCart.map((x,i)=>{const p=products.find(y=>y.id===x.id);if(!p)return'';const price=n(p.manualPriceTWD)||n(pricingSuggested(p,pricingTargetRate()));return `<tr><td>${esc(p.specManagementId||p.title||'')}</td><td>${formatInteger(price)}</td><td>${formatInteger(p.weightG)}</td><td>${x.qty}</td><td>${formatInteger(price*x.qty)}</td><td><button type="button" class="secondary" data-pricing-remove="${i}">移除</button></td></tr>`}).join('')||'<tr><td colspan="6" class="muted">尚未加入商品</td></tr>';renderPricingSummary()}
function renderPricingSummary(){if(!$('pricingSummary'))return;const x=pricingCartSummaryData();if(!x){$('pricingSummary').textContent='請先加入商品。';return}const {sales,weight,ship,customer,profit,margin}=x;$('pricingSummary').innerHTML=`<div class="overview-kpis"><article class="card stat"><span>商品總額</span><strong>${formatInteger(sales)}</strong></article><article class="card stat"><span>總重量</span><strong>${formatInteger(weight)}g</strong></article><article class="card stat"><span>實際物流</span><strong>${ship.cost===null?'超過級距':formatInteger(ship.cost)}</strong><small>${esc(ship.method)}</small></article><article class="card stat"><span>客收運費</span><strong>${formatInteger(customer)}</strong></article><article class="card stat"><span>預估淨利</span><strong>${profit===null?'—':formatInteger(profit)}</strong></article><article class="card stat"><span>訂單利潤率</span><strong>${margin===null?'—':(margin*100).toFixed(1)+'%'}</strong><small>${margin===null?'':margin>=params.targetProfitRate?'✓ 達標':'⚠ 低於目標'}</small></article></div>`}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('loginEmail').value,$('loginPassword').value)}catch(err){$('loginError').textContent='登入失敗：'+err.message}});
$('logoutBtn').onclick=()=>signOut(auth);$('searchInput').oninput=()=>{page=1;renderAll()};$('statusFilter').onchange=()=>{page=1;renderAll()};$('prevPage').onclick=()=>{page--;renderTable()};$('nextPage').onclick=()=>{page++;renderTable()};
$('tableHead').addEventListener('click',e=>{const btn=e.target.closest('[data-filter-menu]');if(!btn)return;e.stopPropagation();openFilterMenu(btn.dataset.filterMenu,btn)});
document.addEventListener('click',e=>{const panel=e.target.closest('#excelFilterMenu');if(!panel){closeFilterMenu();return}e.stopPropagation();const key=activeFilterKey;if(e.target.closest('[data-menu-sort]')){sortState={key,direction:e.target.closest('[data-menu-sort]').dataset.menuSort};page=1;renderAll();closeFilterMenu();return}if(e.target.closest('[data-menu-clear-sort]')){if(sortState.key===key)sortState={key:'',direction:'asc'};renderAll();closeFilterMenu();return}if(e.target.matches('[data-menu-all]')){panel.querySelectorAll('[data-menu-value]').forEach(x=>x.checked=e.target.checked);return}if(e.target.closest('[data-menu-clear]')){delete columnFilters[key];page=1;renderAll();closeFilterMenu();return}if(e.target.closest('[data-menu-apply]')){const selected=[...panel.querySelectorAll('[data-menu-value]:checked')].map(x=>x.value),allCount=panel.querySelectorAll('[data-menu-value]').length,next={selected:selected.length===allCount?[]:selected};const min=panel.querySelector('[data-menu-min]'),max=panel.querySelector('[data-menu-max]'),search=panel.querySelector('[data-menu-search]');if(min)next.min=min.value;if(max)next.max=max.value;if(search)next.text=search.value;columnFilters[key]=next;page=1;renderAll();closeFilterMenu()}});
document.addEventListener('input',e=>{if(!e.target.matches('#excelFilterMenu [data-menu-search]'))return;const q=e.target.value.toLowerCase();e.target.closest('#excelFilterMenu').querySelectorAll('[data-value-label]').forEach(label=>label.classList.toggle('hidden',!label.dataset.valueLabel.includes(q)))});
$('clearColumnFiltersBtn').onclick=()=>{columnFilters={};sortState={key:'',direction:'asc'};page=1;renderAll()};function initSalesFilterDates(){const dates=salesHistory.map(r=>cleanText(r.date)).filter(Boolean).sort();if(dates.length&&!$('salesFilterStart')?.value&&!$('salesFilterEnd')?.value){$('salesFilterStart').value=dates[0];$('salesFilterEnd').value=dates[dates.length-1]}}if($('salesFilterStart'))$('salesFilterStart').onchange=()=>{page=1;renderAll()};if($('salesFilterEnd'))$('salesFilterEnd').onchange=()=>{page=1;renderAll()};

for(const id of ['crossStart','crossEnd','crossPlatformFilter'])if($(id))$(id).onchange=renderCrossPlatform;
for(const id of ['platformStart','platformEnd','platformFilter'])if($(id))$(id).onchange=renderPlatformCompare;
document.addEventListener('change',e=>{if(e.target.matches('[data-cross-sort]')&&e.target.value){crossSort={key:e.target.dataset.crossSort,direction:e.target.value};renderCrossPlatform()}if(e.target.matches('[data-platform-sort]')&&e.target.value){platformSort={key:e.target.dataset.platformSort,direction:e.target.value};renderPlatformCompare()}});

$('productTabBtn').onclick=()=>setView('products');if($('pricingTabBtn'))$('pricingTabBtn').onclick=()=>setView('pricing');if($('pricingSearch'))$('pricingSearch').oninput=renderPricingPage;if($('pricingTargetRate'))$('pricingTargetRate').oninput=()=>{renderPricingPage();renderPricingCart()};if($('pricingFreeShippingTWD'))$('pricingFreeShippingTWD').oninput=renderPricingPage;if($('pricingExportBtn'))$('pricingExportBtn').onclick=exportPricingResults;document.querySelectorAll('[data-pricing-filter-menu]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openPricingFilterMenu(btn.dataset.pricingFilterMenu,btn)});document.addEventListener('input',e=>{if(!e.target.matches('[data-pricing-menu-search]'))return;const panel=e.target.closest('#pricingExcelFilterMenu'),q=cleanText(e.target.value).toLowerCase();panel?.querySelectorAll('[data-pricing-value-label]').forEach(label=>label.classList.toggle('hidden',q&&!label.dataset.pricingValueLabel.includes(q)))});document.addEventListener('click',e=>{const panel=e.target.closest('#pricingExcelFilterMenu');if(!panel){if(!e.target.closest('[data-pricing-filter-menu]'))closePricingFilterMenu();return}e.stopPropagation();const key=activePricingFilterKey;if(e.target.closest('[data-pricing-menu-sort]')){pricingSortState={key,direction:e.target.closest('[data-pricing-menu-sort]').dataset.pricingMenuSort};renderPricingPage();closePricingFilterMenu();return}if(e.target.closest('[data-pricing-menu-clear-sort]')){if(pricingSortState.key===key)pricingSortState={key:'',direction:'asc'};renderPricingPage();closePricingFilterMenu();return}if(e.target.matches('[data-pricing-menu-all]')){panel.querySelectorAll('[data-pricing-menu-value]').forEach(x=>x.checked=e.target.checked);return}if(e.target.closest('[data-pricing-menu-clear]')){delete pricingColumnFilters[key];renderPricingPage();closePricingFilterMenu();return}if(e.target.closest('[data-pricing-menu-apply]')){const all=[...panel.querySelectorAll('[data-pricing-menu-value]')],selected=all.filter(x=>x.checked).map(x=>x.value);pricingColumnFilters[key]=selected.length===all.length?[]:selected;renderPricingPage();closePricingFilterMenu();return}});if($('pricingAddBtn'))$('pricingAddBtn').onclick=()=>{const spec=cleanText($('pricingSpecInput')?.value),qty=Math.max(1,Math.floor(n($('pricingQty').value)||1));if(!spec){if($('pricingAddMsg'))$('pricingAddMsg').textContent='請輸入商品規格管理編號';return}const p=products.find(x=>cleanText(x.specManagementId).toLowerCase()===spec.toLowerCase());if(!p){if($('pricingAddMsg'))$('pricingAddMsg').textContent='找不到此商品規格管理編號';return}const old=pricingCart.find(x=>x.id===p.id);if(old)old.qty+=qty;else pricingCart.push({id:p.id,qty});if($('pricingAddMsg'))$('pricingAddMsg').textContent=`已加入：${p.specManagementId||''} ${shortTitle(p.title||'')}`;if($('pricingSpecInput'))$('pricingSpecInput').value='';renderPricingCart()};if($('pricingClearBtn'))$('pricingClearBtn').onclick=()=>{pricingCart=[];renderPricingCart()};if($('pricingCartBody'))$('pricingCartBody').onclick=e=>{const i=e.target.dataset.pricingRemove;if(i===undefined)return;pricingCart.splice(Number(i),1);renderPricingCart()};if($('importTabBtn'))$('importTabBtn').onclick=()=>setView('imports');$('salesTabBtn').onclick=()=>{initSalesFilterDates();setView('sales')};$('overviewTabBtn').onclick=()=>{initOverviewDates();setView('overview')};$('crossPlatformTabBtn').onclick=()=>{initOverviewDates();setView('crossPlatform')};$('platformCompareTabBtn').onclick=()=>{initOverviewDates();setView('platformCompare')};$('applyOverviewBtn').onclick=renderOverview;$('overviewStart').onchange=renderOverview;$('overviewEnd').onchange=renderOverview;$('overviewPlatform').onchange=renderOverview;$('rankingSort').onchange=renderOverview;$('resetOverviewBtn').onclick=()=>{$('overviewStart').value='';$('overviewEnd').value='';$('overviewPlatform').value='all';renderOverview()};$('selectFilteredBtn').onclick=()=>{filtered().forEach(p=>selectedProductIds.add(p.id));renderTable();updateSelectionCount();toast('已選取全部篩選結果')};$('clearSelectionBtn').onclick=()=>{selectedProductIds.clear();renderTable();updateSelectionCount()};$('discountCalcBtn').onclick=openDiscountDialog;$('recalcDiscountBtn').onclick=renderDiscountResults;$('discountPercent').oninput=renderDiscountResults;$('exportDiscountBtn').onclick=exportDiscountResults;
$('addProductBtn').onclick=()=>{renderProductForm({active:true});$('productDialog').showModal()};$('productForm').addEventListener('submit',async e=>{e.preventDefault();await saveProduct(e.currentTarget)});
$('productFields').addEventListener('input',e=>{const el=e.target.closest('[data-field-key]');if(!el||el.readOnly)return;const k=el.dataset.fieldKey;if(el.dataset.fieldMode==='calculated')productFormManualOverrides.add(k);if(k==='priceJPY'){['productCostTWD','suggestedPrice30TWD','customerShippingTWD','grossReceivedTWD','platformFeeTWD','profitTWD','profitRate'].forEach(x=>productFormManualOverrides.delete(x))}if(k==='domesticShippingTWD'){['suggestedPrice30TWD','customerShippingTWD','grossReceivedTWD','platformFeeTWD','profitTWD','profitRate'].forEach(x=>productFormManualOverrides.delete(x))}updateProductFormCalculatedFields(k)});
$('productFields').addEventListener('change',e=>{const el=e.target.closest('[data-field-key]');if(!el||el.readOnly)return;const k=el.dataset.fieldKey;if(el.dataset.fieldMode==='calculated')productFormManualOverrides.add(k);if(k==='priceJPY'){['productCostTWD','suggestedPrice30TWD','customerShippingTWD','grossReceivedTWD','platformFeeTWD','profitTWD','profitRate'].forEach(x=>productFormManualOverrides.delete(x))}if(k==='domesticShippingTWD'){['suggestedPrice30TWD','customerShippingTWD','grossReceivedTWD','platformFeeTWD','profitTWD','profitRate'].forEach(x=>productFormManualOverrides.delete(x))}updateProductFormCalculatedFields(k)});
$('productFields').addEventListener('click',e=>{const k=e.target.dataset.reset;if(!k)return;productFormManualOverrides.delete(k);updateProductFormCalculatedFields()});
$('tableBody').addEventListener('change',e=>{const id=e.target.dataset.selectProduct;if(!id)return;e.target.checked?selectedProductIds.add(id):selectedProductIds.delete(id);updateSelectionCount()});
$('tableHead').addEventListener('change',e=>{if(e.target.id!=='selectPageCheckbox')return;const list=filtered().slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);list.forEach(p=>e.target.checked?selectedProductIds.add(p.id):selectedProductIds.delete(p.id));renderTable();updateSelectionCount()});
$('tableBody').addEventListener('click',async e=>{const id=e.target.dataset.edit||e.target.dataset.delete;if(!id)return;if(e.target.dataset.edit){renderProductForm(products.find(p=>p.id===id));$('productDialog').showModal()}else if(confirm('確定刪除此商品？')){await deleteDoc(doc(db,'products',id));await loadAll();toast('已刪除')}});
$('openParamsBtn').onclick=()=>$('paramsDialog').showModal();$('paramsForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),next={};PARAM_DEFS.forEach(([k])=>next[k]=Number(fd.get(k)));next.tiers=params.tiers.map((_,i)=>[Number(fd.get(`tierMax_${i}`)),Number(fd.get(`tierFee_${i}`))]).sort((a,b)=>a[0]-b[0]);await setDoc(doc(db,'settings','params'),{...next,updatedAt:serverTimestamp()});params={...params,...next};$('paramsDialog').close();await loadAll();toast('參數已更新')});
$('columnBtn').onclick=()=>{renderColumns();$('columnsDialog').showModal()};$('columnOptions').addEventListener('change',()=>{const next=[...$('columnOptions').querySelectorAll('input:checked')].map(x=>x.value);if(currentView==='crossPlatform'){crossVisibleColumns=next;localStorage.setItem('crossVisibleColumns',JSON.stringify(crossVisibleColumns));renderCrossPlatform()}else if(currentView==='sales'){salesVisibleColumns=next;localStorage.setItem('salesVisibleColumns',JSON.stringify(salesVisibleColumns));renderTable()}else{visibleColumns=next;localStorage.setItem('visibleColumns',JSON.stringify(visibleColumns));renderTable()}});$('selectDefaultColumns').onclick=()=>{if(currentView==='crossPlatform'){crossVisibleColumns=CROSS_COLUMN_DEFS.map(x=>x[0]);localStorage.setItem('crossVisibleColumns',JSON.stringify(crossVisibleColumns));renderColumns();renderCrossPlatform()}else if(currentView==='sales'){salesVisibleColumns=[...SALES_COLUMNS];localStorage.setItem('salesVisibleColumns',JSON.stringify(salesVisibleColumns));renderColumns();renderTable()}else{visibleColumns=[...DEFAULT_COLUMNS];localStorage.setItem('visibleColumns',JSON.stringify(visibleColumns));renderColumns();renderTable()}};
$('importBtn').onclick=importExcel;$('exportBtn').onclick=()=>currentView==='pricing'?exportPricingResults():exportProducts();
$('storeManagerBtn').onclick=()=>{renderStores();$('storesDialog').showModal()};$('storeSearch').oninput=renderStores;$('addStoreBtn').onclick=()=>openStoreForm();$('storeForm').addEventListener('submit',async e=>{e.preventDefault();await saveStore(e.currentTarget)});$('storeImportBtn').onclick=importStores;$('resyncStoresBtn').onclick=resyncProducts;
$('storeTableBody').addEventListener('click',async e=>{const edit=e.target.dataset.storeEdit,del=e.target.dataset.storeDelete;if(edit)openStoreForm(stores.find(s=>s.id===edit));if(del&&confirm('確定刪除此店鋪？未指定店鋪的商品將改用預設運費。')){await deleteDoc(doc(db,'stores',del));await loadAll();renderStores();toast('店鋪已刪除')}});
$('maintenanceBtn').onclick=async()=>{$('maintenanceDialog').showModal();await refreshMaintenance()};$('deleteSelectedBtn').onclick=deleteSelectedCollections;$('clearAllBtn').onclick=clearImportedData;$('rebuildIndexBtn').onclick=rebuildProductIndex;$('recalcDashboardBtn').onclick=recalcDashboard;$('healthCheckBtn').onclick=()=>runHealthCheck(true);$('resyncMaintenanceBtn').onclick=resyncProducts;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
onAuthStateChanged(auth,async user=>{if(user){$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');$('userEmail').textContent=user.email;await loadAll()}else{$('appView').classList.add('hidden');$('loginView').classList.remove('hidden')}});

$('importRakutenProductMetricsBtn')?.addEventListener('click',handleRakutenProductMetricsImport);

$('importRakutenWholeShopTrafficBtn')?.addEventListener('click',handleRakutenWholeShopTrafficImport);

window.addEventListener('error',e=>console.error('Global error:',e.error||e.message));
window.addEventListener('unhandledrejection',e=>console.error('Unhandled promise rejection:',e.reason));
