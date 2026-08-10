
function truncateProductName(name){
  if(!name) return '';
  const s=String(name);
  return s.length>15 ? s.substring(0,15)+'...' : s;
}

import {firebaseConfig} from './firebase-config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,sendPasswordResetEmail,signOut} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,query,where,writeBatch,serverTimestamp,Timestamp,orderBy,limit} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

// V11.4.4 compatibility guard:
// Some older deployed builds referenced renderParams during post-import rendering.
// Keep a harmless callable/object fallback so a stale code path cannot abort a completed import.
function renderParams(){ return {}; }

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const state={user:null,role:'viewer',sales:[],compare:[],products:new Map(),productsByManagement:new Map(),platforms:new Set(),ads:[],productAnalytics:[],overviewAds:[],overviewAnalytics:[],adsLoaded:false,productAnalyticsLoaded:false,charts:{}};
const HIDE_PROJECTS=new Set(['GOOD LIFE','Taiwan Pavilion','未設定專案']);
const isHiddenProject=value=>HIDE_PROJECTS.has(String(value||'').trim());
const titles={overview:'營運總覽',platforms:'平台比較',products:'商品跨平台',groups:'專案分析',ads:'樂天廣告分析',productAnalysis:'商品分析',master:'商品主檔',import:'資料匯入',history:'匯入紀錄',maintenance:'系統維護'};

const salesImportProfiles={
  rakuten:{orderId:['注文番号'],date:['注文日'],productId:['商品番号'],managementNumber:['商品管理番号'],quantity:['個数','数量'],unitPrice:['単価','商品単価'],itemTotal:['商品合計金額'],shippingTotal:['送料合計'],coupon:['店舗発行クーポン利用額'],status:['ステータス'],cancelled:['900']},
  shopify:{orderId:['Name'],date:['Created at'],productId:['Lineitem sku'],managementNumber:['Variant SKU','商品管理番号'],quantity:['Lineitem quantity'],unitPrice:['Lineitem price'],revenue:['Total'],status:['Financial Status'],cancelled:['refunded']}
};

