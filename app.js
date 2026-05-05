// Inicjalizacja klienta Supabase
const supabaseClient = supabase.createClient(CONFIG.SB_URL, CONFIG.SB_KEY);

let currentLang = 'en';
let lastOpenedCity = null; // Zmienna pomocnicza do odświeżania języka "w locie"
const i18n = { en: TRANSLATIONS_EN, pl: TRANSLATIONS_PL };

/**
 * ZARZĄDZANIE JĘZYKAMI I INTERFEJSEM
 */

function toggleLangMenu() {
    const menu = document.getElementById('lang-menu');
    if (menu) menu.classList.toggle('show');
}

function changeLang(langCode) {
    currentLang = langCode;
    const flags = { en: '🇬🇧', pl: '🇵🇱' };
    
    const currentBtn = document.getElementById('lang-current');
    if (currentBtn) currentBtn.innerText = flags[langCode];
    
    const menu = document.getElementById('lang-menu');
    if (menu) menu.classList.remove('show');
    
    // Aktualizacja stałych tekstów UI
    updateUI();
    
    // Jeśli użytkownik ma otwarty konkretny briefing, przerysuj go natychmiast w nowym języku
    if (lastOpenedCity && document.getElementById('view-briefing').classList.contains('active')) {
        renderBriefing(lastOpenedCity);
    }
}

// Zamykanie menu po kliknięciu poza obszar dropdownu
window.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.lang-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        const menu = document.getElementById('lang-menu');
        if (menu) menu.classList.remove('show');
    }
});

function updateUI() {
    const t = i18n[currentLang];
    
    const uiMap = {
        'ui-header-sub': t.header_sub,
        'ui-menu-brief-title': t.menu_briefings_title,
        'ui-menu-brief-desc': t.menu_briefings_desc,
        'ui-menu-pit-title': t.menu_pitstop_title,
        'ui-menu-pit-desc': t.menu_pitstop_desc,
        'ui-back-main': t.back_to_menu,
        'ui-back-reg': t.back,
        'ui-back-brief': t.back,
        'ui-browse-title': t.browse_regions,
        'ui-op-brief': t.operational_briefing
    };

    for (let id in uiMap) {
        const el = document.getElementById(id);
        if (el) el.innerText = uiMap[id];
    }

    const searchInput = document.getElementById('city-search');
    if (searchInput) searchInput.placeholder = t.search_placeholder;

    renderRegions();
}

/**
 * NAWIGACJA I WIDOKI
 */

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
    }
}

function closeBriefing() {
    showView('view-cities');
}

function handlePitStop() {
    alert(i18n[currentLang].pitstop_alert);
}

/**
 * LOGIKA DANYCH I REGIONÓW
 */

function renderRegions() {
    const t = i18n[currentLang];
    const container = document.getElementById('region-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.keys(t.regions).forEach(key => {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.innerHTML = `<b>${t.regions[key]}</b>`;
        div.onclick = () => loadCities(key);
        container.appendChild(div);
    });
}

async function loadCities(regionKey) {
    const t = i18n[currentLang];
    const container = document.getElementById('city-list-container');
    const regName = document.getElementById('reg-name');
    
    if (regName) regName.innerText = t.regions[regionKey] || regionKey;
    if (container) container.innerHTML = '<div style="padding:40px; text-align:center; opacity:0.5;">...</div>';
    showView('view-cities');

    const { data, error } = await supabaseClient
        .from('locations')
        .select('*')
        .eq('region', regionKey)
        .order('name', { ascending: true });

    renderCityList(data || []);
}

/**
 * WYSZUKIWANIE
 */

const searchInput = document.getElementById('city-search');
if (searchInput) {
    searchInput.addEventListener('input', async (e) => {
        const term = e.target.value.trim();
        if (term.length > 2) {
            const t = i18n[currentLang];
            const regName = document.getElementById('reg-name');
            if (regName) regName.innerText = t.search_results;
            showView('view-cities');
            
            const { data, error } = await supabaseClient
                .from('locations')
                .select('*')
                .ilike('name', `%${term}%`)
                .limit(10);

            renderCityList(data || []);
        }
    });
}

