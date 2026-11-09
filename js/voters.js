document.addEventListener('DOMContentLoaded', async () => {
 const $=id=>document.getElementById(id), msg=$('message'), cards=$('voter-cards');
 const client=window.supabaseClient;
 const fail=text=>{msg.textContent=text;cards.innerHTML='<div class="empty-state">No records available.</div>';};
 if(!client){fail('Supabase is not configured.');return;}
 const {data:{session}}=await client.auth.getSession();
 if(!session){location.replace('admin.html');return;}
 const {data:isAdmin,error:accessError}=await client.rpc('admin_check_access');
 if(accessError||isAdmin!==true){await client.auth.signOut();location.replace('admin.html');return;}

 const importButton=$('import-voters');
 importButton.addEventListener('click',async()=>{
  const jsonFile=$('voter-json').files[0],zipFile=$('voter-photos').files[0],progress=$('import-progress');
  if(!jsonFile||!zipFile){progress.textContent='Select both the JSON file and the photographs ZIP.';return;}
  if(!window.JSZip){progress.textContent='ZIP support did not load. Refresh and retry.';return;}
  importButton.disabled=true;
  try{
   progress.textContent='Reading UTF-8 JSON and cleaning unsupported null characters…';
   const rawText=new TextDecoder('utf-8',{fatal:true}).decode(await jsonFile.arrayBuffer()).replace(/^\\uFEFF/,'');
   const records=JSON.parse(rawText);
   if(!Array.isArray(records)||records.length===0||records.length>5000)throw new Error('The JSON must contain a non-empty array of no more than 5,000 voter records.');
   // PostgreSQL jsonb/text cannot store U+0000. Remove null characters from OCR text fields.
   const textFields=['voter_name','guardian_name','relationship','house_no','voter_id','photo_path'];
   let cleanedCharacters=0;
   for(const record of records){for(const field of textFields){if(typeof record[field]==='string'){const cleaned=record[field].replace(/\\u0000/g,'').trim();if(cleaned!==record[field])cleanedCharacters++;record[field]=cleaned||null;}}}
   const invalid=records.findIndex(r=>!Number.isInteger(Number(r.ward_no))||!Number.isInteger(Number(r.serial_no))||Number(r.ward_no)<1||Number(r.ward_no)>12||Number(r.serial_no)<1||!r.voter_name);
   if(invalid>=0)throw new Error('Invalid required voter data at JSON record '+(invalid+1)+'. Check ward, serial number and voter name.');
   const zip=await JSZip.loadAsync(zipFile);
   const photoRecords=records.filter(v=>v.photo_path);
   const entries=photoRecords.map(record=>({record,entry:zip.file('photos/'+record.photo_path.split('/').pop())}));
   const missing=entries.filter(x=>!x.entry);
   if(missing.length)throw new Error(missing.length+' photo files are missing from ZIP. Nothing was imported.');
   progress.textContent='Uploading '+entries.length+' private photographs. Keep this page open…';
   let completed=0,cursor=0,failures=[];
   async function worker(){while(cursor<entries.length){const item=entries[cursor++];try{const blob=await item.entry.async('blob');const key=item.record.photo_path.split('/').slice(1).join('/');let res=await client.storage.from('penubaka-voter-photos').upload(key,blob,{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});if(res.error)res=await client.storage.from('penubaka-voter-photos').upload(key,blob,{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});if(res.error)throw res.error;}catch(e){failures.push({path:item.record.photo_path,error:e.message||String(e)});}completed++;if(completed%20===0||completed===entries.length)progress.textContent='Private photo upload: '+completed+' / '+entries.length+' · errors: '+failures.length;}}
   await Promise.all(Array.from({length:4},worker));
   if(failures.length)throw new Error(failures.length+' photos failed. Record import stopped; retry with the same files.');
   progress.textContent='Photos uploaded. Importing '+records.length+' voter details…'+(cleanedCharacters?' Cleaned unsupported null characters in '+cleanedCharacters+' text fields.':'');
   let imported=0;
   for(let i=0;i<records.length;i+=200){const {data,error}=await client.rpc('admin_import_voters',{p_rows:records.slice(i,i+200)});if(error)throw error;imported+=Number(data||0);progress.textContent='Record import: '+Math.min(i+200,records.length)+' / '+records.length;}
   progress.textContent='Completed: '+entries.length+' private photos uploaded; '+imported+' voter records imported.';
   $('voter-json').value='';$('voter-photos').value='';await load();
   const {data:stats}=await client.rpc('admin_voter_stats');if(stats?.length){const s=stats[0];$('total').textContent=s.total_voters;$('male').textContent=s.male_voters;$('female').textContent=s.female_voters;$('wards').textContent=s.wards_count;}
  }catch(e){progress.textContent='Import stopped: '+(e.message||String(e));}
  finally{importButton.disabled=false;}
 });
 let currentOffset=0,loading=false;
 function voterCard(v){const card=document.createElement('article');card.className='voter-card';
  if(v.photo_url){const img=document.createElement('img');img.src=v.photo_url;img.alt='Voter record photograph';img.loading='lazy';img.className='voter-photo';card.append(img);}
  const title=document.createElement('h3');title.textContent=v.voter_name||'Name unavailable';card.append(title);
  const voterId=document.createElement('div');voterId.className='voter-id';voterId.textContent='Voter number: '+(v.voter_id||'Not available');card.append(voterId);const chips=document.createElement('div');chips.className='voter-meta';[`Ward ${v.ward_no}`,`Serial ${v.serial_no}`].forEach(t=>{const c=document.createElement('span');c.className='voter-chip';c.textContent=t;chips.append(c);});card.append(chips);const details=document.createElement('div');details.className='voter-details';[['Guardian',v.guardian_name],['Relationship',v.relationship],['Age',v.age],['Gender',v.gender],['House number',v.house_no]].forEach(([label,value])=>{const d=document.createElement('div');d.className='voter-detail';const sm=document.createElement('small');sm.textContent=label;const strong=document.createElement('strong');strong.textContent=value===null||value===undefined||value===''?'—':String(value);d.append(sm,strong);details.append(d);});card.append(details);return card;}
 async function load(reset=true){if(loading)return;loading=true;if(reset){currentOffset=0;cards.replaceChildren();$('count').textContent='';}msg.textContent='Loading voter records…';const ward=$('ward').value?Number($('ward').value):null;const {data,error}=await client.rpc('admin_search_voters',{p_query:$('q').value.trim()||null,p_ward:ward,p_limit:100,p_offset:currentOffset});if(error){fail('Voter search failed: '+error.message);loading=false;return;}
  const rows=data||[];
  const paths=rows.filter(v=>v.photo_path).map(v=>v.photo_path.split('/').pop());
  let signedMap={};
  if(paths.length){const {data:signed,error:signedError}=await client.storage.from('penubaka-voter-photos').createSignedUrls(paths,3600);if(!signedError)(signed||[]).forEach(x=>{if(x.path&&x.signedUrl)signedMap[x.path]=x.signedUrl;});}
  rows.forEach(v=>{v.photo_url=signedMap[v.photo_path?.split('/').pop()]||null;cards.append(voterCard(v));});
  if(!rows.length&&reset)cards.innerHTML='<div class="empty-state">No voters found. Try another name.</div>';currentOffset+=data?.length||0;$('load-more').hidden=(data?.length||0)<100;$('count').textContent=currentOffset?'Showing '+currentOffset+' voter records'+((data?.length||0)===100?' · more available':''):'';msg.textContent='';loading=false;}
 $('load-more').addEventListener('click',()=>load(false));
 const {data:stats,error:statsError}=await client.rpc('admin_voter_stats');
 if(!statsError&&stats?.length){const s=stats[0];$('total').textContent=s.total_voters;$('male').textContent=s.male_voters;$('female').textContent=s.female_voters;$('wards').textContent=s.wards_count;}
 $('search').addEventListener('click',()=>load(true));
 $('q').addEventListener('keydown',e=>{if(e.key==='Enter')load(true);});
 $('ward').addEventListener('change',()=>load(true));
 $('sign-out').addEventListener('click',async()=>{await client.auth.signOut();location.replace('admin.html');});
 await load();
});