// THE FOX — Telegram Mini App / web client
const tg = window.Telegram?.WebApp || null;
const isFallbackMode = window.telegramFallback || !tg;
if (tg && !isFallbackMode) {
  try {
    tg.ready(); tg.expand?.();
    tg.setHeaderColor?.('#0B0E12'); tg.setBackgroundColor?.('#0B0E12');
  } catch (e) { console.warn('Telegram WebApp init:', e); }
}

const haptic = (style='light') => { try { if (tg?.HapticFeedback && !isFallbackMode) tg.HapticFeedback.impactOccurred(style); } catch(_){} };
const openLink = (url) => { if (!url) return; try { if (tg?.openLink && !isFallbackMode) return tg.openLink(url); } catch(_){} window.open(url,'_blank','noopener,noreferrer'); };
const stripHTML = (s='') => { const d=document.createElement('div'); d.innerHTML=s; return (d.textContent||'').replace(/\s+/g,' ').trim(); };
const esc = (s='') => String(s).replace(/[&<>'"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
const sleep = ms => new Promise(r=>setTimeout(r,ms));

// RAWG still needs a key. Replace this demo key with your own for production.
const RAWG_KEY = '3d423ceea09d4b4d879d50e7585b20a6';
const RAWG_BASE = 'https://api.rawg.io/api';
const GAMERPOWER_BASE = 'https://www.gamerpower.com/api';
const CHEAPSHARK_BASE = 'https://www.cheapshark.com/api/1.0';
const F2G_BASE = 'https://www.freetogame.com/api';
const MYMEMORY_BASE = 'https://api.mymemory.translated.net/get';

async function fetchJSON(url, timeout=8500) {
  const c = new AbortController();
  const t = setTimeout(()=>c.abort(),timeout);
  try {
    const r = await fetch(url,{signal:c.signal,headers:{'Accept':'application/json'}});
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function withProxyFallback(url, timeout=8000) {
  try { return await fetchJSON(url, timeout); }
  catch (e) {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    return await fetchJSON(proxy, timeout+2500);
  }
}

const STORE_NAMES = { '1':'Steam','3':'Amazon','4':'GamersGate','5':'Green Man Gaming','7':'GOG','8':'EA App','9':'Ubisoft','11':'Gamesplanet','13':'Epic Games','15':'Microsoft Store','24':'Humble Bundle' };
const TAG_LABEL = { new:'НОВОЕ', free:'РАЗДАЧА', f2p:'F2P', deal:'СКИДКА', discover:'' };
const TAG_CLASS = { free:'tag-free', f2p:'tag-f2p', deal:'tag-deal' };
const PLACEHOLDER = 'linear-gradient(135deg,rgba(200,255,61,.16),rgba(94,231,255,.08))';

function mapRawg(g, tag='new') {
  return { id:`rawg-${g.id}`, rawgId:g.id, title:g.name||'Без названия', image:g.background_image||'', url:`https://rawg.io/games/${g.slug||g.id}`,
    genres:(g.genres||[]).map(x=>x.name), rating:Number(g.rating)||0, released:g.released||'', platforms:(g.platforms||[]).map(x=>x.platform?.name).filter(Boolean), tag };
}
function mapGiveaway(x) {
  const platforms = String(x.platforms||'PC');
  const link=x.open_giveaway_url||x.open_url||x.gamerpower_url||'';
  let store='PC'; const l=link.toLowerCase();
  if(l.includes('steampowered')) store='Steam'; else if(l.includes('epicgames')) store='Epic Games'; else if(l.includes('gog.com')) store='GOG'; else if(l.includes('itch.io')) store='itch.io';
  return { id:`gp-${x.id}`, title:x.title||'Без названия', image:x.image||x.thumbnail||'', url:link, store, genres:[x.type||'game'], tag:'free', normalPrice:x.worth||'0', salePrice:'0', description:x.description||'', instructions:x.instructions||'', platforms:[platforms], source:'GamerPower' };
}
function mapF2P(x) {
  return { id:`f2g-${x.id}`, title:x.title||'Без названия', image:x.thumbnail||'', url:x.game_url||x.freetogame_profile_url||'', store:x.platform||'PC', genres:[x.genre||'Free-to-play'], tag:'f2p', salePrice:'0', normalPrice:'0', description:x.short_description||'', released:x.release_date||'', source:'FreeToGame' };
}
function mapDeal(d) {
  return { id:`deal-${d.dealID}`, title:d.title||'Без названия', image:d.thumb||'', url:`https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d.dealID)}`,
    store:STORE_NAMES[d.storeID]||'Магазин', tag:'deal', salePrice:d.salePrice||'0', normalPrice:d.normalPrice||'0', savings:Number(d.savings)||0, metacritic:d.metacriticScore?Number(d.metacriticScore):null, steamAppID:d.steamAppID||null, source:'CheapShark' };
}

async function epicFreeGames() {
  const url='https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=ru-RU&country=NL&allowCountries=NL';
  try {
    const data=await fetchJSON(url,6500); const els=data?.data?.Catalog?.searchStore?.elements||[]; const now=Date.now();
    return els.filter(el=>(el.promotions?.promotionalOffers||[]).flatMap(b=>b.promotionalOffers||[]).some(o=>new Date(o.startDate).getTime()<=now && now<=new Date(o.endDate).getTime() && o.discountSetting?.discountPercentage===0)).map(el=>{
      const images=el.keyImages||[]; const image=(images.find(i=>i.type==='OfferImageWide')||images.find(i=>i.type==='Thumbnail')||images[0]||{}).url||'';
      const slug=el.productSlug||el.offerMappings?.[0]?.pageSlug||el.catalogNs?.mappings?.[0]?.pageSlug||'';
      const price=el.price?.totalPrice?.originalPrice ? (el.price.totalPrice.originalPrice/100).toFixed(2) : '0';
      return {id:`epic-${el.id||slug}`,title:el.title||'Epic Games',image,url:slug?`https://store.epicgames.com/ru/p/${slug}`:'https://store.epicgames.com/ru/free-games',store:'Epic Games',tag:'free',salePrice:'0',normalPrice:price,description:stripHTML(el.description||''),source:'Epic Games'};
    });
  } catch(e) { console.warn('Epic:',e); return []; }
}

const translationCache = JSON.parse(localStorage.getItem('thefox_translation_cache')||'{}');
function isCyrillic(text=''){ return /[А-Яа-яЁё]/.test(text); }
async function translateToRu(text='') {
  const cleaned=stripHTML(text).slice(0,420); if(!cleaned || isCyrillic(cleaned)) return cleaned;
  if(translationCache[cleaned]) return translationCache[cleaned];
  const url=`${MYMEMORY_BASE}?q=${encodeURIComponent(cleaned)}&langpair=en|ru`;
  try {
    const d=await fetchJSON(url,5500); const tr=stripHTML(d?.responseData?.translatedText||'');
    if(tr && !/NO QUERY SPECIFIED/i.test(tr)) { translationCache[cleaned]=tr; localStorage.setItem('thefox_translation_cache',JSON.stringify(translationCache)); return tr; }
  } catch(_) {}
  return cleaned;
}

function gameRelated(title='', summary='') {
  const t=`${title} ${summary}`.toLowerCase();
  const good=['game','gaming','steam','epic','playstation','xbox','nintendo','игр','dlc','patch','update','rpg','fps','indie','раздач','скидк','релиз'];
  const bad=['football match','premier league','election','parliament','box office','concert'];
  return !bad.some(x=>t.includes(x)) || good.some(x=>t.includes(x));
}

async function parseRSS(feed) {
  const rss2json=`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
  try {
    const d=await fetchJSON(rss2json,6500); if(d.status!=='ok') return [];
    const items=(d.items||[]).slice(0,7).map(item=>({ id:item.guid||item.link||`${feed.url}-${item.title}`, title:stripHTML(item.title||'Без заголовка'), summary:stripHTML(item.description||item.content||'').slice(0,220), content:stripHTML(item.content||item.description||''), link:item.link||'#', image:item.thumbnail||item.enclosure?.link||'', published:item.pubDate||new Date().toISOString(), lang:feed.lang, source:feed.name }));
    return items.filter(x=>gameRelated(x.title,x.summary));
  } catch(e){ console.warn('RSS:',feed.name,e); return []; }
}

const API = {
  async newReleases(page=1){
    const to=new Date(), from=new Date(); from.setMonth(from.getMonth()-6);
    const url=`${RAWG_BASE}/games?key=${RAWG_KEY}&dates=${from.toISOString().slice(0,10)},${to.toISOString().slice(0,10)}&ordering=-added&page_size=20&page=${page}`;
    try { const d=await fetchJSON(url); return (d.results||[]).map(g=>mapRawg(g,'new')); } catch(e){ console.warn('RAWG releases:',e); return []; }
  },
  async discover(genre='all',q='',page=1){
    let url=`${RAWG_BASE}/games?key=${RAWG_KEY}&page_size=20&page=${page}&ordering=-rating`;
    if(q) url+=`&search=${encodeURIComponent(q)}`; if(genre!=='all') url+=`&genres=${encodeURIComponent(genre)}`;
    try { const d=await fetchJSON(url); return (d.results||[]).map(g=>mapRawg(g,'discover')); } catch(e){ return []; }
  },
  async genres(){ try { const d=await fetchJSON(`${RAWG_BASE}/genres?key=${RAWG_KEY}`); return d.results||[]; } catch(_){ return []; } },
  async detail(id){ return fetchJSON(`${RAWG_BASE}/games/${id}?key=${RAWG_KEY}`); },
  async giveaways(){ try { const d=await withProxyFallback(`${GAMERPOWER_BASE}/giveaways?type=game&sort-by=value`,6500); return Array.isArray(d)?d.map(mapGiveaway):[]; } catch(_){ return []; } },
  async f2p(){ try { const d=await withProxyFallback(`${F2G_BASE}/games?sort-by=release-date`,6500); return Array.isArray(d)?d.slice(0,18).map(mapF2P):[]; } catch(_){ return []; } },
  async freeGames(){
    const rs=await Promise.allSettled([epicFreeGames(),this.giveaways(),this.f2p()]); const all=rs.flatMap(r=>r.status==='fulfilled'?r.value:[]); const seen=new Set();
    return all.filter(g=>{ const k=g.title.toLowerCase().replace(/[^a-zа-яё0-9]/gi,''); if(seen.has(k))return false; seen.add(k); return true; });
  },
  async hotDeals(page=1){
    try { const d=await fetchJSON(`${CHEAPSHARK_BASE}/deals?sortBy=DealRating&pageSize=20&pageNumber=${page-1}&onSale=1&upperPrice=30`); const seen=new Set(); return d.map(mapDeal).filter(g=>{const k=g.title.toLowerCase(); if(seen.has(k))return false; seen.add(k); return true;}); } catch(_){ return []; }
  },
  async news(){
    const feeds=[
      {name:'Google Новости RU',lang:'ru',url:'https://news.google.com/rss/search?q=игровые+новости+when:2d&hl=ru&gl=RU&ceid=RU:ru'},
      {name:'Акции игр RU',lang:'ru',url:'https://news.google.com/rss/search?q=Steam+Epic+бесплатные+игры+скидки+when:4d&hl=ru&gl=RU&ceid=RU:ru'},
      {name:'GamesRadar',lang:'en',url:'https://www.gamesradar.com/feeds/tag/games'},
      {name:'Eurogamer',lang:'en',url:'https://www.eurogamer.net/feed'}
    ];
    const settled=await Promise.allSettled(feeds.map(parseRSS)); let items=settled.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    const seen=new Set(); items=items.filter(n=>{const k=(n.link||n.title).toLowerCase(); if(seen.has(k))return false; seen.add(k); return true;}).sort((a,b)=>new Date(b.published)-new Date(a.published)).slice(0,18);
    const translated=[];
    for(const item of items){
      if(item.lang==='en') {
        const [title,summary]=await Promise.all([translateToRu(item.title),translateToRu(item.summary)]);
        translated.push({...item,title,summary,translated:true});
        await sleep(80);
      } else translated.push(item);
    }
    return translated;
  },
  async home(){ const [a,b,c,d]=await Promise.allSettled([this.newReleases(),this.freeGames(),this.hotDeals(),this.news()]); return {new_releases:a.value||[],free_games:b.value||[],hot_deals:c.value||[],news:d.value||[]}; }
};

function priceLine(g){
  if(g.tag==='free') return g.normalPrice && g.normalPrice!=='0' ? `Бесплатно <s>${esc(g.normalPrice)}</s>`:'Бесплатно';
  if(g.tag==='f2p') return 'Бесплатная игра';
  if(g.tag==='deal'){ const s=Number(g.salePrice),n=Number(g.normalPrice); return `$${s.toFixed(2)} <s>$${n.toFixed(2)}</s>${g.savings?` (-${Math.round(g.savings)}%)`:''}`; }
  return g.rating?`★ ${g.rating.toFixed(1)}`:(g.released?new Date(g.released).getFullYear():'');
}
function cardHTML(g){
  const data=encodeURIComponent(JSON.stringify(g)); const meta=(g.genres||[]).slice(0,2).join(' · ')||g.store||''; const tag=TAG_LABEL[g.tag]||'';
  return `<div class="card" data-id="${esc(g.id)}" data-tag="${esc(g.tag||'')}">${g.image?`<img src="${esc(g.image)}" alt="" loading="lazy">`:`<div class="cover-fallback" style="background:${PLACEHOLDER}">🦊</div>`}${tag?`<span class="card-tag ${TAG_CLASS[g.tag]||''}">${tag}</span>`:''}<div class="card-content"><p class="card-title">${esc(g.title)}</p>${meta?`<p class="card-meta">${esc(meta)}</p>`:''}<p class="card-price">${priceLine(g)}</p></div><button class="card-hit" data-game="${data}" aria-label="${esc(g.title)}"></button></div>`;
}
function renderGrid(id,games,append=false){ const el=document.getElementById(id); if(!el)return; const html=(games||[]).map(cardHTML).join(''); if(!append&&!html) el.innerHTML='<div class="empty-state">Пока ничего не найдено. Попробуйте позже.</div>'; else if(append) el.insertAdjacentHTML('beforeend',html); else el.innerHTML=html; animateCards(el); }
function renderSkeleton(id,count=6){ const el=document.getElementById(id); if(el) el.innerHTML=Array.from({length:count},()=>'<div class="card skeleton"></div>').join(''); }
function animateCards(el){ if(!window.anime||!el)return; anime({targets:[...el.children].slice(-20),opacity:[0,1],translateY:[10,0],delay:anime.stagger(28),duration:420,easing:'easeOutQuad'}); }

const NEWS_MAP={};
function formatDate(s){ try{return new Date(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});}catch(_){return '';} }
function newsHTML(n){ NEWS_MAP[n.id]=n; return `<article class="news-card" data-news-id="${encodeURIComponent(n.id)}">${n.image?`<img src="${esc(n.image)}" alt="" loading="lazy">`:''}<div class="news-card-body"><p class="news-title">${esc(n.title)}${n.translated?'<span class="lang-badge">RU AI</span>':''}</p><p class="news-summary">${esc(n.summary||'')}</p><p class="news-date">${formatDate(n.published)} · ${esc(n.source||'источник')}</p></div></article>`; }
function renderNews(items,id='news-list'){ const el=document.getElementById(id); if(!el)return; el.innerHTML=items?.length?items.map(newsHTML).join(''):'<div class="empty-state">Новости временно недоступны.</div>'; animateCards(el); }
function renderNewsSkeleton(id){ const el=document.getElementById(id); if(el)el.innerHTML=Array.from({length:4},()=>'<div class="news-card skeleton" style="height:180px"></div>').join(''); }

function showSheet(g){
  const bd=document.getElementById('sheetBackdrop'); bd.classList.add('open');
  document.getElementById('sheetTitle').textContent=g.title||'';
  document.getElementById('sheetMeta').textContent=(g.genres||[]).join(' · ')||g.store||'';
  document.getElementById('sheetCover').innerHTML=g.image?`<img src="${esc(g.image)}" alt="">`:'<div class="cover-fallback" style="background:'+PLACEHOLDER+'">🦊</div>';
  document.getElementById('sheetRatings').innerHTML='';
  document.getElementById('sheetDesc').textContent=stripHTML(g.description||'Загружаем подробности…');
  const stores=document.getElementById('sheetStores'); stores.innerHTML=g.url?`<button class="btn btn-primary store-btn" data-url="${esc(g.url)}">Открыть ${esc(g.store||'источник')} ↗</button>`:'';
  if(g.rawgId){ API.detail(g.rawgId).then(d=>{ document.getElementById('sheetDesc').textContent=stripHTML(d.description_raw||d.description||g.description||'Описание недоступно.'); let r=''; if(d.metacritic)r+=`<span class="rating-badge metacritic">Metacritic: ${d.metacritic}</span>`; if(d.rating)r+=`<span class="rating-badge">RAWG: ${Number(d.rating).toFixed(1)}</span>`; document.getElementById('sheetRatings').innerHTML=r; }).catch(()=>{}); }
}
function showNews(n){
  const bd=document.getElementById('sheetBackdrop'); bd.classList.add('open');
  document.getElementById('sheetTitle').textContent=n.title;
  document.getElementById('sheetMeta').textContent=`${n.source||'Источник'} · ${formatDate(n.published)}`;
  document.getElementById('sheetCover').innerHTML=n.image?`<img src="${esc(n.image)}" alt="">`:'<div class="cover-fallback" style="background:'+PLACEHOLDER+'">🦊</div>';
  document.getElementById('sheetRatings').innerHTML=n.translated?'<span class="rating-badge">Автоперевод на русский</span>':'';
  document.getElementById('sheetDesc').textContent=n.content||n.summary||'';
  document.getElementById('sheetStores').innerHTML=`<button class="btn btn-primary store-btn" data-url="${esc(n.link)}">Читать в источнике ↗</button>`;
}

const loaded=new Set(); let nuevosPage=1, ofertasPage=1, explorarPage=1, currentGenre='all', currentQuery='';
async function loadHome(force=false){ if(loaded.has('home')&&!force)return; ['carousel-nuevos-home','carousel-ofertas-home','carousel-gratis-home'].forEach(id=>renderSkeleton(id,id.includes('ofertas')?3:5)); renderNewsSkeleton('news-list-home'); const h=await API.home(); renderGrid('carousel-nuevos-home',h.new_releases.slice(0,10)); renderGrid('carousel-ofertas-home',h.hot_deals.slice(0,6)); renderGrid('carousel-gratis-home',h.free_games.slice(0,7)); renderNews(h.news.slice(0,6),'news-list-home'); document.getElementById('statDeals').textContent=h.hot_deals.length; document.getElementById('statFree').textContent=h.free_games.filter(x=>x.tag==='free').length; const hero=h.free_games[0]||h.hot_deals[0]||h.new_releases[0]; if(hero){ document.getElementById('spotlightTitle').textContent=hero.title; document.getElementById('spotlightText').textContent=hero.tag==='free'?'Сейчас можно забрать бесплатно. Открой карточку и проверь условия акции.':'Игра попала в текущий поток THE FOX.'; if(hero.image)document.getElementById('spotlightImage').style.backgroundImage=`url("${hero.image.replace(/"/g,'')}")`; } loaded.add('home'); }
async function loadNuevos(force=false){ if(loaded.has('nuevos')&&!force)return; nuevosPage=1; renderSkeleton('grid-nuevos',8); const d=await API.newReleases(); renderGrid('grid-nuevos',d); loaded.add('nuevos'); }
async function loadGratis(force=false){ if(loaded.has('gratis')&&!force)return; renderSkeleton('grid-gratis',8); const d=await API.freeGames(); renderGrid('grid-gratis',d); loaded.add('gratis'); }
async function loadOfertas(force=false){ if(loaded.has('ofertas')&&!force)return; ofertasPage=1; renderSkeleton('grid-ofertas',8); const d=await API.hotDeals(); renderGrid('grid-ofertas',d); loaded.add('ofertas'); }
async function loadNoticias(force=false){ if(loaded.has('noticias')&&!force)return; renderNewsSkeleton('news-list'); const d=await API.news(); renderNews(d,'news-list'); loaded.add('noticias'); }
async function loadExplorar(force=false){ if(loaded.has('explorar')&&!force&&!currentQuery)return; explorarPage=1; renderSkeleton('grid-explorar',8); const d=await API.discover(currentGenre,currentQuery,1); renderGrid('grid-explorar',d); loaded.add('explorar'); }
const loaders={home:loadHome,nuevos:loadNuevos,gratis:loadGratis,ofertas:loadOfertas,noticias:loadNoticias,explorar:loadExplorar};

async function loadMore(id){ if(id==='sentinel-nuevos'){nuevosPage++;renderGrid('grid-nuevos',await API.newReleases(nuevosPage),true);} if(id==='sentinel-ofertas'){ofertasPage++;renderGrid('grid-ofertas',await API.hotDeals(ofertasPage),true);} if(id==='sentinel-explorar'){explorarPage++;renderGrid('grid-explorar',await API.discover(currentGenre,currentQuery,explorarPage),true);} }
if('IntersectionObserver' in window){ const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)loadMore(e.target.id);}),{rootMargin:'350px'}); document.querySelectorAll('.scroll-sentinel').forEach(x=>io.observe(x)); }

