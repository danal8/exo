const install=document.querySelector('#installPwa'),help=document.querySelector('#installHelp');
const standalone=matchMedia('(display-mode: standalone)');
let promptEvent;
function installed(){return standalone.matches||navigator.standalone===true}
function sync(){install.hidden=installed()}
sync();standalone.addEventListener('change',sync);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;sync()});
window.addEventListener('appinstalled',()=>{promptEvent=null;install.hidden=true;help.close()});
install.addEventListener('click',async()=>{
 if(installed()){sync();return}
 if(promptEvent){const event=promptEvent;promptEvent=null;await event.prompt();await event.userChoice;sync()}
 else help.showModal();
});
document.querySelector('#installHelpClose').onclick=()=>help.close();
help.addEventListener('click',event=>{if(event.target===help)help.close()});
const toggle=document.querySelector('#filterToggle'),panel=document.querySelector('#extraFilters');
toggle.onclick=()=>{const expanded=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(expanded));panel.classList.toggle('is-open',expanded)};
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('PWA registration:',error));