function renderCityList(data) {
    const container = document.getElementById('city-list-container');
    if (!container) return;
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = `<div style="padding:20px; text-align:center; opacity:0.6;">${i18n[currentLang].no_results_for}</div>`;
        return;
    }

    data.forEach(city => {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.innerHTML = `<i>📍</i> <div style="flex:1;"><b>${city.name}</b></div><span>→</span>`;
        div.onclick = () => renderBriefing(city);
        container.appendChild(div);
    });
}

/**
 * RENDEROWANIE SZCZEGÓŁÓW (WJAZD DO MIASTA)
 */

function renderBriefing(city) {
    lastOpenedCity = city; // Zapamiętaj miasto do zmiany języka
    const t = i18n[currentLang];
    const isPl = (currentLang === 'pl');

    // Pobieranie treści z priorytetem kolumn językowych
    const display = {
        s1t: (isPl && city.step1_title_pl) ? city.step1_title_pl : (city.step1_title || ""),
        s1d: (isPl && city.step1_desc_pl) ? city.step1_desc_pl : (city.step1_desc || ""),
        s2t: (isPl && city.step2_title_pl) ? city.step2_title_pl : (city.step2_title || ""),
        s2d: (isPl && city.step2_desc_pl) ? city.step2_desc_pl : (city.step2_desc || ""),
        s3t: (isPl && city.step3_title_pl) ? city.step3_title_pl : (city.step3_title || ""),
        s3d: (isPl && city.step3_desc_pl) ? city.step3_desc_pl : (city.step3_desc || "")
    };

    const cityNameDisplay = document.getElementById('city-name-display');
    if (cityNameDisplay) cityNameDisplay.innerText = city.name;

    const mapUrl = `https://maps.google.com/maps?q=${city.lat},${city.lng}&t=k&z=17&ie=UTF8&iwloc=&output=embed`;

    const stepsBox = document.getElementById('briefing-steps');
    if (stepsBox) {
        stepsBox.innerHTML = `
            <div style="width:100%; height:200px; border-radius:12px; overflow:hidden; margin-bottom:20px; border:1px solid #e2e8f0;">
                <iframe width="100%" height="100%" frameborder="0" src="${mapUrl}"></iframe>
            </div>
            
            <div style="margin-bottom: 20px; display: flex; gap: 10px;">
                <button onclick="window.open('https://www.google.com/maps?q=${city.lat},${city.lng}', '_blank')" 
                        style="flex: 2; background: #3b82f6; color: white; border: none; padding: 14px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 15px;">
                    ${isPl ? '🗺️ NAWIGUJ DO PUNKTU' : '🗺️ NAVIGATE TO POINT'}
                </button>
                
                ${city.street_view_url ? `
                    <button onclick="window.open('${city.street_view_url}', '_blank')" 
                            style="flex: 1; background: #f1f5f9; color: #3b82f6; border: 1px solid #cbd5e1; padding: 14px; border-radius: 10px; font-weight: 700; cursor: pointer;">
                        ${isPl ? '📸 FOTO' : '📸 PHOTO'}
                    </button>
                ` : ''}
            </div>

            <div class="brief-card">
                <span class="s-label">${t.step1_label}</span>
                <span class="s-title">${display.s1t}</span>
                <p class="s-desc">${display.s1d}</p>
            </div>

            <div class="brief-card" style="border-left-color: #64748b;">
                <span class="s-label">${t.step2_label}</span>
                <span class="s-title">${display.s2t}</span>
                <p class="s-desc">${display.s2d}</p>
            </div>

            <div class="brief-card" style="border-left-color: #22c55e;">
                <span class="s-label">${t.step3_label}</span>
                <span class="s-title">${display.s3t}</span>
                <p class="s-desc">${display.s3d}</p>
            </div>
        `;
    }
    showView('view-briefing');
}

// Inicjalizacja przy startu
updateUI();