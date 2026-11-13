document.addEventListener('DOMContentLoaded',async()=>{
  const target=document.getElementById('content-list');
  if(!target)return;
  if(!window.supabaseClient){
    target.innerHTML='<p class="muted">Connect Supabase in js/config.js to load published information.</p>';
    return;
  }
  const page=location.pathname.split('/').pop();
  const map={
    'announcements.html':['announcements','status','published','published_at'],
    'schemes.html':['schemes','status','published','created_at'],
    'services.html':['service_listings','is_approved',true,'created_at'],
    'development.html':['public_works','is_published',true,'created_at']
  };
  const conf=map[page];
  if(!conf)return;
  const [table,field,value,sort]=conf;
  let q=window.supabaseClient.from(table).select('*').eq(field,value).order(sort,{ascending:false}).limit(50);
  if(table==='service_listings')q=q.eq('owner_consent',true);
  const {data,error}=await q;
  if(error){
    console.error('Could not load '+table+':',error.message);
    target.innerHTML='<p class="muted">Could not load published items. Please try again later.</p>';
    return;
  }
  if(!data?.length){
    target.innerHTML='<p class="muted">No published items yet.</p>';
    return;
  }
  target.replaceChildren(...data.map(row=>{
    const card=document.createElement('article');
    card.className='announcement-card';
    if(table==='announcements'){
      const titleTe=document.createElement('h3');
      titleTe.className='announcement-title-te';
      titleTe.textContent=row.title_te||'';
      const titleEn=document.createElement('h3');
      titleEn.className='announcement-title-en';
      titleEn.textContent=row.title_en||'';
      if(titleTe.textContent)card.append(titleTe);
      if(titleEn.textContent)card.append(titleEn);
      const bodyTe=document.createElement('p');
      bodyTe.className='announcement-body-te';
      bodyTe.textContent=row.body_te||'';
      const bodyEn=document.createElement('p');
      bodyEn.className='announcement-body-en';
      bodyEn.textContent=row.body_en||'';
      if(bodyTe.textContent)card.append(bodyTe);
      if(bodyEn.textContent)card.append(bodyEn);
      if(row.published_at){
        const date=document.createElement('small');
        date.className='muted announcement-date';
        date.textContent=new Date(row.published_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
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
});