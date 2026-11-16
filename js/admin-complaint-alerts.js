(function(){
"use strict";
const url=window.SUPABASE_URL,key=window.SUPABASE_PUBLISHABLE_KEY,client=window.supabaseClient;
const status=document.getElementById("private-alert-status"),button=document.getElementById("enable-private-alert");
function say(s,bad){status.textContent=s;status.style.color=bad?"#a12b2b":"#176b4d";}
function bytes(v){const p="=".repeat((4-v.length%4)%4),raw=atob((v+p).replace(/-/g,"+").replace(/_/g,"/")),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a;}
async function call(body,token){const r=await fetch(url+"/functions/v1/push-notifications-v2",{method:"POST",headers:{"Content-Type":"application/json","apikey":key,"Authorization":"Bearer "+token},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw new Error(d.error||"Push service error "+r.status);return d;}
async function init(){if(!client){say("Website configuration is unavailable.",true);button.disabled=true;return;}const {data:{session}}=await client.auth.getSession();if(!session){say("Please sign in through the Admin portal first.",true);button.disabled=true;return;}const {data:allowed,error}=await client.rpc("admin_check_access");if(error||allowed!==true){say("Administrator access could not be verified.",true);button.disabled=true;return;}button.disabled=false;say("This page is restricted to an authorised administrator. Register this phone to receive private complaint alerts.");}
button.addEventListener("click",async()=>{button.disabled=true;try{
if(!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window))throw new Error("This browser does not support Web Push. Please use the latest Chrome or Edge. On iPhone, use Safari and add this website to the Home Screen first.");
if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!((matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true))throw new Error("On iPhone/iPad, add this site to the Home Screen and open it from that icon before registering.");
const {data:{session}}=await client.auth.getSession();if(!session)throw new Error("Admin session expired. Sign in again.");
const cfg=await call({action:"config"},key);
const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});await navigator.serviceWorker.ready;
const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();if(permission!=="granted")throw new Error("Notification permission was not granted. Enable it in browser site settings.");
let sub=await registration.pushManager.getSubscription();if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(cfg.vapidPublicKey)});
const result=await call({action:"register-complaint-device",subscription:sub.toJSON()},session.access_token);
say(result.message||"This phone is now registered for private complaint alerts.");button.textContent="Private complaint alerts enabled ✓";
}catch(e){console.error(e);say(e.message||"Could not register this device.",true);}finally{button.disabled=false;}});
init().catch(e=>say(e.message||"Could not verify admin access.",true));
})();