document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>show(b.dataset.page));
function show(id){document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===id));document.querySelectorAll('.page').forEach(s=>s.classList.toggle('active',s.id===id));$('title').textContent=titles[id]||'';if(id==='history')loadHistory();if(id==='ads')loadAds();if(id==='productAnalysis')loadProductAnalytics();if(id==='maintenance')loadMaintenance()}
$('loginBtn').onclick=async()=>{try{$('loginMsg').textContent='登入中…';await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(e){$('loginMsg').textContent=e.code?.includes('invalid-credential')?'Email 或密碼不正確':e.message}};
$('resetBtn').onclick=async()=>{const e=$('email').value.trim();if(!e)return $('loginMsg').textContent='請先輸入 Email';try{await sendPasswordResetEmail(auth,e);$('loginMsg').textContent='重設密碼信已寄出'}catch(x){$('loginMsg').textContent=x.message}};
$('logoutBtn').onclick=()=>signOut(auth);$('refreshBtn').onclick=()=>{syncAnalysisMonthRange();loadReports()};$('applyBtn').onclick=()=>{syncAnalysisMonthRange();loadReports()};$('granularity').onchange=()=>renderTrend();$('printBtn').onclick=()=>window.print();$('exportCsvBtn').onclick=()=>exportCurrentPage('csv');$('exportExcelBtn').onclick=()=>exportCurrentPage('xlsx');$('productSearch').oninput=renderProducts;$('productProjectFilter').onchange=renderProducts;$('groupSearch').oninput=renderGroups;$('masterSearch').oninput=renderMaster;
['adMonthStart','adMonthEnd','adProjectFilter','adSearch','adSort','adOrder'].forEach(id=>$(id).addEventListener(id==='adSearch'?'input':'change',renderAds));
['paMonthStart','paMonthEnd','paProjectFilter','paSearch','paSort','paOrder'].forEach(id=>$(id).addEventListener(id==='paSearch'?'input':'change',renderProductAnalytics));
$('refreshMaintenanceBtn').onclick=loadMaintenance;$('healthCheckBtn').onclick=runHealthCheck;$('deleteSelectedBtn').onclick=deleteSelectedData;$('resetAllBtn').onclick=resetAllImportedData;$('rebuildIndexBtn').onclick=rebuildProductIndexes;$('recalculateBtn').onclick=recalculateDashboard;

onAuthStateChanged(auth,async user=>{$('loading').classList.add('hidden');if(!user){$('login').classList.remove('hidden');$('app').classList.add('hidden');return}state.user=user;await ensureUser();await loadRole();applyRole();$('userText').textContent=user.email||'';$('roleText').textContent='角色：'+state.role;$('login').classList.add('hidden');$('app').classList.remove('hidden');setDates();setMonthInputs();setupTableFilters();await loadProductMaster();await loadPlatforms();await loadReports()});
async function ensureUser(){const r=doc(db,'users',state.user.uid),s=await getDoc(r);if(!s.exists())await setDoc(r,{email:state.user.email||'',role:'viewer',createdAt:serverTimestamp(),lastLogin:serverTimestamp()});else await setDoc(r,{lastLogin:serverTimestamp()},{merge:true})}
async function loadRole(){const s=await getDoc(doc(db,'users',state.user.uid));state.role=s.exists()?(s.data().role||'viewer'):'viewer'}
function applyRole(){const edit=['admin','manager'].includes(state.role);document.querySelectorAll('.editor').forEach(x=>x.classList.toggle('hidden',!edit));$('viewerNotice').classList.toggle('hidden',edit)}
function setDates(){const n=new Date(),s=new Date(n.getFullYear(),n.getMonth(),1);$('start').value=fd(s);$('end').value=fd(n)}
function setMonthInputs(){const n=new Date(),m=monthFromDate(n);if($('paImportMonth'))$('paImportMonth').value=m;syncAnalysisMonthRange()}
function syncAnalysisMonthRange(){const start=String($('start')?.value||'').slice(0,7),end=String($('end')?.value||'').slice(0,7);[['adMonthStart','adMonthEnd'],['paMonthStart','paMonthEnd']].forEach(([a,b])=>{if($(a)&&start)$(a).value=start;if($(b)&&end)$(b).value=end});if(state.adsLoaded)renderAds();if(state.productAnalyticsLoaded)renderProductAnalytics()}
function inMonthRange(month,start,end){const m=String(month||'');return(!start||m>=start)&&(!end||m<=end)}function fd(d){return d.toISOString().slice(0,10)}
async function loadProductMaster(){const s=await getDocs(collection(db,'products'));const rows=s.docs.map(d=>({id:d.id,...d.data()}));state.products=new Map(rows.map(x=>[String(x.id),x]));state.productsByManagement=new Map();rows.forEach(x=>{const k=String(x.managementNumber||'').trim();if(!k)return;if(!state.productsByManagement.has(k))state.productsByManagement.set(k,[]);state.productsByManagement.get(k).push(x)});renderMaster();fillAdProjectFilter();fillProductProjectFilter()}
function normKey(value){return String(value||'').replace(/^\ufeff/,'').trim().toLowerCase()}
function findProduct(productNumber){const raw=String(productNumber||'').trim(),direct=state.products.get(raw);if(direct)return direct;const key=normKey(raw);return [...state.products.values()].find(x=>normKey(x.id)===key)||null}
function findProductsByManagementNumber(value){const raw=String(value||'').trim(),direct=state.productsByManagement.get(raw);if(direct?.length)return direct;const key=normKey(raw);if(!key)return[];return [...state.products.values()].filter(x=>normKey(x.managementNumber)===key||normKey(x.id).startsWith(key+'type-')||normKey(x.id).startsWith(key+'-type-'))}
function findProductByManagementNumber(value){return findProductsByManagementNumber(value)[0]||null}
function resolveProductReference(value){const key=String(value||'').trim(),exact=findProduct(key);if(exact)return{product:exact,managementNumber:exact.managementNumber||'',nameZh:exact.nameZh||exact.name||'',projectName:exact.projectName||'',matchedBy:'productNumber'};const matches=findProductsByManagementNumber(key);if(!matches.length)return{product:null,managementNumber:key,nameZh:'',projectName:'',matchedBy:''};const names=[...new Set(matches.map(x=>String(x.nameZh||x.name||'').trim()).filter(Boolean))],projects=[...new Set(matches.map(x=>String(x.projectName||'').trim()).filter(Boolean))];return{product:matches[0],managementNumber:matches[0].managementNumber||key,nameZh:names.join('／'),projectName:projects.join('／'),matchedBy:'managementNumber',matches}}
function resolveAdProductReference(row){const byManagement=resolveProductReference(row?.managementNumber||'');if(byManagement.product)return byManagement;const byProduct=resolveProductReference(row?.productId||'');if(byProduct.product)return byProduct;return{product:null,managementNumber:String(row?.managementNumber||row?.productId||'').trim(),nameZh:'',projectName:'',matchedBy:''}}
function resolveSalesProduct(row){for(const value of [row?.productId,row?.managementNumber]){const ref=resolveProductReference(value);if(ref.product)return ref}return resolveProductReference(row?.productId||row?.managementNumber)}
function resolveProductAnalysisReference(row){const byProduct=resolveProductReference(row?.productId||'');if(byProduct.product)return byProduct;const byManagement=resolveProductReference(row?.managementNumber||'');if(byManagement.product)return byManagement;return resolveProductReference(row?.productId||row?.managementNumber)}
function timestampMs(value){if(!value)return 0;if(typeof value.toMillis==='function')return value.toMillis();if(value.seconds)return value.seconds*1000;const d=new Date(value);return isNaN(d)?0:d.getTime()}
function orderKey(r){return canonicalPlatform(r.platform)+'||'+String(r.orderId||'').trim()}
function canonicalOrderRevenueRows(rows){const grouped=new Map();for(const r of rows){const key=orderKey(r);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r)}const out=[];for(const group of grouped.values()){const latest=Math.max(...group.map(r=>timestampMs(r.updatedAt)),0);const newest=latest?group.filter(r=>Math.abs(timestampMs(r.updatedAt)-latest)<5000):group;const candidates=newest.filter(r=>num(r.revenue)!==0);const chosen=(candidates.sort((a,b)=>timestampMs(b.updatedAt)-timestampMs(a.updatedAt))[0])||newest[0]||group[0];out.push({...chosen,revenue:num(chosen?.revenue)})}return out}
function dedupeSalesRows(rows){const latestByLine=new Map();for(const r of rows){const d=r.saleDate?.toDate?r.saleDate.toDate():new Date(r.saleDate);const key=[orderKey(r),normKey(r.productId),normKey(r.managementNumber),fdLocal(d),num(r.quantity)].join('||'),prev=latestByLine.get(key);if(!prev||timestampMs(r.updatedAt)>=timestampMs(prev.updatedAt))latestByLine.set(key,r)}return [...latestByLine.values()]}
function uniqueOrderRevenue(rows){return sum(canonicalOrderRevenueRows(rows).map(r=>r.revenue))}
function revenueBy(rows,keyFn){const out={};canonicalOrderRevenueRows(rows).forEach(r=>{const k=keyFn(r)||'未設定';out[k]=(out[k]||0)+num(r.revenue)});return out}
async function loadPlatforms(){state.platforms=new Set(['Rakuten','Shopify']);$('platform').innerHTML='<option value="">全部平台</option>'+[...state.platforms].map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
async function loadReports(){const s=$('start').value,e=$('end').value;if(!s||!e)return;await loadOverviewSources();state.sales=await fetchSales(s,e,$('platform').value);if($('compare').value==='none')state.compare=[];else{const [cs,ce]=compareRange(s,e,$('compare').value);state.compare=await fetchSales(cs,ce,$('platform').value)}renderAll()}
async function fetchSales(s,e,p){const qy=query(collection(db,'sales'),where('saleDate','>=',Timestamp.fromDate(new Date(s+'T00:00:00'))),where('saleDate','<=',Timestamp.fromDate(new Date(e+'T23:59:59'))));const snap=await getDocs(qy);return dedupeSalesRows(snap.docs.map(d=>({id:d.id,...d.data(),platform:canonicalPlatform(d.data().platform)})).filter(x=>isSupportedPlatform(x.platform)&&(!p||x.platform===p)))}
function compareRange(s,e,m){const a=new Date(s),b=new Date(e);if(m==='yoy'){a.setFullYear(a.getFullYear()-1);b.setFullYear(b.getFullYear()-1);return[fd(a),fd(b)]}const days=Math.round((b-a)/86400000)+1,ce=new Date(a);ce.setDate(ce.getDate()-1);const cs=new Date(ce);cs.setDate(cs.getDate()-days+1);return[fd(cs),fd(ce)]}
function sum(a){return a.reduce((x,y)=>x+num(y),0)}function summary(r){return{revenue:uniqueOrderRevenue(r),quantity:sum(r.map(x=>x.quantity)),orders:new Set(r.map(x=>canonicalPlatform(x.platform)+'||'+x.orderId)).size,products:new Set(r.map(x=>x.productId)).size}}
function growth(a,b){if(!state.compare.length)return{text:'—',cls:'muted'};if(!b)return{text:a?'無比較基準':'0.0%',cls:'muted'};const p=(a-b)/b*100;return{text:(p>=0?'+':'')+p.toFixed(1)+'%',cls:p>0?'pos':p<0?'neg':'muted'}}
function renderAll(){renderKpis();renderTrend();renderShare();renderOverviewMarketing();renderTrafficTrend();renderTopProducts();renderProjectRanking();renderCalendarHeatmap();renderPlatforms();renderProducts();renderGroups()}
function renderKpis(){const a=summary(state.sales),b=summary(state.compare),cards=[['營收',a.revenue,b.revenue,true,'platforms'],['訂單數',a.orders,b.orders,false,'platforms'],['銷售數量',a.quantity,b.quantity,false,'products'],['商品數',a.products,b.products,false,'products'],['平均客單價',a.orders?a.revenue/a.orders:0,b.orders?b.revenue/b.orders:0,true,'platforms']];$('kpis').innerHTML=cards.map(([n,v,c,m,target])=>{const g=growth(v,c);return`<div class="kpi clickable" data-drill="${target}"><span>${n}</span><strong>${m?yen(v):fmt(v)}</strong><small class="${g.cls}">${g.text}</small></div>`}).join('');$('kpis').querySelectorAll('[data-drill]').forEach(x=>x.onclick=()=>show(x.dataset.drill))}
function by(rows,key,val){const o={};rows.forEach(r=>{const k=key(r)||'未設定';o[k]=(o[k]||0)+num(val(r))});return o}
function periodKey(row,granularity){const d=row.saleDate?.toDate?row.saleDate.toDate():new Date(row.saleDate);if(granularity==='year')return String(d.getFullYear());if(granularity==='quarter')return 'Q'+(Math.floor(d.getMonth()/3)+1);return String(d.getMonth()+1)+'月'}
function periodLabelForSeries(rows,fallback){if(!rows.length)return fallback;const years=[...new Set(rows.map(r=>{const d=r.saleDate?.toDate?r.saleDate.toDate():new Date(r.saleDate);return d.getFullYear()}))];return years.length===1?String(years[0]):fallback}
function orderedPeriods(granularity,current,compare){if(granularity==='year')return [...new Set([...Object.keys(current),...Object.keys(compare)])].sort();if(granularity==='quarter')return ['Q1','Q2','Q3','Q4'].filter(k=>current[k]!==undefined||compare[k]!==undefined);return Array.from({length:12},(_,i)=>(i+1)+'月').filter(k=>current[k]!==undefined||compare[k]!==undefined)}
function renderTrend(){const granularity=$('granularity')?.value||'month',a=revenueBy(state.sales,r=>periodKey(r,granularity)),b=revenueBy(state.compare,r=>periodKey(r,granularity)),labels=orderedPeriods(granularity,a,b),currentLabel=periodLabelForSeries(state.sales,'本期'),compareLabel=periodLabelForSeries(state.compare,'比較期');chart('trend','line',labels,[{label:currentLabel,data:labels.map(x=>a[x]??null),spanGaps:true},{label:compareLabel,data:labels.map(x=>b[x]??null),spanGaps:true}],{plugins:{tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}：${yen(ctx.raw)}`}}},scales:{y:{beginAtZero:true}}})}
function renderShare(){const g=Object.entries(revenueBy(state.sales,r=>r.platform)).sort((a,b)=>b[1]-a[1]);chart('share','doughnut',g.map(x=>x[0]),[{label:'營收',data:g.map(x=>x[1])}])}
async function loadOverviewSources(){const months=[...selectedMonths()];state.overviewAds=await fetchByMonths('ads',months);state.overviewAnalytics=await fetchByMonths('productAnalytics',months)}
async function fetchByMonths(collectionName,months){if(!months.length)return[];const rows=[];for(let i=0;i<months.length;i+=30){const snap=await getDocs(query(collection(db,collectionName),where('month','in',months.slice(i,i+30))));rows.push(...snap.docs.map(d=>({id:d.id,...d.data()})))}return rows}
function selectedMonths(){const s=$('start').value,e=$('end').value;if(!s||!e)return new Set();const out=new Set(),d=new Date(s+'T00:00:00'),end=new Date(e+'T00:00:00');d.setDate(1);end.setDate(1);while(d<=end){out.add(monthFromDate(d));d.setMonth(d.getMonth()+1)}return out}
function renderOverviewMarketing(){const months=selectedMonths(),ads=state.overviewAds.filter(x=>months.has(x.month));const adSpend=sum(ads.map(x=>x.adSpend)),adSales=sum(ads.map(x=>x.salesAmount)),roas=adSpend?adSales/adSpend*100:0;const pa=state.overviewAnalytics.filter(x=>months.has(x.month)),traffic=sum(pa.map(x=>x.traffic)),salesOrders=sum(pa.map(x=>x.salesOrders)),conversion=traffic?salesOrders/traffic*100:0;$('overviewMarketingKpis').innerHTML=[['商品頁流量',fmt(traffic)],['廣告費總計',yen(adSpend)],['廣告銷售額',yen(adSales)],['ROAS',pct(roas)],['整體轉換率',pct(conversion)]].map(([n,v])=>`<div class="kpi"><span>${n}</span><strong>${v}</strong></div>`).join('')}
function renderTrafficTrend(){const months=[...selectedMonths()].sort(),paBy=new Map(),adBy=new Map();state.overviewAnalytics.forEach(x=>{if(months.includes(x.month))paBy.set(x.month,(paBy.get(x.month)||0)+num(x.traffic))});state.overviewAds.forEach(x=>{if(months.includes(x.month))adBy.set(x.month,(adBy.get(x.month)||0)+num(x.clicks))});chart('trafficTrend','line',months,[{label:'商品頁流量',data:months.map(m=>paBy.get(m)||0)},{label:'RPP廣告流量',data:months.map(m=>adBy.get(m)||0)},{label:'自然流量',data:months.map(m=>Math.max(0,(paBy.get(m)||0)-(adBy.get(m)||0)))}])}
function renderTopProducts(){const m=new Map(),orderRevenue=new Map(canonicalOrderRevenueRows(state.sales).map(r=>[orderKey(r),num(r.revenue)])),usedOrders=new Set();state.sales.forEach(r=>{const ref=resolveSalesProduct(r),p=ref.product||{},k=p.id||r.productId||r.managementNumber,name=ref.nameZh||p.nameZh||p.name||'未設定';if(!m.has(k))m.set(k,{productId:k,name,revenue:0,quantity:0});const x=m.get(k);x.name=name;x.quantity+=num(r.quantity);const ok=orderKey(r);if(!usedOrders.has(ok)){x.revenue+=orderRevenue.get(ok)||0;usedOrders.add(ok)}});const rows=[...m.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,10);$('topProductRows').innerHTML=rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.productId)}</td><td>${productNameCell(x.name)}</td><td>${yen(x.revenue)}</td><td>${fmt(x.quantity)}</td></tr>`).join('')}
function canonicalPlatform(value){const v=String(value||'').trim(),k=v.toLowerCase();if(k==='rakuten'||k==='taiwan_rakuten')return'Rakuten';if(k==='shopify'||k==='rianyou_shopify')return'Shopify';return v}
function isSupportedPlatform(value){return value==='Rakuten'||value==='Shopify'}

function renderProjectRanking(){const m=new Map();canonicalOrderRevenueRows(state.sales).forEach(r=>{const project=String(resolveSalesProduct(r).projectName||resolveSalesProduct(r).product?.projectName||'').trim();if(!project||isHiddenProject(project))return;m.set(project,(m.get(project)||0)+num(r.revenue))});const rows=[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);chart('projectRanking','bar',rows.map(x=>x[0]),[{label:'營收',data:rows.map(x=>x[1])}],{indexAxis:'y',plugins:{tooltip:{callbacks:{label:ctx=>yen(ctx.raw)}}},scales:{x:{beginAtZero:true}}})}
function renderCalendarHeatmap(){const root=$('calendarHeatmap');if(!root)return;const daily=new Map();canonicalOrderRevenueRows(state.sales).forEach(r=>{const d=r.saleDate?.toDate?r.saleDate.toDate():new Date(r.saleDate),key=fdLocal(d);daily.set(key,(daily.get(key)||0)+num(r.revenue))});const start=new Date($('start').value+'T00:00:00'),end=new Date($('end').value+'T00:00:00');if(isNaN(start)||isNaN(end)){root.innerHTML='';return}const values=[...daily.values()],max=Math.max(...values,0),weekdays=['日','一','二','三','四','五','六'];let html=weekdays.map(x=>`<div class="heat-weekday">${x}</div>`).join('');for(let i=0;i<start.getDay();i++)html+='<div class="heat-empty"></div>';for(const d=new Date(start);d<=end;d.setDate(d.getDate()+1)){const key=fdLocal(d),v=daily.get(key)||0,level=!v?0:Math.min(4,Math.ceil(v/(max||1)*4));html+=`<div class="heat-cell" data-level="${level}" title="${key} ${yen(v)}"><span>${d.getDate()}</span><strong>${v?yen(v):'—'}</strong></div>`}root.innerHTML=html}
function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s}
function normalizeHeader(v){return String(v??'').replace(/^\ufeff/,'').trim()}
function rowToObject(headers,row){const out={};headers.forEach((h,i)=>{const key=normalizeHeader(h);if(key)out[key]=row[i]??''});return out}
async function readCsvText(file){
  const buffer=await file.arrayBuffer();
  const utf8=new TextDecoder('utf-8',{fatal:false}).decode(buffer);
  const bad=(utf8.match(/�/g)||[]).length;
  if(!bad)return utf8.replace(/^﻿/,'');
  try{
    const sjis=new TextDecoder('shift_jis',{fatal:false}).decode(buffer);
    const sjisBad=(sjis.match(/�/g)||[]).length;
    return (sjisBad<bad?sjis:utf8).replace(/^﻿/,'');
  }catch{return utf8.replace(/^﻿/,'')}
}

function updatePaProgress(percent,text){
  const wrap=$('paProgressWrap'),bar=$('paProgressBar'),pct=$('paProgressPercent'),label=$('paProgressText');
  if(!wrap||!bar||!pct||!label)return;
  wrap.classList.remove('hidden');
  const value=Math.max(0,Math.min(100,Math.round(Number(percent)||0)));
  bar.style.width=value+'%';pct.textContent=value+'%';label.textContent=text||'處理中…';
}
function resetPaProgress(){
  const wrap=$('paProgressWrap');
  if(wrap)wrap.classList.remove('hidden');
  if($('paProgressBar'))$('paProgressBar').style.width='0%';
  if($('paProgressPercent'))$('paProgressPercent').textContent='0%';
  if($('paProgressText'))$('paProgressText').textContent='等待選擇商品分析 CSV';
}
function japaneseTextScore(text){
  const s=String(text||'');
  const jp=(s.match(/[ぁ-ゖァ-ヺ一-龯々〆〤]/g)||[]).length;
  const replacement=(s.match(/�/g)||[]).length;
  const mojibake=(s.match(/[ÃÂ縺繧螟荳譁]/g)||[]).length;
  return jp*4-replacement*20-mojibake*2;
}
function decodeJapaneseCsvBuffer(buffer){
  const utf8=new TextDecoder('utf-8',{fatal:false}).decode(buffer);
  let sjis='';
  try{sjis=new TextDecoder('shift_jis',{fatal:false}).decode(buffer)}catch{}
  const chosen=sjis&&japaneseTextScore(sjis)>japaneseTextScore(utf8)?sjis:utf8;
  return chosen.replace(/^\ufeff/,'');
}
function readCsvTextWithProgress(file,onProgress){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onprogress=e=>{
      if(onProgress&&e.lengthComputable){
        const pct=Math.max(1,Math.min(45,Math.round(e.loaded/e.total*45)));
        onProgress(pct,`讀取檔案中… ${formatBytes(e.loaded)} / ${formatBytes(e.total)}`);
      }
    };
    reader.onerror=()=>reject(reader.error||new Error('讀取 CSV 失敗'));
    reader.onload=()=>{
      try{
        const text=decodeJapaneseCsvBuffer(reader.result);
        if(onProgress)onProgress(48,'檔案讀取完成，正在辨識日文編碼與 CSV 結構…');
        resolve(text);
      }catch(e){reject(e)}
    };
    reader.readAsArrayBuffer(file);
  });
}
function formatBytes(bytes){
  const n=Number(bytes)||0;
  if(n<1024)return `${n} B`;
  if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(1)} MB`;
}

async function parseCsvAutoHeader(file,headerCandidates,onProgress){
  const text=await readCsvTextWithProgress(file,onProgress);
  return new Promise((resolve,reject)=>{
    Papa.parse(text,{header:false,skipEmptyLines:'greedy',complete:r=>{
      try{
        if(onProgress)onProgress(58,'CSV 解析完成，偵測表頭中…');
        const errors=r.errors||[];
        const quoteErrors=errors.filter(e=>e.code==='InvalidQuotes'||e.code==='MissingQuotes'||/quote/i.test(String(e.message||'')));
        const fatalErrors=errors.filter(e=>!quoteErrors.includes(e));
        if(fatalErrors.length){
          const e=fatalErrors[0];
          throw new Error(`CSV 解析錯誤：第 ${Number(e.row||0)+1} 列 ${e.message}`);
        }
        const rows=r.data||[],candidates=new Set(headerCandidates.map(normalizeHeader));
        let headerIndex=rows.findIndex(row=>row.some(cell=>candidates.has(normalizeHeader(cell))));
        if(headerIndex<0)headerIndex=0;
        const headers=(rows[headerIndex]||[]).map(normalizeHeader);
        if(onProgress)onProgress(65,`已辨識第 ${headerIndex+1} 列為表頭，整理 ${Math.max(rows.length-headerIndex-1,0)} 列資料中…`);
        const data=rows.slice(headerIndex+1).map(row=>rowToObject(headers,row)).filter(obj=>Object.values(obj).some(v=>String(v??'').trim()!==''));
        resolve({data,headers,headerIndex,sourceRows:rows.length,warningCount:quoteErrors.length});
      }catch(e){reject(e)}
    },error:reject});
  });
}

function parseRakutenDisplayPeriod(value){
  const text=String(value||'').trim();
  const m=text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(?:から|～|〜|-)\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if(!m)return null;
  const start=`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  const end=`${m[4]}-${String(m[5]).padStart(2,'0')}-${String(m[6]).padStart(2,'0')}`;
  return{start,end,month:`${m[1]}-${String(m[2]).padStart(2,'0')}`,label:text};
}
async function parseRakutenProductAnalyticsCsv(file,onProgress){
  const text=await readCsvTextWithProgress(file,onProgress);
  return new Promise((resolve,reject)=>{
    Papa.parse(text,{header:false,skipEmptyLines:false,complete:r=>{
      try{
        if(onProgress)onProgress(56,'CSV 解析完成，正在讀取表示期間…');
        const errors=r.errors||[];
        const quoteErrors=errors.filter(e=>e.code==='InvalidQuotes'||e.code==='MissingQuotes'||/quote/i.test(String(e.message||'')));
        const fatalErrors=errors.filter(e=>!quoteErrors.includes(e));
        if(fatalErrors.length){const e=fatalErrors[0];throw new Error(`CSV 解析錯誤：第 ${Number(e.row||0)+1} 列 ${e.message}`)}
        const rows=r.data||[];
        let period=null,periodRow=-1;
        for(let i=0;i<Math.min(rows.length,20);i++){
          const row=rows[i]||[];
          const labelIndex=row.findIndex(cell=>normalizeHeader(cell)==='表示期間');
          if(labelIndex>=0){
            const candidate=row[labelIndex+1]??row.slice(labelIndex+1).join(' ');
            period=parseRakutenDisplayPeriod(candidate);
            periodRow=i;
            if(period)break;
          }
          const joined=row.map(v=>String(v??'')).join(' ');
          if(joined.includes('表示期間')){
            const m=joined.match(/表示期間\s*[,：:]?\s*(\d{4}年\d{1,2}月\d{1,2}日\s*(?:から|～|〜|-)\s*\d{4}年\d{1,2}月\d{1,2}日)/);
            if(m){period=parseRakutenDisplayPeriod(m[1]);periodRow=i;if(period)break}
          }
        }
        if(!period)throw new Error('找不到「表示期間」日期（例如：2026年08月01日から2026年08月09日）');
        if(onProgress)onProgress(61,`已讀取表示期間：${period.label}，正在辨識表頭…`);
        const required=['商品番号','売上','売上件数','売上個数','アクセス人数','新規購入件数','リピート購入件数','お気に入り登録ユーザ数','お気に入り総ユーザ数'];
        const requiredSet=new Set(required);
        let headerIndex=-1,bestScore=-1;
        rows.forEach((row,i)=>{
          const normalized=(row||[]).map(normalizeHeader);
          const score=normalized.filter(h=>requiredSet.has(h)).length;
          if(score>bestScore){bestScore=score;headerIndex=i}
          if(score===required.length&&headerIndex<0)headerIndex=i;
        });
        if(headerIndex<0||bestScore<6)throw new Error(`無法辨識商品分析表頭；至少需要：${required.join('、')}`);
        const headers=(rows[headerIndex]||[]).map(normalizeHeader);
        const missing=required.filter(h=>!headers.includes(h));
        if(missing.length)throw new Error(`商品分析 CSV 缺少欄位：${missing.join('、')}`);
        if(onProgress)onProgress(68,`已辨識第 ${headerIndex+1} 列為表頭，整理 ${Math.max(rows.length-headerIndex-1,0)} 列資料中…`);
        const data=rows.slice(headerIndex+1).map(row=>rowToObject(headers,row)).filter(obj=>Object.values(obj).some(v=>String(v??'').trim()!==''));
        resolve({data,headers,headerIndex,period,periodRow,sourceRows:rows.length,warningCount:quoteErrors.length});
      }catch(e){reject(e)}
    },error:reject});
  });
}

