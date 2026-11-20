(()=>{'use strict';
const rows=[
{year:'2020–21',opening:3927913.23,receipts:2581625,gross:3944237,rejected:0},
{year:'2021–22',opening:0,receipts:451374,gross:1331123,rejected:0},
{year:'2022–23',opening:0,receipts:958789,gross:701007,rejected:0},
{year:'2023–24',opening:0,receipts:2136964,gross:1957210,rejected:72000},
{year:'2024–25',opening:0,receipts:1316074,gross:1364566,rejected:0},
{year:'2025–26',opening:0,receipts:1073819,gross:1456192,rejected:36000},
{year:'2026–27*',opening:0,receipts:0,gross:72000,rejected:0}
];
// Carry forward opening balances from the previous calculated closing balance.
rows.forEach((r,i)=>{if(i>0)r.opening=rows[i-1].closing;r.adjusted=r.gross-r.rejected;r.closing=r.opening+r.receipts-r.adjusted;});
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const compact=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const el=id=>document.getElementById(id);
el('pf-year').textContent=new Date().getFullYear();
const latest=rows[rows.length-1],totalRejected=rows.reduce((s,r)=>s+r.rejected,0);
el('pf-latest-balance').textContent=money(latest.closing);
el('pf-latest-receipts').textContent=compact(latest.receipts);
el('pf-latest-payments').textContent=compact(latest.adjusted);
el('pf-rejected-total').textContent=compact(totalRejected);
const tbody=el('pf-table-body'),filter=el('pf-year-filter');
rows.forEach((r,i)=>{const opt=document.createElement('option');opt.value=String(i);opt.textContent=r.year;filter.append(opt);const tr=document.createElement('tr');if(i===rows.length-1)tr.className='current';[r.year,money(r.opening),money(r.receipts),money(r.gross),money(r.rejected),money(r.adjusted),money(r.closing)].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});tbody.append(tr);});
filter.addEventListener('change',()=>{[...tbody.rows].forEach((tr,i)=>{tr.style.outline=filter.value==='all'||Number(filter.value)!==i?'none':'2px solid #39845b';tr.style.outlineOffset='-2px';});});
const adjustments=el('pf-adjustments');
rows.filter(r=>r.rejected>0).forEach(r=>{const card=document.createElement('div');card.className='pf-adjust';const strong=document.createElement('strong');strong.textContent=r.year+' · '+money(r.rejected);const span=document.createElement('span');span.textContent='Failed payments removed from total spending';card.append(strong,span);adjustments.append(card);});
if(!adjustments.children.length)adjustments.textContent='No rejected-payment adjustments recorded.';
if(window.Chart){const labels=rows.map(r=>r.year);new Chart(el('pf-receipts-chart'),{type:'bar',data:{labels,datasets:[{label:'Money received',data:rows.map(r=>r.receipts),backgroundColor:'#39845b'},{label:'Money spent',data:rows.map(r=>r.adjusted),backgroundColor:'#e0a044'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c=>c.dataset.label+': '+money(c.raw)}}},scales:{y:{beginAtZero:true,ticks:{callback:v=>'₹'+Number(v).toLocaleString('en-IN')}}}}});
new Chart(el('pf-balance-chart'),{type:'line',data:{labels,datasets:[{label:'Remaining balance',data:rows.map(r=>r.closing),borderColor:'#176b45',backgroundColor:'rgba(23,107,69,.12)',fill:true,tension:.25,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c=>money(c.raw)}}},scales:{y:{ticks:{callback:v=>'₹'+Number(v).toLocaleString('en-IN')}}}}});
new Chart(el('pf-net-chart'),{type:'bar',data:{labels,datasets:[{label:'Money left over (+) / short (−)',data:rows.map(r=>r.receipts-r.adjusted),backgroundColor:rows.map(r=>r.receipts-r.adjusted>=0?'#39845b':'#d97757')}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c=>money(c.raw)}}},scales:{y:{ticks:{callback:v=>'₹'+Number(v).toLocaleString('en-IN')}}}}});}
})();