function go(section){ document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===`section-${section}`)); document.querySelectorAll('.dock-item').forEach(b=>b.classList.toggle('active',b.dataset.section===section)); window.scrollTo({top:0,behavior:'smooth'}); loaders[section]?.(); }
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-goto],.dock-item'); if(nav){haptic();go(nav.dataset.goto||nav.dataset.section);return;}
  const game=e.target.closest('[data-game]'); if(game){try{haptic('medium');showSheet(JSON.parse(decodeURIComponent(game.dataset.game)));}catch(err){console.warn(err);}return;}
  const news=e.target.closest('.news-card'); if(news){const n=NEWS_MAP[decodeURIComponent(news.dataset.newsId||'')];if(n){haptic('medium');showNews(n);}return;}
  const store=e.target.closest('.store-btn'); if(store){openLink(store.dataset.url);return;}
  if(e.target.id==='sheetBackdrop') document.getElementById('sheetBackdrop').classList.remove('open');
  if(e.target.id==='aboutBackdrop') document.getElementById('aboutBackdrop').classList.remove('open');
});
document.getElementById('sheetCloseBtn').addEventListener('click',()=>document.getElementById('sheetBackdrop').classList.remove('open'));
document.getElementById('aboutBtn').addEventListener('click',()=>document.getElementById('aboutBackdrop').classList.add('open'));
document.getElementById('aboutClose').addEventListener('click',()=>document.getElementById('aboutBackdrop').classList.remove('open'));

