document.addEventListener('DOMContentLoaded',async()=>{
  const target=document.getElementById('content-list');
  if(!target)return;
  if(!window.supabaseClient){target.textContent='Connect Supabase in js/config.js to load published information.';return;}
  const page=location.pathname.split('/').pop();
  const map={
    'announcements.html':['announcements','status','published','published_at'],
    'schemes.html':['schemes','status','published','created_at'],
    'services.html':['service_listings','is_approved',true,'created_at'],
    'development.html':['public_works','is_published',true,'created_at']
  };
  const conf=map[page];
  if(!conf)return;
  try{
    const {data:village,error:villageError}=await window.supabaseClient.from('villages')
      .select('id').eq('slug','penubaka').eq('is_active',true).single();
    if(villageError||!village)throw new Error('Penubaka village record was not found.');
    const [table,field,value,sort]=conf;
    let q=window.supabaseClient.from(table).select('*').eq('village_id',village.id)
      .eq(field,value).order(sort,{ascending:false}).limit(100);
    if(table==='service_listings')q=q.eq('owner_consent',true);
    const {data,error}=await q;
    if(error)throw error;
    if(!data?.length){target.textContent='No published items yet.';return;}
    target.replaceChildren(...data.map(row=>{
      const card=document.createElement('article');card.className='announcement-card';
      if(table==='announcements'){
        const titleTe=document.createElement('h3');titleTe.className='announcement-title-te';titleTe.textContent=row.title_te||'';
        const titleEn=document.createElement('h3');titleEn.className='announcement-title-en';titleEn.textContent=row.title_en||'';
        if(titleTe.textContent)card.append(titleTe);if(titleEn.textContent)card.append(titleEn);
        const bodyTe=document.createElement('p');bodyTe.className='announcement-body-te';bodyTe.textContent=row.body_te||'';
        const bodyEn=document.createElement('p');bodyEn.className='announcement-body-en';bodyEn.textContent=row.body_en||'';
        if(bodyTe.textContent)card.append(bodyTe);if(bodyEn.textContent)card.append(bodyEn);
        const dateValue=row.published_at||row.created_at;
        if(dateValue){const date=document.createElement('small');date.className='muted announcement-date';date.textContent=new Date(dateValue).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});card.append(date);}
      }else{
        const h=document.createElement('h3');h.textContent=row.title_te||row.title_en||row.name||'Village update';
        const p=document.createElement('p');p.textContent=row.body_te||row.description_te||row.body_en||row.description_en||'';
        card.append(h,p);
        if(row.source_url){const a=document.createElement('a');a.href=row.source_url;a.rel='noopener noreferrer';a.target='_blank';a.textContent='Official source / వివరాలు';card.append(a);}
      }
      return card;
    }));
  }catch(error){console.error('Could not load '+page+':',error);target.textContent='Could not load published items. Please refresh or try again later.';}
});