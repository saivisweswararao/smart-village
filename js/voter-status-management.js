document.addEventListener('DOMContentLoaded', async () => {
 const $=id=>document.getElementById(id), msg=$('message'), cards=$('voter-cards');
 const client=window.supabaseClient;
 const STATUSES=['Verified','Not Verified','Equal','Not Required','Dead','Shifted outside','Duplicate'];
 let currentOffset=0,loading=false;
 const fail=text=>{msg.textContent=text;cards.innerHTML='<div class="empty-state">No records available.</div>';};
 if(!client){fail('Supabase is not configured.');return;}
 const {data:{session}}=await client.auth.getSession();
 if(!session){location.replace('admin.html');return;}
 const {data:isAdmin,error:accessError}=await client.rpc('admin_check_access');
 if(accessError||isAdmin!==true){await client.auth.signOut();location.replace('admin.html');return;}

 function voterCard(v){
  const card=document.createElement('article');card.className='voter-card';card.dataset.voterId=v.id;
  if(v.photo_url){const img=document.createElement('img');img.src=v.photo_url;img.alt='Voter record photograph';img.loading='lazy';img.className='voter-photo';card.append(img);}
  const title=document.createElement('h3');title.textContent=v.voter_name||'Name unavailable';card.append(title);
  const voterId=document.createElement('div');voterId.className='voter-id';voterId.textContent='Voter number: '+(v.voter_id||'Not available');card.append(voterId);
  const chips=document.createElement('div');chips.className='voter-meta';
  [`Ward ${v.ward_no}`,`Serial ${v.serial_no}`].forEach(t=>{const c=document.createElement('span');c.className='voter-chip';c.textContent=t;chips.append(c);});card.append(chips);
  const details=document.createElement('div');details.className='voter-details';
  [['Guardian',v.guardian_name],['Relationship',v.relationship],['Age',v.age],['Gender',v.gender],['House number',v.house_no]].forEach(([label,value])=>{const d=document.createElement('div');d.className='voter-detail';const sm=document.createElement('small');sm.textContent=label;const strong=document.createElement('strong');strong.textContent=value===null||value===undefined||value===''?'—':String(value);d.append(sm,strong);details.append(d);});card.append(details);
  const statusWrap=document.createElement('section');statusWrap.className='voter-status';
  const current=v.voter_status||'Not Verified';
  const statusLabel=document.createElement('small');statusLabel.textContent='Record status · current: '+current;statusWrap.append(statusLabel);
  const buttons=document.createElement('div');buttons.className='status-buttons';
  STATUSES.forEach(status=>{const b=document.createElement('button');b.type='button';b.className='status-button'+(status===current?' selected':'');b.dataset.status=status;b.textContent=status;b.setAttribute('aria-pressed',String(status===current));buttons.append(b);});
  statusWrap.append(buttons);const saving=document.createElement('div');saving.className='status-saving';saving.setAttribute('aria-live','polite');statusWrap.append(saving);card.append(statusWrap);
  return card;
 }
 async function refreshStatusCounts(){
  const {data,error}=await client.rpc('admin_voter_record_status_counts_filtered',{p_query:$('q').value.trim()||null,p_ward:$('ward').value?Number($('ward').value):null});
  const host=$('status-counts');host.replaceChildren();
  if(error){host.textContent='Status counts unavailable. Run database/voter-status-management.sql in Supabase.';return;}
  const counts=Object.fromEntries((data||[]).map(x=>[x.voter_status,Number(x.voter_count)]));
  const total=(data||[]).reduce((n,x)=>n+Number(x.voter_count),0);
  const all=document.createElement('button');all.type='button';all.className='status-count'+(!$('status-filter').value?' active':'');
  const allNumber=document.createElement('strong');allNumber.textContent=total;all.append(allNumber,document.createTextNode('All statuses'));
  all.addEventListener('click',()=>setStatusFilter(''));host.append(all);
  STATUSES.forEach(status=>{const b=document.createElement('button');b.type='button';b.className='status-count'+($('status-filter').value===status?' active':'');const count=document.createElement('strong');count.textContent=counts[status]||0;b.append(count,document.createTextNode(status));b.addEventListener('click',()=>setStatusFilter(status));host.append(b);});
 }
 function setStatusFilter(value){$('status-filter').value=value;refreshStatusCounts();load(true);}
 async function load(reset=true){
  if(loading)return;loading=true;
  if(reset){currentOffset=0;cards.replaceChildren();$('count').textContent='';}
  msg.textContent='Loading voter records…';
  const ward=$('ward').value?Number($('ward').value):null,status=$('status-filter').value||null;
  const {data,error}=await client.rpc('admin_search_voters_by_status',{p_query:$('q').value.trim()||null,p_ward:ward,p_status:status,p_limit:100,p_offset:currentOffset});
  if(error){fail('Voter search failed: '+error.message+' · Check the separate voter-status SQL migration.');loading=false;return;}
  const rows=data||[],paths=rows.filter(v=>v.photo_path).map(v=>v.photo_path.split('/').pop());let signedMap={};
  if(paths.length){const {data:signed,error:signedError}=await client.storage.from('penubaka-voter-photos').createSignedUrls(paths,3600);if(!signedError)(signed||[]).forEach(x=>{if(x.path&&x.signedUrl)signedMap[x.path]=x.signedUrl;});}
  rows.forEach(v=>{v.photo_url=signedMap[v.photo_path?.split('/').pop()]||null;cards.append(voterCard(v));});
  if(!rows.length&&reset)cards.innerHTML='<div class="empty-state">No voter records found. Try another search or filter.</div>';
  currentOffset+=rows.length;$('load-more').hidden=rows.length<100;$('count').textContent=currentOffset?'Showing '+currentOffset+' voter records'+(rows.length===100?' · more available':''):'';
  msg.textContent='';loading=false;
 }
 cards.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-status]');if(!button)return;
  const card=button.closest('.voter-card');if(!card||button.classList.contains('selected'))return;
  const status=button.dataset.status;if(!STATUSES.includes(status))return;
  const buttons=[...card.querySelectorAll('.status-button')],saving=card.querySelector('.status-saving'),label=card.querySelector('.voter-status small');
  buttons.forEach(b=>b.disabled=true);saving.textContent='Saving…';
  const {error}=await client.rpc('admin_update_voter_record_status',{p_voter_id:card.dataset.voterId,p_status:status});
  if(error){saving.textContent='Could not save: '+error.message;buttons.forEach(b=>b.disabled=false);return;}
  label.textContent='Record status · current: '+status;
  buttons.forEach(b=>{const active=b.dataset.status===status;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));b.disabled=false;});
  saving.textContent='Saved';await refreshStatusCounts();
  if($('status-filter').value&&$('status-filter').value!==status)await load(true);
 });
 $('load-more').addEventListener('click',()=>load(false));
 $('search').addEventListener('click',()=>{refreshStatusCounts();load(true);});
 $('q').addEventListener('keydown',e=>{if(e.key==='Enter'){refreshStatusCounts();load(true);}});
 $('ward').addEventListener('change',()=>{refreshStatusCounts();load(true);});
 $('status-filter').addEventListener('change',()=>load(true));
 $('sign-out').addEventListener('click',async()=>{await client.auth.signOut();location.replace('admin.html');});
 await refreshStatusCounts();await load();
});