document.addEventListener('DOMContentLoaded', async () => {
 const $=id=>document.getElementById(id), msg=$('message'), body=$('rows');
 const client=window.supabaseClient;
 const fail=text=>{msg.textContent=text;body.innerHTML='<tr><td colspan="7">No records available.</td></tr>';};
 if(!client){fail('Supabase is not configured.');return;}
 const {data:{session}}=await client.auth.getSession();
 if(!session){location.replace('admin.html');return;}
 const {data:profile,error:profileError}=await client.from('admin_profiles').select('role').eq('user_id',session.user.id).maybeSingle();
 if(profileError||profile?.role!=='admin'){await client.auth.signOut();location.replace('admin.html');return;}
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