function getActivePage(){return document.querySelector('.page.active')}
function cleanExportText(value=''){return String(value).replace(/\s+/g,' ').trim()}
function currentReportName(){
  const page=getActivePage();
  const title=cleanExportText($('title')?.textContent||page?.id||'report');
  const suffix=(['overview','platforms','products','groups'].includes(page?.id))?`_${$('start').value||''}_${$('end').value||''}`:'';
  return `${title}${suffix}`.replace(/[\/:*?"<>|]/g,'_');
}
function reportFilterRows(){
  const page=getActivePage(),rows=[['報表名稱',cleanExportText($('title')?.textContent||'')],['匯出時間',new Date().toLocaleString('zh-TW')]];
  if(['overview','platforms','products','groups'].includes(page?.id)){
    rows.push(['平台',$('platform')?.selectedOptions?.[0]?.textContent||'全部平台']);
    rows.push(['開始日期',$('start')?.value||'']);
    rows.push(['結束日期',$('end')?.value||'']);
    rows.push(['比較方式',$('compare')?.selectedOptions?.[0]?.textContent||'']);
  }
  page?.querySelectorAll('.subfilters label').forEach(label=>{
    const input=label.querySelector('input,select');if(!input)return;
    const name=cleanExportText([...label.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(''))||'篩選條件';
    const value=input.tagName==='SELECT'?(input.selectedOptions?.[0]?.textContent||''):input.value;
    if(value)rows.push([name,cleanExportText(value)]);
  });
  return rows;
}
function extractKpiRows(page){
  const rows=[];
  page.querySelectorAll('.kpi').forEach(k=>{
    const name=cleanExportText(k.querySelector('span')?.textContent||'');
    const value=cleanExportText(k.querySelector('strong')?.textContent||'');
    if(name||value)rows.push([name,value]);
  });
  return rows;
}
function extractTableRows(table){
  const headers=[...table.querySelectorAll('thead th')].map(th=>cleanExportText(th.textContent));
  const rows=[...table.tBodies].flatMap(tb=>[...tb.rows].filter(tr=>!tr.hidden).map(tr=>[...tr.cells].map(td=>cleanExportText(td.textContent))));
  return headers.length?[headers,...rows]:rows;
}
function collectCurrentReport(){
  const page=getActivePage();if(!page)throw new Error('找不到目前頁面');
  const sections=[{name:'報表資訊',rows:reportFilterRows()}];
  const kpis=extractKpiRows(page);if(kpis.length)sections.push({name:'KPI摘要',rows:[['指標','數值'],...kpis]});
  page.querySelectorAll('table').forEach((table,i)=>{
    const card=table.closest('.card');
    const title=cleanExportText(card?.querySelector('h3')?.textContent||`資料表${i+1}`);
    const rows=extractTableRows(table);if(rows.length)sections.push({name:title,rows});
  });
  if(page.id==='overview'){
    const raw=[['日期','平台','訂單編號','商品番号','數量','營收']];
    state.sales.slice().sort((a,b)=>{const da=a.saleDate?.toDate?a.saleDate.toDate():new Date(a.saleDate),db=b.saleDate?.toDate?b.saleDate.toDate():new Date(b.saleDate);return da-db}).forEach(r=>{const d=r.saleDate?.toDate?r.saleDate.toDate():new Date(r.saleDate);raw.push([fdLocal(d),r.platform,r.orderId,r.productId,r.quantity,r.revenue])});
    sections.push({name:'銷售明細',rows:raw});
  }
  return sections;
}
function downloadBlob(content,type,fileName){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function safeSheetName(name,index){const clean=String(name||`Sheet${index}`).replace(/[\\/?*\[\]:]/g,'_').slice(0,31);return clean||`Sheet${index}`}
function exportCurrentPage(format){
  try{
    const sections=collectCurrentReport(),base=currentReportName();
    if(format==='csv'){
      const lines=[];sections.forEach((section,i)=>{if(i)lines.push([]);lines.push([section.name]);section.rows.forEach(r=>lines.push(r))});
      downloadBlob('\ufeff'+lines.map(r=>r.map(csvEscape).join(',')).join('\r\n'),'text/csv;charset=utf-8',`${base}.csv`);return;
    }
    if(typeof XLSX==='undefined')throw new Error('Excel 元件尚未載入，請確認網路連線後重新整理');
    const wb=XLSX.utils.book_new();
    sections.forEach((section,i)=>{const ws=XLSX.utils.aoa_to_sheet(section.rows);ws['!cols']=section.rows.reduce((cols,row)=>{row.forEach((v,j)=>{cols[j]=Math.min(45,Math.max(cols[j]||10,String(v??'').length+2))});return cols},[]).map(wch=>({wch}));XLSX.utils.book_append_sheet(wb,ws,safeSheetName(section.name,i+1))});
    XLSX.writeFile(wb,`${base}.xlsx`);
  }catch(e){console.error(e);alert('匯出失敗：'+e.message)}
}
function exportOverviewCsv(){const rows=[['日期','平台','訂單編號','商品番号','數量','營收']];state.sales.slice().sort((a,b)=>{const da=a.saleDate?.toDate?a.saleDate.toDate():new Date(a.saleDate),db=b.saleDate?.toDate?b.saleDate.toDate():new Date(b.saleDate);return da-db}).forEach(r=>{const d=r.saleDate?.toDate?r.saleDate.toDate():new Date(r.saleDate);rows.push([fdLocal(d),r.platform,r.orderId,r.productId,r.quantity,r.revenue])});const blob=new Blob(['\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`dashboard_${$('start').value}_${$('end').value}.csv`;a.click();URL.revokeObjectURL(url)}
function renderPlatforms(){const ks=[...new Set([...state.sales.map(x=>x.platform),...state.compare.map(x=>x.platform)])].filter(Boolean).sort();$('platformRows').innerHTML=ks.map(k=>{const a=summary(state.sales.filter(x=>x.platform===k)),b=summary(state.compare.filter(x=>x.platform===k)),g=growth(a.revenue,b.revenue);return`<tr><td>${esc(k)}</td><td>${yen(a.revenue)}</td><td>${yen(b.revenue)}</td><td>${yen(a.revenue-b.revenue)}</td><td class="${g.cls}">${g.text}</td><td>${fmt(a.quantity)}</td><td>${fmt(a.orders)}</td></tr>`}).join('')}
function fillProductProjectFilter(){if(!$('productProjectFilter'))return;const current=$('productProjectFilter').value;const projects=[...new Set([...state.products.values()].map(p=>String(p.projectName||'').trim()).filter(v=>v&&!isHiddenProject(v)))].sort();$('productProjectFilter').innerHTML='<option value="">全部專案</option>'+projects.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');$('productProjectFilter').value=current}
function renderProducts(){const q=$('productSearch').value.toLowerCase(),projectFilter=$('productProjectFilter').value,m=new Map();state.sales.forEach(r=>{const platform=canonicalPlatform(r.platform),ref=resolveSalesProduct(r)||{},keyProduct=ref.product?.id||r.productId,k=keyProduct+'||'+platform;if(!m.has(k))m.set(k,{...r,productId:keyProduct,platform,revenue:0,quantity:0,cmp:0});const x=m.get(k);x.revenue+=num(r.revenue);x.quantity+=num(r.quantity)});state.compare.forEach(r=>{const platform=canonicalPlatform(r.platform),ref=resolveSalesProduct(r)||{},keyProduct=ref.product?.id||r.productId,k=keyProduct+'||'+platform;if(!m.has(k))m.set(k,{...r,productId:keyProduct,platform,revenue:0,quantity:0,cmp:0});m.get(k).cmp+=num(r.revenue)});const rows=[...m.values()].filter(x=>{const ref=resolveProductReference(x.productId),p=ref.product||{},project=String(ref.projectName||p.projectName||'').trim();return!isHiddenProject(project)&&(!projectFilter||project===projectFilter)&&(!q||(x.productId+' '+(ref.managementNumber||p.managementNumber||'')+' '+(ref.nameZh||p.nameZh||'')+' '+project).toLowerCase().includes(q))}).sort((a,b)=>b.revenue-a.revenue);const totals={revenue:sum(rows.map(x=>x.revenue)),quantity:sum(rows.map(x=>x.quantity))};$('productTotals').innerHTML=[['篩選營收總計',yen(totals.revenue)],['篩選銷量總計',fmt(totals.quantity)],['結果筆數',fmt(rows.length)]].map(([n,v])=>`<div class="kpi"><span>${n}</span><strong>${v}</strong></div>`).join('');$('productRows').innerHTML=rows.slice(0,500).map(x=>{const ref=resolveProductReference(x.productId),p=ref.product||{},g=growth(x.revenue,x.cmp);return`<tr><td>${esc(x.productId)}</td><td>${esc(ref.managementNumber||p.managementNumber||'')}</td><td>${esc(ref.nameZh||p.nameZh||p.name||'未設定')}</td><td>${esc(x.platform)}</td><td>${yen(x.revenue)}</td><td>${yen(x.cmp)}</td><td class="${g.cls}">${g.text}</td><td>${fmt(x.quantity)}</td></tr>`}).join('')}
function renderGroups(){const q=$('groupSearch').value.trim().toLowerCase(),m=new Map();state.sales.forEach(r=>{const k=String(findProduct(r.productId)?.projectName||'').trim();if(!k||isHiddenProject(k))return;if(!m.has(k))m.set(k,{rev:0,cmp:0,qty:0});const x=m.get(k);x.rev+=num(r.revenue);x.qty+=num(r.quantity)});state.compare.forEach(r=>{const k=String(findProduct(r.productId)?.projectName||'').trim();if(!k||isHiddenProject(k))return;if(!m.has(k))m.set(k,{rev:0,cmp:0,qty:0});m.get(k).cmp+=num(r.revenue)});const rows=[...m.entries()].filter(([k])=>!q||k.toLowerCase().includes(q)).sort((a,b)=>b[1].rev-a[1].rev),total=sum(rows.map(([,x])=>x.rev)),qty=sum(rows.map(([,x])=>x.qty));$('groupTotals').innerHTML=[['篩選營收總計',yen(total)],['篩選銷量總計',fmt(qty)],['專案數',fmt(rows.length)]].map(([n,v])=>`<div class="kpi"><span>${n}</span><strong>${v}</strong></div>`).join('');$('groupRows').innerHTML=rows.map(([k,x])=>{const g=growth(x.rev,x.cmp);return`<tr><td>${esc(k)}</td><td>${yen(x.rev)}</td><td>${yen(x.cmp)}</td><td>${yen(x.rev-x.cmp)}</td><td class="${g.cls}">${g.text}</td><td>${fmt(x.qty)}</td><td>${total?(x.rev/total*100).toFixed(1):0}%</td></tr>`}).join('')}

function renderMaster(){const q=$('masterSearch').value.trim().toLowerCase();$('masterRows').innerHTML=[...state.products.values()].filter(p=>!q||((p.id||'')+' '+(p.managementNumber||'')+' '+(p.nameZh||'')+' '+(p.projectName||'')+' '+(p.vendorName||'')+' '+(p.barcode||'')).toLowerCase().includes(q)).sort((a,b)=>String(a.id).localeCompare(String(b.id),'ja')).map(p=>`<tr><td>${esc(p.id)}</td><td>${esc(p.managementNumber)}</td><td>${esc(p.nameZh||p.name)}</td><td>${esc(p.projectName)}</td><td>${esc(p.vendorName)}</td><td>${twd(p.supplyPrice)}</td><td>${yen(p.rakutenPriceJpy)}</td><td>${yen(p.netseaPriceJpy)}</td><td>${yen(p.shopifyPrice)}</td><td>${esc(p.barcode)}</td></tr>`).join('')}

$('productImportMode').onchange=()=>{
  const partial=$('productImportMode').value==='partial';
  $('partialUpdateHelp')?.classList.toggle('hidden',!partial);
};
$('productFile').onchange=e=>e.target.files?.[0]&&importProducts(e.target.files[0]);
async function importProducts(file){
  const mode=$('productImportMode')?.value||'merge';
  if(mode==='partial')return importPartialProductFields(file);

  $('productStatus').textContent='讀取中…';
  Papa.parse(file,{header:true,skipEmptyLines:'greedy',complete:async r=>{
    try{
      const parsed=r.data.map((x,i)=>({
        id:pick(x,['商品番号','商品規格管理編號','商品規格管理番号']),
        productNumber:pick(x,['商品番号','商品規格管理編號','商品規格管理番号']),
        managementNumber:pick(x,['商品管理番号','商品管理編號']),
        nameZh:pick(x,['中文商品名','中文品名','商品名（中文）']),
        projectName:pick(x,['專案名稱']),
        vendorName:pick(x,['廠商名']),
        supplyPrice:num(pick(x,['商品供應價'])),
        rakutenPriceJpy:num(pick(x,['樂天日幣售價'])),
        netseaPriceJpy:num(pick(x,['NETSEA日幣售價'])),
        shopifyPrice:num(pick(x,['Shopify售價'])),
        barcode:pick(x,['商品條碼']),
        sourceRow:i+2
      })).filter(x=>x.id);
      if(!parsed.length)throw new Error('CSV 找不到商品番号／商品規格管理編號');

      const mp=new Map();
      parsed.forEach(x=>mp.set(String(x.id),x));
      const rows=[...mp.values()].map(({sourceRow,...x})=>x);
      const duplicateCount=parsed.length-rows.length;

      let deleted=0;
      if(mode==='replace'){
        if(prompt(`此操作將刪除目前 ${state.products.size} 筆商品資料，再匯入 ${rows.length} 筆。\n請輸入 DELETE 確認：`)!=='DELETE'){
          $('productStatus').textContent='已取消';
          $('productFile').value='';
          return;
        }
        deleted=await deleteCollectionDocuments('products');
      }

      await batchWrite('products',rows,x=>x.id);
      await logImport(mode==='replace'?'productMasterReplace':'productMasterMerge','',file.name,rows.length,rows.length,0);
      $('productStatus').textContent=mode==='replace'
        ?`完成：刪除 ${deleted} 筆，匯入 ${rows.length} 筆`
        :`完成：更新／新增 ${rows.length} 筆${duplicateCount?`，重複 ${duplicateCount} 列採最後一列`:''}`;

      $('productFile').value='';
      await loadProductMaster();
      renderProducts();
      renderGroups();
    }catch(e){
      console.error(e);
      $('productStatus').textContent='匯入失敗：'+e.message;
    }
  }});
}

const PARTIAL_PRODUCT_FIELD_MAP=[
  {keys:['中文商品名','中文品名','商品名（中文）'],field:'nameZh',type:'string',label:'中文商品名'},
  {keys:['專案名稱'],field:'projectName',type:'string',label:'專案名稱'},
  {keys:['廠商名'],field:'vendorName',type:'string',label:'廠商名'},
  {keys:['商品供應價'],field:'supplyPrice',type:'number',label:'商品供應價'},
  {keys:['樂天日幣售價'],field:'rakutenPriceJpy',type:'number',label:'樂天日幣售價'},
  {keys:['NETSEA日幣售價'],field:'netseaPriceJpy',type:'number',label:'NETSEA日幣售價'},
  {keys:['Shopify售價'],field:'shopifyPrice',type:'number',label:'Shopify售價'},
  {keys:['商品條碼'],field:'barcode',type:'string',label:'商品條碼'}
];

function getNonBlankRaw(row,keys){
  for(const k of keys){
    if(row[k]!==undefined&&String(row[k]).trim()!=='')return String(row[k]).trim();
  }
  return '';
}

async function importPartialProductFields(file){
  $('productStatus').textContent='指定欄位更新：讀取 CSV 中…';

  Papa.parse(file,{header:true,skipEmptyLines:'greedy',complete:async r=>{
    try{
      if(!state.products.size)await loadProductMaster();

      const rows=r.data||[];
      if(!rows.length)throw new Error('CSV 沒有可更新的資料');

      const headers=(r.meta?.fields||[]).map(x=>String(x||'').trim());
      const hasSku=headers.some(h=>['商品規格管理編號','商品規格管理番号','商品番号'].includes(h));
      const hasManagement=headers.some(h=>['商品管理編號','商品管理番号'].includes(h));
      if(!hasSku||!hasManagement){
        throw new Error('指定欄位更新需要同時包含「商品規格管理編號／商品番号」與「商品管理編號／商品管理番号」');
      }

      const recognizedFields=PARTIAL_PRODUCT_FIELD_MAP.filter(def=>def.keys.some(k=>headers.includes(k)));
      if(!recognizedFields.length){
        throw new Error('CSV 沒有任何可更新欄位。請加入中文商品名、專案名稱、廠商名、商品供應價、平台售價或商品條碼等欄位');
      }

      const updates=[];
      const errors=[];
      let skipped=0;
      const updatedFieldsCount={};

      rows.forEach((row,i)=>{
        const rowNo=i+2;
        const sku=getNonBlankRaw(row,['商品規格管理編號','商品規格管理番号','商品番号']);
        const management=getNonBlankRaw(row,['商品管理編號','商品管理番号']);

        if(!sku&&!management){skipped++;return}
        if(!sku||!management){
          errors.push(`第 ${rowNo} 列：兩個識別編號不可缺一`);
          return;
        }

        const product=findProduct(sku);
        if(!product){
          errors.push(`第 ${rowNo} 列：找不到商品規格管理編號／SKU「${sku}」`);
          return;
        }

        if(normKey(product.managementNumber)!==normKey(management)){
          errors.push(`第 ${rowNo} 列：編號不一致。SKU「${sku}」目前對應「${product.managementNumber||''}」，CSV 為「${management}」`);
          return;
        }

        const patch={id:product.id};
        let changed=0;

        recognizedFields.forEach(def=>{
          const raw=getNonBlankRaw(row,def.keys);
          if(raw==='')return;  // 空白 = 不修改
          patch[def.field]=def.type==='number'?num(raw):raw;
          changed++;
          updatedFieldsCount[def.label]=(updatedFieldsCount[def.label]||0)+1;
        });

        if(!changed){skipped++;return}
        updates.push(patch);
      });

      if(!updates.length){
        const detail=errors.slice(0,5).join('；');
        throw new Error(`沒有可寫入的更新資料${detail?'。'+detail:''}`);
      }

      if(errors.length){
        const preview=errors.slice(0,8).join('\n');
        const ok=confirm(`發現 ${errors.length} 筆不會更新的資料：\n\n${preview}${errors.length>8?`\n…另有 ${errors.length-8} 筆`:''}\n\n其餘 ${updates.length} 筆仍要繼續更新嗎？`);
        if(!ok){
          $('productStatus').textContent='已取消指定欄位更新';
          $('productFile').value='';
          return;
        }
      }

      const started=Date.now();
      await batchWrite('products',updates,x=>x.id,(done,total)=>{
        $('productStatus').textContent=`指定欄位更新中：${done} / ${total}`;
      });

      await logImport('productPartialUpdate','',file.name,rows.length,updates.length,skipped+errors.length);
      await loadProductMaster();
      renderProducts();
      renderGroups();

      const fieldsSummary=Object.entries(updatedFieldsCount).map(([k,v])=>`${k} ${v}`).join('、');
      $('productStatus').textContent=
        `指定欄位更新完成：成功 ${updates.length} 筆、跳過 ${skipped} 筆、錯誤 ${errors.length} 筆；更新欄位：${fieldsSummary||'—'}；耗時 ${((Date.now()-started)/1000).toFixed(1)} 秒`;

      $('productFile').value='';
    }catch(e){
      console.error(e);
      $('productStatus').textContent='指定欄位更新失敗：'+e.message;
    }
  }});
}

async function deleteCollectionDocuments(collectionName,onProgress){const snap=await getDocs(collection(db,collectionName)),total=snap.docs.length;for(let i=0;i<total;i+=400){const batch=writeBatch(db),part=snap.docs.slice(i,i+400);part.forEach(d=>batch.delete(d.ref));await commitWithRetry(batch);onProgress?.(Math.min(i+part.length,total),total);if(i+part.length<total)await wait(100)}return total}

$('salesFile').onchange=e=>e.target.files?.[0]&&importSales(e.target.files[0]);
async function importSales(file){
  const p=$('importPlatform').value,profile=salesImportProfiles[p];
  if(!profile)return $('salesStatus').textContent='請先選擇平台';
  $('salesStatus').textContent='讀取中…';
  try{
    const source=p==='rakuten'?await readCsvText(file):file;
    Papa.parse(source,{header:true,skipEmptyLines:'greedy',complete:async r=>{try{
      const fatal=(r.errors||[]).find(e=>!['InvalidQuotes','MissingQuotes'].includes(e.code)&&!/quote/i.test(String(e.message||'')));
      if(fatal)throw new Error(`CSV 解析錯誤：第 ${fatal.row+2} 列 ${fatal.message}`);
      let cancelled=0;const countedOrders=new Set();
      const rows=r.data.map((x,i)=>{
        const status=pick(x,profile.status||[]).toLowerCase();
        if((profile.cancelled||[]).some(v=>status===String(v).toLowerCase())){cancelled++;return null}
        const date=pick(x,profile.date),orderId=pick(x,profile.orderId),productId=pick(x,profile.productId),managementNumber=pick(x,profile.managementNumber),line=String(i+1);
        if(!date||!orderId||!productId)return null;
        const d=parseDate(date),quantity=num(pick(x,profile.quantity)),unitPrice=num(pick(x,profile.unitPrice));
        let grossRevenue=0,couponAmount=0,revenue=0;
        if(p==='rakuten'){
          const firstOrderRow=!countedOrders.has(orderId);countedOrders.add(orderId);
          const itemTotal=num(pick(x,profile.itemTotal||[])),shippingTotal=num(pick(x,profile.shippingTotal||[]));
          couponAmount=num(pick(x,profile.coupon||[]));
          grossRevenue=firstOrderRow?itemTotal+shippingTotal:0;
          revenue=firstOrderRow?grossRevenue-couponAmount:0;
        }else{
          const directRevenue=pick(x,profile.revenue),value=directRevenue?num(directRevenue):unitPrice*quantity;
          grossRevenue=value;revenue=value;
        }
        return{id:safe(p+'_'+orderId+'_'+productId+'_'+line),platform:canonicalPlatform(p),orderId,productId,managementNumber,quantity,unitPrice,grossRevenue,couponAmount,revenue,saleDate:Timestamp.fromDate(d),year:d.getFullYear(),month:monthFromDate(d),sourceFile:file.name,updatedAt:serverTimestamp()}
      }).filter(Boolean);
      let write=rows,skipped=0;
      if($('duplicate').value==='skip'){$('salesStatus').textContent=`檢查重複資料中…（${rows.length} 筆）`;const existing=await existingIdSet('sales');write=rows.filter(x=>!existing.has(x.id));skipped=rows.length-write.length}
      await batchWrite('sales',write,x=>x.id,(done,total)=>{$('salesStatus').textContent=`匯入銷售資料中… ${done} / ${total}（${Math.round(done/Math.max(total,1)*100)}%）`});const platformName=canonicalPlatform(p);await setDoc(doc(db,'platforms',platformName),{name:platformName,updatedAt:serverTimestamp()},{merge:true});await logImport('sales',p,file.name,r.data.length,write.length,skipped+cancelled);
      $('salesStatus').textContent=`完成：有效 ${rows.length}、寫入 ${write.length}、重複跳過 ${skipped}、取消／退款排除 ${cancelled}。報表會依平台＋訂單編號自動避免營收重複計算`;await loadPlatforms();await loadReports()
    }catch(e){console.error(e);$('salesStatus').textContent='匯入失敗：'+e.message}}})
  }catch(e){console.error(e);$('salesStatus').textContent='匯入失敗：'+e.message}
}


$('adFile').onchange=e=>e.target.files?.[0]&&importAds(e.target.files[0]);
$('paFile').onchange=e=>{const file=e.target.files?.[0];if(file)importProductAnalytics(file)};
async function importAds(file){
  $('adStatus').textContent='讀取中…';
  try{
    const text=await readCsvText(file);
    const r=await parseCsvAutoHeader(text,['日付','商品管理番号','CTR(%)','クリック数(合計)','実績額(合計)']);
    if(r.headerIndex!==7)console.info(`樂天廣告表頭自動辨識於第 ${r.headerIndex+1} 列`);
    updatePaProgress(70,`整理商品分析資料中… 0 / ${r.data.length}`);
    const grouped=new Map();
    r.data.forEach((x,i)=>{
      if(i%500===0)updatePaProgress(70+Math.min(10,Math.round(i/Math.max(r.data.length,1)*10)),`整理商品分析資料中… ${i} / ${r.data.length}`);
      const rowNo=r.headerIndex+i+2,dateText=pick(x,['日付']),managementNumber=pick(x,['商品管理番号']);
      if(!dateText&&!managementNumber)return;
      if(!dateText)throw new Error(`第 ${rowNo} 列缺少「日付」`);
      if(!managementNumber)throw new Error(`第 ${rowNo} 列缺少「商品管理番号」`);
      let d;try{d=parseRakutenAdDate(dateText)}catch(e){throw new Error(`第 ${rowNo} 列：${e.message}`)}
      const monthKey=monthFromDate(d),key=monthKey+'||'+managementNumber;
      const clicks=num(pick(x,['クリック数(合計)','クリック数'])),adSpend=num(pick(x,['実績額(合計)','実績額'])),salesAmount=num(pick(x,['売上金額(合計720時間)','売上金額(720時間)','売上金額'])),salesOrders=num(pick(x,['売上件数(合計720時間)','売上件数(720時間)','売上件数'])),ctr=num(pick(x,['CTR(%)','CTR']));
      if(!grouped.has(key))grouped.set(key,{month:monthKey,adDate:d,managementNumber,clicks:0,adSpend:0,salesAmount:0,salesOrders:0,ctrWeighted:0,ctrWeight:0});
      const g=grouped.get(key),weight=Math.max(clicks,1);g.clicks+=clicks;g.adSpend+=adSpend;g.salesAmount+=salesAmount;g.salesOrders+=salesOrders;g.ctrWeighted+=ctr*weight;g.ctrWeight+=weight;
    });
    const rows=[...grouped.values()].map(g=>{const product=findProductByManagementNumber(g.managementNumber),ctr=g.ctrWeight?g.ctrWeighted/g.ctrWeight:0;return{id:safe('rakuten_ads_'+g.month+'_'+g.managementNumber),platform:'rakuten',adDate:Timestamp.fromDate(g.adDate),month:g.month,managementNumber:g.managementNumber,productId:product?.id||'',ctr,clicks:g.clicks,adSpend:g.adSpend,salesAmount:g.salesAmount,salesOrders:g.salesOrders,cvr:g.clicks?g.salesOrders/g.clicks*100:0,roas:g.adSpend?g.salesAmount/g.adSpend*100:0,sourceFile:file.name}});
    if(!rows.length)throw new Error('CSV 中找不到可匯入的廣告資料');
    let write=rows,skipped=0;if($('adDuplicate').value==='skip'){$('adStatus').textContent=`檢查重複資料中…（${rows.length} 筆）`;const existing=await existingIdSet('ads');write=rows.filter(x=>!existing.has(x.id));skipped=rows.length-write.length}
    await batchWrite('ads',write,x=>x.id,(done,total)=>{$('adStatus').textContent=`匯入樂天廣告中… ${done} / ${total}（${Math.round(done/Math.max(total,1)*100)}%）`});await logImport('rakutenAds','rakuten',file.name,rows.length,write.length,skipped);
    const unmatched=rows.filter(x=>!x.productId).length;$('adStatus').textContent=`完成：表頭第 ${r.headerIndex+1} 列、彙整 ${rows.length} 筆、寫入 ${write.length}、跳過 ${skipped}${r.warningCount?`、略過 ${r.warningCount} 個引號警告`:''}${unmatched?`、未對應商品 ${unmatched} 筆`:''}`;$('adFile').value='';await loadAds();
  }catch(e){console.error(e);$('adStatus').textContent='匯入失敗：'+e.message}
}

async function loadAds(){const s=await getDocs(collection(db,'ads'));state.ads=s.docs.map(d=>({id:d.id,...d.data()}));state.adsLoaded=true;renderAds()}
function fillAdProjectFilter(){const current=$('adProjectFilter')?.value||'',projects=[...new Set([...state.products.values()].map(p=>p.projectName).filter(v=>v&&!isHiddenProject(v)))].sort();if($('adProjectFilter')){$('adProjectFilter').innerHTML='<option value="">全部專案</option>'+projects.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');$('adProjectFilter').value=current}}
function renderAds(){if(!$('adRows'))return;const monthStart=$('adMonthStart').value,monthEnd=$('adMonthEnd').value,projectFilter=$('adProjectFilter').value,q=$('adSearch').value.trim().toLowerCase(),sortKey=$('adSort').value,order=$('adOrder').value==='asc'?1:-1,m=new Map();state.ads.forEach(r=>{if(!inMonthRange(r.month,monthStart,monthEnd))return;const ref=resolveAdProductReference(r),p=ref.product;if(isHiddenProject(ref.projectName))return;if(projectFilter&&(ref.projectName||'')!==projectFilter)return;const resolvedManagement=ref.managementNumber||r.managementNumber||'',resolvedProductId=p?.id||r.productId||'';const hay=(resolvedManagement+' '+resolvedProductId+' '+ref.nameZh+' '+ref.projectName).toLowerCase();if(q&&!hay.includes(q))return;const k=r.month+'||'+(resolvedManagement||resolvedProductId);if(!m.has(k))m.set(k,{month:r.month,managementNumber:resolvedManagement,productId:resolvedProductId,nameZh:ref.nameZh||'',projectName:ref.projectName||'',clicks:0,adSpend:0,salesAmount:0,salesOrders:0,ctrWeighted:0,ctrWeight:0});const x=m.get(k),clicks=num(r.clicks);x.clicks+=clicks;x.adSpend+=num(r.adSpend);x.salesAmount+=num(r.salesAmount);x.salesOrders+=num(r.salesOrders);x.ctrWeighted+=num(r.ctr)*Math.max(clicks,1);x.ctrWeight+=Math.max(clicks,1)});const rows=[...m.values()].map(x=>({...x,ctr:x.ctrWeight?x.ctrWeighted/x.ctrWeight:0,cvr:x.clicks?x.salesOrders/x.clicks*100:0,roas:x.adSpend?x.salesAmount/x.adSpend*100:0})).sort((a,b)=>{const av=typeof a[sortKey]==='string'?a[sortKey]:num(a[sortKey]),bv=typeof b[sortKey]==='string'?b[sortKey]:num(b[sortKey]);return typeof av==='string'?av.localeCompare(bv,'zh-Hant')*order:(av-bv)*order});const total={clicks:sum(rows.map(x=>x.clicks)),adSpend:sum(rows.map(x=>x.adSpend)),salesAmount:sum(rows.map(x=>x.salesAmount)),salesOrders:sum(rows.map(x=>x.salesOrders))};total.cvr=total.clicks?total.salesOrders/total.clicks*100:0;total.roas=total.adSpend?total.salesAmount/total.adSpend*100:0;$('adKpis').innerHTML=[['點擊數',fmt(total.clicks)],['廣告花費',yen(total.adSpend)],['廣告銷售額',yen(total.salesAmount)],['CVR',pct(total.cvr)],['ROAS',pct(total.roas)]].map(([n,v])=>`<div class="kpi"><span>${n}</span><strong>${v}</strong></div>`).join('');$('adRows').innerHTML=rows.map(x=>`<tr><td>${esc(x.month)}</td><td>${esc(x.productId)}</td><td>${esc(x.managementNumber)}</td><td class="ad-product-name">${productNameCell(x.nameZh||'未對應',15)}</td><td>${esc(x.projectName)}</td><td>${pct(x.ctr)}</td><td>${fmt(x.clicks)}</td><td>${yen(x.adSpend)}</td><td>${yen(x.salesAmount)}</td><td>${fmt(x.salesOrders)}</td><td>${pct(x.cvr)}</td><td>${pct(x.roas)}</td></tr>`).join('')}
async function importProductAnalytics(file){
  $('paStatus').textContent='讀取中…';
  updatePaProgress(1,`準備讀取 ${file.name}…`);
  try{
    const r=await parseRakutenProductAnalyticsCsv(file,(pct,text)=>updatePaProgress(pct,text));
    const monthKey=r.period.month;
    if($('paImportMonth'))$('paImportMonth').value=monthKey;
    $('paStatus').textContent=`表示期間：${r.period.label}；自動辨識第 ${r.headerIndex+1} 列為表頭，整理資料中…`;
    const grouped=new Map();
    r.data.forEach((x,i)=>{
      if(i%300===0)updatePaProgress(68+Math.min(12,Math.round(i/Math.max(r.data.length,1)*12)),`整理商品分析資料中… ${i} / ${r.data.length}`);
      const productId=pick(x,['商品番号']);
      if(!productId)return;
      const key=String(productId).trim();
      if(!grouped.has(key))grouped.set(key,{productId:key,sales:0,salesOrders:0,salesQuantity:0,traffic:0,newOrders:0,repeatOrders:0,favoriteNew:0,favoriteTotal:0});
      const g=grouped.get(key);
      g.sales+=num(pick(x,['売上']));
      g.salesOrders+=num(pick(x,['売上件数']));
      g.salesQuantity+=num(pick(x,['売上個数']));
      g.traffic+=num(pick(x,['アクセス人数']));
      g.newOrders+=num(pick(x,['新規購入件数']));
      g.repeatOrders+=num(pick(x,['リピート購入件数']));
      g.favoriteNew+=num(pick(x,['お気に入り登録ユーザ数']));
      g.favoriteTotal=Math.max(g.favoriteTotal,num(pick(x,['お気に入り総ユーザ数'])));
    });
    updatePaProgress(82,`商品彙整完成：${grouped.size} 筆，準備寫入資料庫…`);
    const rows=[...grouped.values()].map(g=>{const ref=resolveProductReference(g.productId);return{id:safe('product_analysis_'+monthKey+'_'+g.productId),month:monthKey,periodStart:r.period.start,periodEnd:r.period.end,productId:g.productId,managementNumber:ref.managementNumber||'',...g,sourceFile:file.name}});
    if(!rows.length)throw new Error('CSV 中找不到「商品番号」或可匯入資料');
    let write=rows,skipped=0;
    if($('paDuplicate').value==='skip'){
      $('paStatus').textContent=`檢查重複資料中…（${rows.length} 筆）`;
      updatePaProgress(84,`檢查重複資料中… ${rows.length} 筆`);
      const existing=await existingIdSet('productAnalytics');
      write=rows.filter(x=>!existing.has(x.id));skipped=rows.length-write.length;
    }
    await batchWrite('productAnalytics',write,x=>x.id,(done,total)=>{
      const writePct=total?done/total:1;
      const overall=86+Math.round(writePct*11);
      $('paStatus').textContent=`匯入商品分析中… ${done} / ${total}（${Math.round(writePct*100)}%）`;
      updatePaProgress(overall,`寫入資料庫中… ${done} / ${total}`);
    });
    await logImport('productAnalytics','rakuten',file.name,rows.length,write.length,skipped);
    updatePaProgress(98,'重新整理商品分析資料…');
    $('paStatus').textContent=`完成：表示期間 ${r.period.label}；表頭第 ${r.headerIndex+1} 列；彙整 ${rows.length} 筆、寫入 ${write.length}、跳過 ${skipped}${r.warningCount?`；略過 ${r.warningCount} 個引號警告`:''}`;
    $('paFile').value='';
    updatePaProgress(98,'資料已寫入，重新整理商品分析畫面…');

    // Important: the import itself is already complete at this point.
    // A UI render error must not be reported as "匯入失敗".
    try{
      await loadProductAnalytics();
      updatePaProgress(100,`完成：${r.period.start} ～ ${r.period.end}，寫入 ${write.length} 筆，跳過 ${skipped} 筆`);
    }catch(renderError){
      console.error('商品分析資料已寫入，但畫面重新整理失敗：',renderError);
      $('paStatus').textContent=`匯入完成：已寫入 ${write.length} 筆、跳過 ${skipped} 筆。畫面重新整理時發生錯誤：${renderError.message}。請切換頁面或重新整理瀏覽器。`;
      updatePaProgress(100,`資料寫入完成；畫面更新錯誤：${renderError.message}`);
    }
  }catch(e){
    console.error(e);
    $('paStatus').textContent='匯入失敗：'+e.message;
    updatePaProgress(100,'匯入失敗：'+e.message);
  }
}
async function loadProductAnalytics(){
  const s=await getDocs(collection(db,'productAnalytics'));
  state.productAnalytics=s.docs.map(d=>({id:d.id,...d.data()}));
  state.productAnalyticsLoaded=true;
  fillPaFilters();
  if(!state.adsLoaded){
    const a=await getDocs(collection(db,'ads'));
    state.ads=a.docs.map(d=>({id:d.id,...d.data()}));
    state.adsLoaded=true;
  }
  if(typeof renderProductAnalytics==='function')renderProductAnalytics();
}
function fillPaFilters(){const projectCurrent=$('paProjectFilter').value;const projects=[...new Set([...state.products.values()].map(p=>p.projectName).filter(v=>v&&!isHiddenProject(v)))].sort();$('paProjectFilter').innerHTML='<option value="">全部專案</option>'+projects.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');$('paProjectFilter').value=projectCurrent}
function renderProductAnalytics(){if(!$('paRows'))return;const monthStart=$('paMonthStart').value,monthEnd=$('paMonthEnd').value,pf=$('paProjectFilter').value,q=$('paSearch').value.trim().toLowerCase(),sortKey=$('paSort').value,order=$('paOrder').value==='asc'?1:-1;const adClicks=new Map();state.ads.forEach(a=>{const ref=resolveAdProductReference(a),pid=ref.product?.id||a.productId||a.managementNumber||'';if(pid)adClicks.set(a.month+'||'+pid,(adClicks.get(a.month+'||'+pid)||0)+num(a.clicks))});const rows=state.productAnalytics.map(r=>{const ref=resolveProductAnalysisReference(r),rppTraffic=(adClicks.get(r.month+'||'+r.productId)||adClicks.get(r.month+'||'+ref.product?.id)||0),traffic=num(r.traffic);return{...r,managementNumber:ref.managementNumber||r.managementNumber||'',nameZh:ref.nameZh||'',projectName:ref.projectName||'',rppTraffic,organicTraffic:traffic-rppTraffic,conversionRate:traffic?num(r.salesOrders)/traffic*100:0}}).filter(r=>!isHiddenProject(r.projectName)&&inMonthRange(r.month,monthStart,monthEnd)&&(!pf||r.projectName===pf)&&(!q||(r.productId+' '+r.managementNumber+' '+r.nameZh+' '+r.projectName).toLowerCase().includes(q))).sort((a,b)=>(num(a[sortKey])-num(b[sortKey]))*order);const totals={sales:sum(rows.map(x=>x.sales)),salesOrders:sum(rows.map(x=>x.salesOrders)),salesQuantity:sum(rows.map(x=>x.salesQuantity)),traffic:sum(rows.map(x=>x.traffic)),rppTraffic:sum(rows.map(x=>x.rppTraffic)),newOrders:sum(rows.map(x=>x.newOrders)),repeatOrders:sum(rows.map(x=>x.repeatOrders))};totals.organicTraffic=totals.traffic-totals.rppTraffic;totals.conversionRate=totals.traffic?totals.salesOrders/totals.traffic*100:0;$('paKpis').innerHTML=[['銷售額',yen(totals.sales)],['銷售訂單數',fmt(totals.salesOrders)],['商品頁流量',fmt(totals.traffic)],['自然流量',fmt(totals.organicTraffic)],['轉換率',pct(totals.conversionRate)]].map(([n,v])=>`<div class="kpi"><span>${n}</span><strong>${v}</strong></div>`).join('');$('paRows').innerHTML=rows.map(x=>`<tr><td>${esc(x.month)}</td><td>${esc(x.productId)}</td><td>${esc(x.managementNumber)}</td><td>${productNameCell(x.nameZh||'未對應')}</td><td>${yen(x.sales)}</td><td>${fmt(x.salesOrders)}</td><td>${fmt(x.salesQuantity)}</td><td>${fmt(x.traffic)}</td><td>${fmt(x.rppTraffic)}</td><td>${fmt(x.organicTraffic)}</td><td>${pct(x.conversionRate)}</td><td>${fmt(x.newOrders)}</td><td>${fmt(x.repeatOrders)}</td><td>${fmt(x.favoriteNew)}</td><td>${fmt(x.favoriteTotal)}</td></tr>`).join('')}

function setupTableFilters(){
  document.querySelectorAll('.table table:not([data-no-auto-filter])').forEach(table=>{
    if(table.dataset.filterReady)return;
    table.dataset.filterReady='1';
    const headers=[...table.querySelectorAll('thead th')].map((th,j)=>({j,label:th.textContent.trim()}));
    const box=document.createElement('div');
    box.className='subfilters auto-table-filter';
    box.innerHTML=`<label>搜尋<input data-role="search" placeholder="搜尋表格內容"></label><label>排序欄位<select data-role="column">${headers.map(h=>`<option value="${h.j}">${esc(h.label)}</option>`).join('')}</select></label><label>順序<select data-role="order"><option value="desc">由大到小</option><option value="asc">由小到大</option></select></label>`;
    table.closest('.table').before(box);
    const apply=()=>{
      const tbody=table.tBodies[0];
      if(!tbody)return;
      const q=box.querySelector('[data-role=search]').value.trim().toLowerCase();
      const col=Number(box.querySelector('[data-role=column]').value)||0;
      const dir=box.querySelector('[data-role=order]').value==='asc'?1:-1;
      const rows=[...tbody.rows];
      rows.forEach(row=>{row.hidden=Boolean(q)&&!row.textContent.toLowerCase().includes(q)});
      const visible=rows.filter(row=>!row.hidden).sort((a,b)=>compareCell(a.cells[col]?.textContent,b.cells[col]?.textContent)*dir);
      const hidden=rows.filter(row=>row.hidden);
      const frag=document.createDocumentFragment();
      [...visible,...hidden].forEach(row=>frag.appendChild(row));
      tbody.appendChild(frag);
    };
    box.querySelector('[data-role=search]').addEventListener('input',apply);
    box.querySelector('[data-role=column]').addEventListener('change',apply);
    box.querySelector('[data-role=order]').addEventListener('change',apply);
  });
}
function compareCell(a='',b=''){const clean=v=>String(v).replace(/[¥￥円,%\s,]/g,'');const an=Number(clean(a)),bn=Number(clean(b));return Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(a).localeCompare(String(b),'zh-Hant',{numeric:true})}

async function existingIdSet(collectionName){
  const snap=await getDocs(collection(db,collectionName));
  return new Set(snap.docs.map(d=>d.id));
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function commitWithRetry(batch,maxRetries=4){
  let attempt=0;
  while(true){
    try{return await batch.commit()}
    catch(e){
      const retryable=/too many outstanding requests|resource-exhausted|unavailable|deadline-exceeded/i.test(String(e?.message||e));
      if(!retryable||attempt>=maxRetries)throw e;
      await wait(500*Math.pow(2,attempt));attempt++;
    }
  }
}
async function batchWrite(c,rows,id,onProgress){
  const batchSize=400,total=rows.length;
  if(!total){onProgress?.(0,0);return}
  for(let i=0;i<total;i+=batchSize){
    const b=writeBatch(db),part=rows.slice(i,i+batchSize);
    part.forEach(x=>b.set(doc(db,c,id(x)),{...x,updatedAt:serverTimestamp()},{merge:true}));
    await commitWithRetry(b);
    onProgress?.(Math.min(i+part.length,total),total);
    if(i+part.length<total)await wait(100);
  }
}
async function logImport(type,platform,fileName,total,written,skipped){await setDoc(doc(collection(db,'imports')),{type,platform,fileName,total,written,skipped,importedBy:state.user.email||'',importedAt:serverTimestamp()})}
const MAINTENANCE_COLLECTIONS={products:'商品主檔',sales:'銷售資料',ads:'樂天廣告',productAnalytics:'商品分析',imports:'匯入紀錄',platforms:'平台資料'};
async function collectionCount(name){const snap=await getDocs(collection(db,name));return snap.size}
async function loadMaintenance(){if(!$('maintenanceCounts'))return;$('maintenanceCounts').innerHTML='<div class="kpi"><span>讀取中</span><strong>…</strong></div>';try{const entries=await Promise.all(Object.entries(MAINTENANCE_COLLECTIONS).map(async([key,label])=>[key,label,await collectionCount(key)]));$('maintenanceCounts').innerHTML=entries.map(([key,label,count])=>`<div class="kpi"><span>${label}</span><strong data-count="${key}">${fmt(count)}</strong></div>`).join('')}catch(e){console.error(e);$('maintenanceCounts').innerHTML=`<div class="notice">讀取失敗：${esc(e.message)}</div>`}}
function confirmDelete(message){return prompt(`${message}\n\n此操作無法復原。請輸入 DELETE 確認：`)==='DELETE'}
async function deleteCollections(names){let deleted=0;for(const name of names){$('maintenanceStatus').textContent=`正在清除 ${MAINTENANCE_COLLECTIONS[name]}…`;deleted+=await deleteCollectionDocuments(name,(done,total)=>{$('maintenanceStatus').textContent=`正在清除 ${MAINTENANCE_COLLECTIONS[name]}：${done} / ${total}`})}return deleted}
async function deleteSelectedData(){const names=[...document.querySelectorAll('.maintenance-target:checked')].map(x=>x.value);if(!names.length)return alert('請先勾選要清除的資料');if(!confirmDelete('將清除：'+names.map(x=>MAINTENANCE_COLLECTIONS[x]).join('、')))return;try{const deleted=await deleteCollections(names);$('maintenanceStatus').textContent=`完成：共刪除 ${deleted} 筆資料`;document.querySelectorAll('.maintenance-target').forEach(x=>x.checked=false);await refreshAfterMaintenance(names);await loadMaintenance()}catch(e){console.error(e);$('maintenanceStatus').textContent='清除失敗：'+e.message}}
async function resetAllImportedData(){const names=Object.keys(MAINTENANCE_COLLECTIONS);if(!confirmDelete('將清空全部匯入資料，但保留 users 與登入帳號'))return;try{const deleted=await deleteCollections(names);$('maintenanceStatus').textContent=`全部清除完成：共刪除 ${deleted} 筆資料`;await refreshAfterMaintenance(names);await loadMaintenance()}catch(e){console.error(e);$('maintenanceStatus').textContent='全部清除失敗：'+e.message}}
async function refreshAfterMaintenance(names){if(names.includes('products')){state.products=new Map();state.productsByManagement=new Map()}if(names.includes('sales')){state.sales=[];state.compare=[]}if(names.includes('ads')){state.ads=[];state.overviewAds=[];state.adsLoaded=false}if(names.includes('productAnalytics')){state.productAnalytics=[];state.overviewAnalytics=[];state.productAnalyticsLoaded=false}if(names.includes('platforms'))state.platforms=new Set();await loadProductMaster();await loadPlatforms();await loadReports();if(names.includes('imports'))$('historyRows').innerHTML=''}
async function rebuildProductIndexes(){try{$('maintenanceStatus').textContent='重新載入商品主檔並建立索引中…';await loadProductMaster();renderProducts();renderGroups();if(state.adsLoaded)renderAds();if(state.productAnalyticsLoaded)renderProductAnalytics();$('maintenanceStatus').textContent=`商品索引完成：${state.products.size} 個 SKU、${state.productsByManagement.size} 個商品編號`}catch(e){console.error(e);$('maintenanceStatus').textContent='索引重建失敗：'+e.message}}
async function recalculateDashboard(){try{$('maintenanceStatus').textContent='重新載入並計算 Dashboard…';await loadProductMaster();await loadPlatforms();await loadReports();if(state.adsLoaded)await loadAds();if(state.productAnalyticsLoaded)await loadProductAnalytics();$('maintenanceStatus').textContent='Dashboard 已重新計算完成'}catch(e){console.error(e);$('maintenanceStatus').textContent='重新計算失敗：'+e.message}}
async function runHealthCheck(){try{$('healthResult').textContent='檢查中…';const [products,sales,ads,pa]=await Promise.all(['products','sales','ads','productAnalytics'].map(async name=>(await getDocs(collection(db,name))).docs.map(d=>({id:d.id,...d.data()}))));const productIds=new Set(products.map(x=>normKey(x.id))),managementIds=new Set(products.map(x=>normKey(x.managementNumber)).filter(Boolean));const unmatchedSales=sales.filter(x=>!productIds.has(normKey(x.productId))&&!managementIds.has(normKey(x.managementNumber))&&!managementIds.has(normKey(x.productId))).length;const unmatchedAds=ads.filter(x=>!managementIds.has(normKey(x.managementNumber))&&!productIds.has(normKey(x.productId))&&!productIds.has(normKey(x.managementNumber))).length;const unmatchedPa=pa.filter(x=>!productIds.has(normKey(x.productId))&&!managementIds.has(normKey(x.productId))).length;const issues=unmatchedSales+unmatchedAds+unmatchedPa;$('healthResult').innerHTML=`<div class="health-grid"><span>商品主檔：${fmt(products.length)} 筆</span><span>銷售資料：${fmt(sales.length)} 筆</span><span>廣告資料：${fmt(ads.length)} 筆</span><span>商品分析：${fmt(pa.length)} 筆</span></div><p class="${issues?'neg':'pos'}">${issues?`發現未對應資料：銷售 ${unmatchedSales} 筆、廣告 ${unmatchedAds} 筆、商品分析 ${unmatchedPa} 筆`:'系統檢查完成，未發現商品對應問題。'}</p>`}catch(e){console.error(e);$('healthResult').textContent='系統檢查失敗：'+e.message}}
async function loadHistory(){const s=await getDocs(query(collection(db,'imports'),orderBy('importedAt','desc'),limit(100)));$('historyRows').innerHTML=s.docs.map(d=>{const x=d.data();return`<tr><td>${x.importedAt?.toDate?x.importedAt.toDate().toLocaleString('zh-TW'):''}</td><td>${esc(x.type)}</td><td>${esc(x.platform)}</td><td>${esc(x.fileName)}</td><td>${fmt(x.total)}</td><td>${fmt(x.written)}</td><td>${fmt(x.skipped)}</td><td>${esc(x.importedBy)}</td></tr>`}).join('')}
function chart(id,type,labels,datasets,extraOptions={}){state.charts[id]?.destroy();state.charts[id]=new Chart($(id),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,...extraOptions}})}
function month(t){const d=t?.toDate?t.toDate():new Date(t);return monthFromDate(d)}function monthFromDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}function fdLocal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function pick(o,n){for(const k of n)if(o[k]!==undefined&&String(o[k]).trim()!=='')return String(o[k]).trim();return''}
function parseDate(v){const raw=String(v||'').trim();if(!raw)throw new Error('日期欄位為空');const jp=raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);if(jp)return new Date(+jp[1],+jp[2]-1,+jp[3]);const s=raw.replace(/\./g,'/').replace(/-/g,'/'),m=s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);const d=new Date(raw);if(isNaN(d))throw new Error('無法辨識日期：'+raw);return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function parseRakutenAdDate(v){
  const raw=String(v||'').trim();
  if(!raw)throw new Error('日期欄位為空');
  // Rakuten advertising exports may use either a daily date (2025年01月15日)
  // or a monthly period (2025年01月). Monthly rows are stored as the first day
  // of that month because the ads collection is aggregated by month.
  const jpDay=raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if(jpDay)return new Date(+jpDay[1],+jpDay[2]-1,+jpDay[3]);
  const jpMonth=raw.match(/^(\d{4})年(\d{1,2})月$/);
  if(jpMonth)return new Date(+jpMonth[1],+jpMonth[2]-1,1);
  const normalized=raw.replace(/\./g,'/').replace(/-/g,'/');
  const slashMonth=normalized.match(/^(\d{4})\/(\d{1,2})$/);
  if(slashMonth)return new Date(+slashMonth[1],+slashMonth[2]-1,1);
  return parseDate(raw);
}
function productNameCell(value,maxLength=15){const full=String(value??'').trim()||'未對應',chars=Array.from(full),short=chars.length>maxLength?chars.slice(0,maxLength).join('')+'…':full;return `<span class="product-name-short" title="${esc(full)}">${esc(short)}</span>`}function safe(s){return String(s).replace(/[\/#?\[\]]/g,'_').slice(0,1400)}function num(v){const n=Number(String(v??'').replace(/[¥￥円,\s]/g,'').replace(/[^\d.-]/g,''));return isFinite(n)?n:0}function fmt(v){return new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(Number(v)||0)}function yen(v){return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(v)||0)}function twd(v){return new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(Number(v)||0)}function pct(v){return `${fmt(v)}%`}function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
