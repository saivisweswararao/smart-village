document.addEventListener('DOMContentLoaded',async()=>{
  const target=document.getElementById('content-list');
  if(!target)return;
  if(!window.supabaseClient){target.textContent='Supabase configuration is unavailable. Please check js/config.js.';return;}

  // Cloudflare may serve this page through either /announcements or /announcements.html.
  const pathName=location.pathname.split('/').pop();
  const page=pathName==='announcements'?'announcements.html':pathName;
  const map={
    'announcements.html':['announcements','status','published','created_at'],
    'schemes.html':['schemes','status','published','created_at'],
    'services.html':['service_listings','is_approved',true,'created_at'],
    'development.html':['public_works','is_published',true,'created_at']
  };
  const conf=map[page];
  if(!conf)return;

  try{
    let data;
    if(page==='announcements.html'){
      const {data:rows,error}=await window.supabaseClient.rpc('get_public_announcements',{p_village_slug:'penubaka'});
      if(error)throw new Error('Announcements could not be loaded: '+error.message);
      data=rows||[];
    }else{
      const {data:village,error:villageError}=await window.supabaseClient.from('villages').select('id')
        .eq('slug','penubaka').eq('is_active',true).maybeSingle();
      if(villageError)throw new Error('Could not verify Penubaka village: '+villageError.message);
      if(!village)throw new Error('Penubaka village is missing or inactive.');
      const [table,field,value,sort]=conf;
      let q=window.supabaseClient.from(table).select('*').eq('village_id',village.id).eq(field,value).order(sort,{ascending:false}).limit(100);
      if(table==='service_listings')q=q.eq('owner_consent',true);
      const {data:rows,error}=await q;
      if(error)throw new Error('Database read failed: '+error.message);
      data=rows||[];
    }

    if(!data.length){
      target.textContent=page==='announcements.html'?'No announcements have been published yet.':'No published items yet.';
      return;
    }

    target.replaceChildren(...data.map(row=>{
      const card=document.createElement('article');
      card.className='announcement-card';
      if(page==='announcements.html'){
        if(row.photo_url){
          const img=document.createElement('img');
          img.className='announcement-photo';
          img.src=row.photo_url;
          img.alt=row.title_en||'Village announcement photo';
          img.loading='lazy';
          card.append(img);
        }
        const title=document.createElement('h3');
        title.className='announcement-title';
        title.textContent=row.title_en||'Village announcement';
        const body=document.createElement('p');
        body.className='announcement-body';
        body.textContent=row.body_en||'';
        card.append(title,body);
        const dateValue=row.published_at||row.created_at;
        if(dateValue){
          const date=document.createElement('small');
          date.className='muted announcement-date';
          date.textContent=new Date(dateValue).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
          card.append(date);
        }
      }else{
        const h=document.createElement('h3');
        h.textContent=row.title_te||row.title_en||row.name||'Village update';
        const p=document.createElement('p');
        p.textContent=row.body_te||row.description_te||row.body_en||row.description_en||'';
        card.append(h,p);
        if(row.source_url){
          const a=document.createElement('a');
          a.href=row.source_url;
          a.rel='noopener noreferrer';
          a.target='_blank';
          a.textContent='Official source / వివరాలు';
          card.append(a);
        }
      }
      return card;
    }));
  }catch(error){
    console.error('Could not load '+page+':',error);
    target.textContent=error.message||'Could not load published items.';
  }
});
