import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const FIELDS = [
  ['specManagementId','商品規格管理編號','text','import'],['productManagementId','商品管理編號','text','import'],['title','商品標題','text','import'],
  ['spec1','規格1','text','import'],['spec2','規格2','text','import'],['spec3','規格3','text','import'],['note','備註','textarea','editable'],
  ['active','上架','boolean','editable'],['priceJPY','日幣售價(JPY)','number','editable'],['weightG','重量(g)','number','editable'],
  ['productCostTWD','商品成本(TWD)','number','calculated'],['domesticShippingTWD','日本國內運費(TWD)','number','calculated'],['logisticsMethod','物流方式','text','calculated'],
  ['uniCostTWD','統一成本(TWD)','number','calculated'],['nisshinCostTWD','新日誠成本(TWD)','number','calculated'],['fixedLogisticsCostTWD','固定規則物流成本(TWD)','number','calculated'],
  ['manualPriceTWD','商品台幣售價(手動)','number','calculated'],['customerShippingTWD','客收運費(TWD)','number','calculated'],['grossReceivedTWD','原實收(TWD)','number','calculated'],
  ['platformFeeTWD','平台費(TWD)','number','calculated'],['profitTWD','利潤(TWD)','number','calculated'],['profitRate','利潤率','percent','calculated'],
  ['suggestedPrice30TWD','30%利潤建議售價(TWD)','number','calculated'],['pageViews','頁面檢視總數','number','import'],['unitsSold','銷售商品數','number','import'],
  ['orderCount','銷售訂單數','number','import'],['conversionRate','轉換率','percent','calculated']
];
const FIELD_MAP = Object.fromEntries(FIELDS.map(f=>[f[0],{key:f[0],label:f[1],type:f[2],mode:f[3]}]));
const IMPORT_ALIASES = {
  specManagementId:['商品規格管理編號'], productManagementId:['商品管理編號'], title:['商品標題'], spec1:['規格1'], spec2:['規格2'], spec3:['規格3'], note:['備註'],
  priceJPY:['日幣售價(JPY)','日幣售價'], weightG:['重量(g)','重量'], pageViews:['頁面檢視','頁面檢視總數','頁面檢視總數/月'],
  unitsSold:['售出單位','銷售商品數','銷售數'], orderCount:['訂單計數','銷售訂單數']
};
const DEFAULT_PARAMS = { productCostRate:.2, freeDomesticJPY:3980, domesticShippingJPY:800, platformFeeRate:.12, targetProfitRate:.3, customerShippingPerKgTWD:199, freeShippingTWD:5000, uniFirstKgTWD:205, uniEachHalfKgTWD:102.5, nisshinRate:.2, nisshinDiscount:.85, nisshinFixedFeeTWD:82, tiers:[[.5,1450],[.6,1600],[.7,1750],[.8,1900],[.9,2050],[1,2200],[1.25,2500],[1.5,2800],[1.75,3100],[2,3400],[2.5,3900],[3,4400],[3.5,4900],[4,5400],[4.5,5900],[5,6400],[5.5,6900],[6,7400],[7,8200],[8,9000],[9,9800],[10,10600],[11,11400],[12,12200],[13,13000]] };
const PARAM_DEFS = [['productCostRate','商品成本匯率'],['freeDomesticJPY','日本國內免運門檻(JPY)'],['domesticShippingJPY','日本國內運費(JPY)'],['platformFeeRate','平台費率'],['targetProfitRate','目標利潤率'],['customerShippingPerKgTWD','客收運費/公斤(TWD)'],['freeShippingTWD','台幣免運門檻(TWD)'],['uniFirstKgTWD','統一數網首重1kg(TWD)'],['uniEachHalfKgTWD','統一數網續重0.5kg(TWD)'],['nisshinRate','新日誠物流匯率'],['nisshinDiscount','新日誠物流折扣'],['nisshinFixedFeeTWD','新日誠物流固定作業費(TWD)']];
const PLATFORMS=[{id:'taiwan_rakuten',name:'台灣樂天'},{id:'rianyou_shopify',name:'日安優物 Shopify'}];
const MAINT_COLLECTIONS={products:'商品主檔',sales:'銷售',ads:'廣告',productAnalysis:'商品分析',imports:'匯入紀錄',platforms:'平台資料'};
const DEFAULT_COLUMNS=['specManagementId','productManagementId','title','spec1','spec2','active','priceJPY','weightG','manualPriceTWD','profitTWD','profitRate','pageViews','unitsSold','orderCount','conversionRate'];
let products=[], params={...DEFAULT_PARAMS}, visibleColumns=JSON.parse(localStorage.getItem('visibleColumns')||'null')||DEFAULT_COLUMNS, page=1; const PAGE_SIZE=50;
const $=id=>document.getElementById(id); const n=v=>Number(v)||0; const round=v=>Math.round(v); const ceilKg=g=>Math.ceil(n(g)/1000);
function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),2500)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function compute(base){
  const p={...base}, ov=p.overrides||{}, price=n(p.priceJPY), weight=n(p.weightG);
  const productCost=price?price*params.productCostRate:null;
  const domestic=price?(price>=params.freeDomesticJPY?0:params.domesticShippingJPY*params.productCostRate):null;
  const method=weight?(weight<=600?'統一':'新日誠'):'';
  const uni=weight?(weight<=1000?params.uniFirstKgTWD:params.uniFirstKgTWD+Math.ceil((weight-1000)/500)*params.uniEachHalfKgTWD):null;
  let nisshin=null; if(weight){const kg=weight/1000;if(kg>13)nisshin='超重';else{const tier=params.tiers.find(([max])=>kg<=max);nisshin=tier?round(tier[1]*params.nisshinRate*params.nisshinDiscount+params.nisshinFixedFeeTWD):null}}
  const fixed=method==='統一'?uni:nisshin;
  const suggested=price?calcSuggested(productCost,domestic,fixed,weight):null;
  const manual=ov.manualPriceTWD? n(p.manualPriceTWD) : suggested;
  const customer=manual!==null?(manual>=params.freeShippingTWD?0:ceilKg(weight)*params.customerShippingPerKgTWD):null;
  const gross=manual!==null?manual+customer:null;
  const fee=manual!==null?manual*params.platformFeeRate:null;
  const profit=gross!==null && typeof fixed==='number'?gross-fee-fixed-productCost-domestic:null;
  const margin=gross?profit/gross:null;
  const conversion=n(p.pageViews)>0?n(p.orderCount)/n(p.pageViews):null;
  const values={productCostTWD:productCost,domesticShippingTWD:domestic,logisticsMethod:method,uniCostTWD:uni,nisshinCostTWD:nisshin,fixedLogisticsCostTWD:fixed,manualPriceTWD:manual,customerShippingTWD:customer,grossReceivedTWD:gross,platformFeeTWD:fee,profitTWD:profit,profitRate:margin,suggestedPrice30TWD:suggested,conversionRate:conversion};
  Object.keys(values).forEach(k=>{if(ov[k]) values[k]=p[k]}); return {...p,...values};
}
function calcSuggested(j,k,o,weight){const target=params.targetProfitRate, denom=1-params.platformFeeRate-target;if(denom<=0)return null;const ship=ceilKg(weight)*params.customerShippingPerKgTWD;const candidate=((n(j)+n(k)+n(o))-ship*(1-target))/denom;return round(candidate>=params.freeShippingTWD?(n(j)+n(k)+n(o))/denom:candidate)}
function format(k,v){const t=FIELD_MAP[k]?.type;if(v===null||v===undefined||v==='')return '';if(t==='percent')return (n(v)*100).toFixed(1)+'%';if(t==='number')return typeof v==='number'?Math.round(v*100)/100:v;if(t==='boolean')return v?'<span class="badge">上架</span>':'<span class="badge off">下架</span>';return esc(v)}
async function ensurePlatforms(){for(const x of PLATFORMS){await setDoc(doc(db,'platforms',x.id),{name:x.name,active:true,updatedAt:serverTimestamp()},{merge:true})}}
async function loadAll(){await ensurePlatforms();const setting=await getDoc(doc(db,'settings','params'));params=setting.exists()?{...DEFAULT_PARAMS,...setting.data()}:structuredClone(DEFAULT_PARAMS);const snap=await getDocs(collection(db,'products'));products=snap.docs.map(d=>({id:d.id,...d.data()})).map(compute);renderAll();renderParams()}
function filtered(){const q=$('searchInput').value.trim().toLowerCase(), status=$('statusFilter').value;return products.filter(p=>(status==='all'||String(!!p.active)===status)&&(!q||[p.specManagementId,p.productManagementId,p.title,p.spec1,p.spec2,p.spec3,p.note].some(v=>String(v||'').toLowerCase().includes(q))))}
function renderAll(){renderTable();const list=filtered();$('statProducts').textContent=list.length;$('statActive').textContent=list.filter(p=>p.active).length;const margins=list.map(p=>p.profitRate).filter(Number.isFinite);$('statMargin').textContent=margins.length?(margins.reduce((a,b)=>a+b,0)/margins.length*100).toFixed(1)+'%':'0%';$('statUnits').textContent=list.reduce((s,p)=>s+n(p.unitsSold),0)}
function renderTable(){const list=filtered(), pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));page=Math.min(page,pages);const rows=list.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);$('tableHead').innerHTML='<tr>'+visibleColumns.map(k=>`<th>${esc(FIELD_MAP[k].label)}</th>`).join('')+'<th>操作</th></tr>';$('tableBody').innerHTML=rows.map(p=>'<tr>'+visibleColumns.map(k=>`<td>${format(k,p[k])}</td>`).join('')+`<td class="action-cell"><button data-edit="${p.id}">編輯</button><button class="secondary" data-delete="${p.id}">刪除</button></td></tr>`).join('');$('pageInfo').textContent=`第 ${page} / ${pages} 頁，共 ${list.length} 筆`;$('prevPage').disabled=page<=1;$('nextPage').disabled=page>=pages}
function renderColumns(){ $('columnOptions').innerHTML=FIELDS.map(([k,l])=>`<label><input type="checkbox" value="${k}" ${visibleColumns.includes(k)?'checked':''}>${esc(l)}</label>`).join('') }
function renderProductForm(p={}){const computed=compute(p);$('productId').value=p.id||'';$('productDialogTitle').textContent=p.id?'編輯商品':'新增商品';const pd=p.platformData||{};const platformHtml=`<div class="platform-editor full-span"><h3>平台資料</h3>${PLATFORMS.map(x=>`<fieldset><legend>${x.name}</legend><label><input type="checkbox" name="platform_${x.id}_enabled" ${pd[x.id]?.enabled?'checked':''}> 啟用此平台</label><label>售價<input type="number" step="any" name="platform_${x.id}_price" value="${esc(pd[x.id]?.price??'')}"></label><label>上架<select name="platform_${x.id}_active"><option value="true" ${pd[x.id]?.active!==false?'selected':''}>上架</option><option value="false" ${pd[x.id]?.active===false?'selected':''}>下架</option></select></label><label>備註<textarea name="platform_${x.id}_note">${esc(pd[x.id]?.note??'')}</textarea></label></fieldset>`).join('')}</div>`;$('productFields').innerHTML=platformHtml+FIELDS.filter(([k])=>!['conversionRate'].includes(k)).map(([k,l,t,mode])=>{const v=computed[k]??'';if(k==='active')return `<label>${l}<select name="${k}"><option value="true" ${v!==false?'selected':''}>上架</option><option value="false" ${v===false?'selected':''}>下架</option></select></label>`;if(t==='textarea')return `<label>${l}<textarea name="${k}">${esc(v)}</textarea></label>`;const readonly=mode==='calculated'&&k==='logisticsMethod';const inputType=t==='number'||t==='percent'?'number':'text';const step=t==='percent'?'0.0001':'any';const input=`<input name="${k}" type="${inputType}" step="${step}" value="${esc(v)}" ${readonly?'readonly':''}>`;if(mode==='calculated'&&!readonly)return `<label>${l}<span class="override-row">${input}<button type="button" class="secondary reset-override" data-reset="${k}">自動</button></span></label>`;return `<label>${l}${input}</label>`}).join('')}
function renderParams(){$('paramsFields').innerHTML=PARAM_DEFS.map(([k,l])=>`<label>${l}<input name="${k}" type="number" step="any" value="${params[k]}"></label>`).join('');$('shippingTierBody').innerHTML=params.tiers.map((t,i)=>`<tr><td><input name="tierMax_${i}" type="number" step="any" value="${t[0]}"></td><td><input name="tierFee_${i}" type="number" step="any" value="${t[1]}"></td></tr>`).join('')}
async function saveProduct(form){const fd=new FormData(form), id=$('productId').value;const old=id?products.find(p=>p.id===id):{};const data={...old,overrides:{...(old?.overrides||{})}};FIELDS.forEach(([k,,t,mode])=>{if(k==='conversionRate')return;const raw=fd.get(k);if(raw===null)return;data[k]=t==='number'||t==='percent'?(raw===''?null:Number(raw)):t==='boolean'?raw==='true':String(raw);if(mode==='calculated'&&k!=='logisticsMethod'&&raw!=='')data.overrides[k]=true});data.platformData={};PLATFORMS.forEach(x=>{data.platformData[x.id]={enabled:fd.get(`platform_${x.id}_enabled`)==='on',price:fd.get(`platform_${x.id}_price`)===''?null:Number(fd.get(`platform_${x.id}_price`)),active:fd.get(`platform_${x.id}_active`)==='true',note:String(fd.get(`platform_${x.id}_note`)||'')}});data.title=String(data.title||'').slice(0,15);data.updatedAt=serverTimestamp();if(!id)data.createdAt=serverTimestamp();const ref=id?doc(db,'products',id):doc(collection(db,'products'));await setDoc(ref,data,{merge:true});toast('商品已儲存');$('productDialog').close();await loadAll()}
function cleanText(value){
  if(value===null||value===undefined)return '';
  return String(value)
    .replace(/\uFEFF/g,'')
    .replace(/\u00A0/g,' ')
    .replace(/\u3000/g,' ')
    .replace(/[\r\n\t]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function normalizeHeader(value){
  return cleanText(value)
    .replace(/[\s\u00A0\u3000]+/g,'')
    .replace(/[：:]+$/g,'');
}
function normalizeId(value){
  return cleanText(value).replace(/[\r\n\t]/g,'');
}
function parseImportNumber(value){
  const cleaned=cleanText(value).replace(/,/g,'').replace(/[￥¥元]/g,'');
  if(cleaned==='')return null;
  const parsed=Number(cleaned);
  return Number.isFinite(parsed)?parsed:null;
}
function normalizeImportRow(row){
  const normalized={};
  Object.entries(row||{}).forEach(([key,value])=>{
    normalized[normalizeHeader(key)]=value;
  });
  return normalized;
}
function findHeader(row, aliases){
  const normalizedKeys=Object.keys(row||{});
  for(const alias of aliases){
    const target=normalizeHeader(alias);
    const found=normalizedKeys.find(key=>normalizeHeader(key)===target);
    if(found!==undefined)return found;
  }
  return null;
}
async function exportProducts(){const rows=products.map(p=>{const r={};FIELDS.forEach(([k,l])=>r[l]=p[k]??'');PLATFORMS.forEach(x=>{const d=p.platformData?.[x.id]||{};r[`${x.name}-啟用`]=!!d.enabled;r[`${x.name}-售價`]=d.price??'';r[`${x.name}-上架`]=d.active!==false;r[`${x.name}-備註`]=d.note??''});return r});const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'商品主檔');XLSX.writeFile(wb,`商品資料庫_${new Date().toISOString().slice(0,10)}.xlsx`)}
async function importExcel(){
  const file=$('excelFile').files[0];
  if(!file)return toast('請先選擇 Excel 檔案');
  $('importBtn').disabled=true;
  $('importStatus').textContent='讀取中…';

  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const preferred=wb.SheetNames.find(name=>normalizeHeader(name).toLowerCase()==='model')||wb.SheetNames[0];
    const rawRows=XLSX.utils.sheet_to_json(wb.Sheets[preferred],{
      defval:'',
      raw:false,
      blankrows:false
    });

    if(!rawRows.length)throw new Error('工作表沒有資料');

    const rows=rawRows.map(normalizeImportRow);
    const existing=new Map(
      products
        .filter(p=>normalizeId(p.specManagementId))
        .map(p=>[normalizeId(p.specManagementId),p])
    );

    let currentProductManagementId='';
    let currentTitle='';
    let currentNote='';
    let done=0;
    let skipped=0;

    for(let start=0;start<rows.length;start+=400){
      const batch=writeBatch(db);

      for(const row of rows.slice(start,start+400)){
        const selectedPlatform=$('importPlatform').value;
        const data={
          active:true,
          overrides:{},
          platformData:{
            [selectedPlatform]:{
              enabled:true,
              active:true,
              price:null,
              note:''
            }
          }
        };

        for(const [key,aliases] of Object.entries(IMPORT_ALIASES)){
          const header=findHeader(row,aliases);
          if(header!==null)data[key]=row[header];
        }

        const productManagementId=normalizeId(data.productManagementId);
        const specManagementId=normalizeId(data.specManagementId);
        const title=cleanText(data.title);
        const note=cleanText(data.note);

        if(productManagementId)currentProductManagementId=productManagementId;
        if(title)currentTitle=title;
        if(note)currentNote=note;

        data.productManagementId=productManagementId||currentProductManagementId;
        data.specManagementId=specManagementId;
        data.title=(title||currentTitle).slice(0,15);
        data.note=note||currentNote;

        data.spec1=cleanText(data.spec1);
        data.spec2=cleanText(data.spec2);
        data.spec3=cleanText(data.spec3);

        data.priceJPY=parseImportNumber(data.priceJPY);
        data.weightG=parseImportNumber(data.weightG);
        data.pageViews=parseImportNumber(data.pageViews)??0;
        data.unitsSold=parseImportNumber(data.unitsSold)??0;
        data.orderCount=parseImportNumber(data.orderCount)??0;

        if(!data.specManagementId){
          skipped++;
          continue;
        }

        const old=existing.get(data.specManagementId);
        if(old&&$('importMode').value==='skip'){
          skipped++;
          continue;
        }

        const ref=old?doc(db,'products',old.id):doc(collection(db,'products'));
        const merged=old
          ?{
              ...data,
              active:old.active??true,
              note:data.note||old.note||'',
              overrides:old.overrides||{},
              updatedAt:serverTimestamp()
            }
          :{
              ...data,
              createdAt:serverTimestamp(),
              updatedAt:serverTimestamp()
            };

        batch.set(ref,merged,{merge:true});
        existing.set(data.specManagementId,{id:ref.id,...merged});
        done++;
      }

      await batch.commit();
    }

    await addDoc(collection(db,'imports'),{
      fileName:file.name,
      rowCount:rows.length,
      successCount:done,
      skippedCount:skipped,
      createdAt:serverTimestamp()
    });

    $('importStatus').textContent=`完成：${done} 筆，略過 ${skipped} 筆`;
    toast('Excel 匯入完成');
    await loadAll();
  }catch(e){
    console.error(e);
    $('importStatus').textContent='匯入失敗：'+e.message;
  }finally{
    $('importBtn').disabled=false;
  }
}


