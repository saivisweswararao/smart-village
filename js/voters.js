document.addEventListener('DOMContentLoaded', async () => {
 const $=id=>document.getElementById(id), msg=$('message'), body=$('rows');
 const client=window.supabaseClient;
 const fail=text=>{msg.textContent=text;body.innerHTML='<tr><td colspan="7">No records available.</td></tr>';};
 if(!client){fail('Supabase is not configured.');return;}
 const {data:{session}}=await client.auth.getSession();
 if(!session){location.replace('admin.html');return;}
 const {data:profile,error:profileError}=await client.from('admin_profiles').select('role').eq('user_id',session.user.id).maybeSingle();
 if(profileError||profile?.role!=='admin'){await client.auth.signOut();location.replace('admin.html');return;}

 const importButton=$('import-voters');
 importButton.addEventListener('click',async()=>{
  const jsonFile=$('voter-json').files[0],zipFile=$('voter-photos').files[0],progress=$('import-progress');
  if(!jsonFile||!zipFile){progress.textContent='Select both the JSON file and the photographs ZIP.';return;}
  if(!window.JSZip){progress.textContent='ZIP support did not load. Refresh and retry.';return;}
  importButton.disabled=true;
  try{
   progress.textContent='Reading and validating private files…';
   const records=JSON.parse(await jsonFile.text());
   if(!Array.isArray(records)||records.length!==2811)throw new Error('Expected exactly 2,811 records. Nothing was imported.');
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
   progress.textContent='Photos uploaded. Importing voter details…';
   let imported=0;
   for(let i=0;i<records.length;i+=200){const {data,error}=await client.rpc('admin_import_voters',{p_rows:records.slice(i,i+200)});if(error)throw error;imported+=Number(data||0);progress.textContent='Record import: '+Math.min(i+200,records.length)+' / '+records.length;}
   progress.textContent='Completed: '+entries.length+' private photos uploaded; '+imported+' voter records imported.';
   $('voter-json').value='';$('voter-photos').value='';await load();
   const {data:stats}=await client.rpc('admin_voter_stats');if(stats?.length){const s=stats[0];$('total').textContent=s.total_voters;$('male').textContent=s.male_voters;$('female').textContent=s.female_voters;$('wards').textContent=s.wards_count;}
  }catch(e){progress.textContent='Import stopped: '+(e.message||String(e));}
  finally{importButton.disabled=false;}
 });
 async function load(){
   msg.textContent='Loading…';
   const ward=$('ward').value?Number($('ward').value):null;
   const {data,error}=await client.rpc('admin_search_voters',{p_query:$('q').value.trim()||null,p_ward:ward,p_limit:100,p_offset:0});
   if(error){fail('Voter search is not ready. Run database/voter-management.sql in Supabase SQL Editor, then try again.');return;}
   body.replaceChildren();
   if(!data?.length){body.innerHTML='<tr><td colspan="7">No matching records. Import records after validating the source data.</td></tr>';}
   else data.forEach(v=>{
     const tr=document.createElement('tr');
     [v.ward_no,v.serial_no,v.voter_name,[v.guardian_name,v.relationship].filter(Boolean).join(' · '),v.age??'—',v.gender??'—',v.house_no??'—'].forEach(value=>{const td=document.createElement('td');td.textContent=String(value??'—');tr.append(td);});
     body.append(tr);
   });
   $('count').textContent=data?.length?('Showing '+data.length+' records (maximum 100 per search).'):'';
   msg.textContent='';
 }
 const {data:stats,error:statsError}=await client.rpc('admin_voter_stats');
 if(!statsError&&stats?.length){const s=stats[0];$('total').textContent=s.total_voters;$('male').textContent=s.male_voters;$('female').textContent=s.female_voters;$('wards').textContent=s.wards_count;}
 $('search').addEventListener('click',load);
 $('q').addEventListener('keydown',e=>{if(e.key==='Enter')load();});
 $('ward').addEventListener('change',load);
 $('sign-out').addEventListener('click',async()=>{await client.auth.signOut();location.replace('admin.html');});
 await load();
});