document.getElementById('genreChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');currentGenre=c.dataset.genre;loadExplorar(true);});
let searchTimer; document.getElementById('searchInput').addEventListener('input',e=>{currentQuery=e.target.value.trim();document.getElementById('searchInputMirror').value=currentQuery;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{go('explorar');loadExplorar(true);},450);});

async function genres(){ const wrap=document.getElementById('genreChips'); const gs=await API.genres(); const ru={action:'Экшен',indie:'Инди',adventure:'Приключения','role-playing-games-rpg':'RPG',strategy:'Стратегии',shooter:'Шутеры',casual:'Казуальные',simulation:'Симуляторы',puzzle:'Головоломки',arcade:'Аркады',platformer:'Платформеры',racing:'Гонки',sports:'Спорт'}; const all=[{slug:'all',name:'Все'},...gs]; wrap.innerHTML=all.map((g,i)=>`<button class="chip ${i===0?'active':''}" data-genre="${esc(g.slug)}">${esc(ru[g.slug]||g.name)}</button>`).join(''); }

const now=new Date(); document.getElementById('todayLabel').textContent=`ИГРОВОЙ РАДАР · ${now.toLocaleDateString('ru-RU',{day:'2-digit',month:'long'}).toUpperCase()}`;
genres();
const initial=new URLSearchParams(location.search).get('section'); go(loaders[initial]?initial:'home');