async function countCollection(name){const s=await getDocs(collection(db,name));return s.size}
async function refreshMaintenance(){const entries=await Promise.all(Object.entries(MAINT_COLLECTIONS).map(async([k,l])=>[k,l,await countCollection(k)]));$('maintenanceCounts').innerHTML=entries.map(([k,l,c])=>`<label class="maintenance-row"><input type="checkbox" value="${k}"><span>${l}</span><strong>${c}</strong></label>`).join('');await runHealthCheck(false)}
function productKeys(){const s=new Set();products.forEach(p=>[p.specManagementId,p.productManagementId].forEach(v=>{if(v!==null&&v!==undefined&&String(v).trim())s.add(String(v).trim())}));return s}
function recordProductKey(d){for(const k of ['商品規格管理編號','商品管理編號','specManagementId','productManagementId','sku','SKU','商品編號']){if(d[k]!==undefined&&String(d[k]).trim())return String(d[k]).trim()}return ''}
async function runHealthCheck(showToast=true){const keys=productKeys(), result={};for(const name of ['sales','ads','productAnalysis']){const snap=await getDocs(collection(db,name));let unmatched=0;snap.forEach(x=>{const key=recordProductKey(x.data());if(!key||!keys.has(key))unmatched++});result[name]=unmatched}$('healthSales').textContent=result.sales;$('healthAds').textContent=result.ads;$('healthAnalysis').textContent=result.productAnalysis;if(showToast)toast('商品對應健康檢查完成');return result}
async function deleteCollection(name){const snap=await getDocs(collection(db,name));for(let i=0;i<snap.docs.length;i+=450){const batch=writeBatch(db);snap.docs.slice(i,i+450).forEach(d=>batch.delete(d.ref));await batch.commit()}}
async function deleteSelectedCollections(){if($('deleteConfirm').value!=='DELETE')return toast('請輸入 DELETE 才能刪除');const selected=[...$('maintenanceCounts').querySelectorAll('input:checked')].map(x=>x.value);if(!selected.length)return toast('請先勾選資料');for(const c of selected)await deleteCollection(c);$('deleteConfirm').value='';await loadAll();await refreshMaintenance();toast('指定資料已刪除')}
async function clearImportedData(){if($('deleteConfirm').value!=='DELETE')return toast('請輸入 DELETE 才能刪除');for(const c of ['products','sales','ads','productAnalysis','imports','platforms'])await deleteCollection(c);$('deleteConfirm').value='';await ensurePlatforms();await loadAll();await refreshMaintenance();toast('全部匯入資料已清空；登入帳號與 Authentication 未變更')}
async function rebuildProductIndex(){await deleteCollection('productIndex');for(let i=0;i<products.length;i+=400){const batch=writeBatch(db);products.slice(i,i+400).forEach(p=>{for(const [type,key] of [['spec',p.specManagementId],['product',p.productManagementId]]){if(key!==undefined&&key!==null&&String(key).trim()){const id=encodeURIComponent(`${type}_${String(key).trim()}`).replaceAll('%','_');batch.set(doc(db,'productIndex',id),{type,key:String(key).trim(),productId:p.id,updatedAt:serverTimestamp()})}}});await batch.commit()}toast(`商品索引重建完成：${products.length} 筆商品`)}
async function recalcDashboard(){const health=await runHealthCheck(false);const sales=await countCollection('sales'),ads=await countCollection('ads'),analysis=await countCollection('productAnalysis');await setDoc(doc(db,'settings','dashboardSummary'),{productCount:products.length,activeCount:products.filter(p=>p.active).length,totalUnits:products.reduce((s,p)=>s+n(p.unitsSold),0),salesCount:sales,adsCount:ads,analysisCount:analysis,unmatched:health,updatedAt:serverTimestamp()});toast('Dashboard 已重新計算')}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('loginEmail').value,$('loginPassword').value)}catch(err){$('loginError').textContent='登入失敗：'+err.message}});
$('logoutBtn').onclick=()=>signOut(auth);$('searchInput').oninput=()=>{page=1;renderAll()};$('statusFilter').onchange=()=>{page=1;renderAll()};$('prevPage').onclick=()=>{page--;renderTable()};$('nextPage').onclick=()=>{page++;renderTable()};
$('addProductBtn').onclick=()=>{renderProductForm({active:true});$('productDialog').showModal()};$('productForm').addEventListener('submit',async e=>{e.preventDefault();await saveProduct(e.currentTarget)});
$('productFields').addEventListener('click',e=>{const k=e.target.dataset.reset;if(!k)return;const input=e.target.closest('label').querySelector(`[name="${k}"]`);input.value='';e.target.dataset.cleared='true'});
$('tableBody').addEventListener('click',async e=>{const id=e.target.dataset.edit||e.target.dataset.delete;if(!id)return;if(e.target.dataset.edit){renderProductForm(products.find(p=>p.id===id));$('productDialog').showModal()}else if(confirm('確定刪除此商品？')){await deleteDoc(doc(db,'products',id));await loadAll();toast('已刪除')}});
$('openParamsBtn').onclick=()=>{$('paramsDialog').showModal()};$('paramsForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget), next={};PARAM_DEFS.forEach(([k])=>next[k]=Number(fd.get(k)));next.tiers=params.tiers.map((_,i)=>[Number(fd.get(`tierMax_${i}`)),Number(fd.get(`tierFee_${i}`))]).sort((a,b)=>a[0]-b[0]);await setDoc(doc(db,'settings','params'),{...next,updatedAt:serverTimestamp()});params={...params,...next};$('paramsDialog').close();await loadAll();toast('參數已更新')});
$('columnBtn').onclick=()=>{renderColumns();$('columnsDialog').showModal()};$('columnOptions').addEventListener('change',()=>{visibleColumns=[...$('columnOptions').querySelectorAll('input:checked')].map(x=>x.value);localStorage.setItem('visibleColumns',JSON.stringify(visibleColumns));renderTable()});$('selectDefaultColumns').onclick=()=>{visibleColumns=[...DEFAULT_COLUMNS];localStorage.setItem('visibleColumns',JSON.stringify(visibleColumns));renderColumns();renderTable()};
$('importBtn').onclick=importExcel;$('exportBtn').onclick=exportProducts;$('maintenanceBtn').onclick=async()=>{$('maintenanceDialog').showModal();await refreshMaintenance()};$('deleteSelectedBtn').onclick=deleteSelectedCollections;$('clearAllBtn').onclick=clearImportedData;$('rebuildIndexBtn').onclick=rebuildProductIndex;$('recalcDashboardBtn').onclick=recalcDashboard;$('healthCheckBtn').onclick=()=>runHealthCheck(true);document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
onAuthStateChanged(auth,async user=>{if(user){$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');$('userEmail').textContent=user.email;await loadAll()}else{$('appView').classList.add('hidden');$('loginView').classList.remove('hidden')}});
