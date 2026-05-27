let _supabase;
let currentLang = 'en';
let map;
let markers = [];
let allLocations = []; // Tablica przechowująca wszystkie pobrane lokalizacje z bazy
let currentMapFilter = 'all'; // Śledzenie wybranego filtru mapy
let markersGroup; // Globalna grupa warstw Leaflet do łatwego filtrowania

// Zmienne śledzące aktualny stan
let currentRegion = null;
let currentID = null; // Śledzenie ID wybranej lokalizacji
let currentItem = null; // Przechowywanie całego obiektu aktywnej lokalizacji
let cameFromSearch = false; // Śledzenie, czy użytkownik przeszedł przez wyszukiwarkę

/**
 * --- INICJALIZACJA SYSTEMU ---
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log("CoachWay: Inicjalizacja systemu...");

    if (typeof CONFIG === 'undefined') {
        console.error("BŁĄD: Nie znaleziono obiektu CONFIG. Upewnij się, że stworzyłeś plik config.js lokalnie.");
        alert("Błąd konfiguracji: Brak pliku config.js");
        return;
    }

    try {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            _supabase = supabase.createClient(CONFIG.SB_URL, CONFIG.SB_KEY);
        } else if (window.supabase && window.supabase.createClient) {
            _supabase = window.supabase.createClient(CONFIG.SB_URL, CONFIG.SB_KEY);
        } else if (typeof createClient !== 'undefined') {
            _supabase = createClient(CONFIG.SB_URL, CONFIG.SB_KEY);
        }

        if (!_supabase) {
            throw new Error("Nie udało się zainicjalizować obiektu Supabase.");
        }

        console.log("CoachWay: Połączenie z Supabase (tabela locations) nawiązane.");
    } catch (err) {
        console.error("Błąd podczas łączenia z Supabase:", err);
        alert("Błąd krytyczny: Brak połączenia z bazą danych.");
        return; 
    }

    changeLang('en');
    initSearch();
    initServiceWorker();
});

/**
 * --- ZARZĄDZANIE WIDOKAMI I GLOBALNA NAWIGACJA ---
 */
function showView(viewId) {
    console.log(`Przełączanie na widok: ${viewId}`);
    
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');
    }

    const fabButton = document.getElementById('global-back-fab');
    if (fabButton) {
        if (viewId === 'view-menu') {
            fabButton.style.display = 'none';
        } else {
            fabButton.style.display = 'block';
        }
    }

    if (viewId === 'view-map') {
        setTimeout(() => {
            initMap();
        }, 200);
    }

    if (viewId === 'view-regions') {
        loadRegions();
    }

    window.scrollTo(0, 0);
}

function handleGlobalBack() {
    const activeView = document.querySelector('.view.active');
    if (!activeView) return;

    const currentViewId = activeView.id;

    if (currentViewId === 'view-briefing') {
        if (cameFromSearch) {
            showView('view-regions');
        } else {
            closeBriefing();
        }
    } else if (currentViewId === 'view-cities') {
        showView('view-regions');
    } else {
        showView('view-menu');
    }
}

/**
 * --- TŁUMACZENIA I JĘZYK ---
 */
function toggleLangMenu() {
    const menu = document.getElementById('lang-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
}

function changeLang(lang) {
    currentLang = lang;
    
    const menu = document.getElementById('lang-menu');
    if (menu) menu.style.display = 'none';

    const btn = document.getElementById('lang-current');
    if (lang === 'en') {
        if (btn) btn.innerHTML = '🇬🇧 EN';
        if (typeof TRANSLATIONS_EN !== 'undefined') applyTranslations(TRANSLATIONS_EN);
    } else {
        if (btn) btn.innerHTML = '🇵🇱 PL';
        if (typeof TRANSLATIONS_PL !== 'undefined') applyTranslations(TRANSLATIONS_PL);
    }

    if (document.getElementById('view-regions').classList.contains('active')) {
        loadRegions();
    }
    if (document.getElementById('view-cities').classList.contains('active') && currentRegion) {
        loadLocations(currentRegion);
    }
    if (document.getElementById('view-briefing').classList.contains('active') && currentItem) {
        renderBriefingUI(currentItem);
    }
}

function applyTranslations(dict) {
    const txt = (id, val) => { const el = document.getElementById(id); if (el && val) el.innerText = val; };
    
    txt('ui-header-sub', dict.header_sub);
    
    document.querySelectorAll('#main-search').forEach(input => {
        input.placeholder = dict.search_placeholder || "Search...";
    });

    txt('ui-menu-briefings-title', dict.menu_briefings_title);
    txt('ui-menu-briefings-desc', dict.menu_briefings_desc);
    txt('ui-menu-map-title', dict.menu_map_title);
    txt('ui-menu-map-desc', dict.menu_map_desc);
    txt('ui-menu-pitstop-title', dict.menu_pitstop_title);
    txt('ui-menu-pitstop-desc', dict.menu_pitstop_desc);
    txt('ui-menu-handbook-title', dict.menu_handbook_title);
    txt('ui-menu-handbook-desc', dict.menu_handbook_desc);
    txt('ui-menu-emergency-title', dict.menu_emergency_title);
    txt('ui-menu-emergency-desc', dict.menu_emergency_desc);

    txt('ui-browse-regions', dict.browse_regions);
    txt('ui-menu-map-title-static', dict.menu_map_title);
    txt('ui-static-emergency-title', dict.menu_emergency_title);

    txt('ui-emergency-text', dict.emergency_text);
    txt('ui-sos-btn', dict.sos_btn);
    txt('ui-quick-call', dict.quick_call);

    txt('filter-all', dict.map_filter_all);
    txt('filter-parking', dict.map_filter_parking);
    txt('filter-dropoff', dict.map_filter_dropoff);
    txt('filter-service', dict.map_filter_service);
}

function t(key) {
    const dict = currentLang === 'en' ? TRANSLATIONS_EN : TRANSLATIONS_PL;
    if (!dict) return key;
    if (dict.db && dict.db[key]) return dict.db[key];
    if (dict[key]) return dict[key];
    return key;
}

/**
 * --- LOGIKA BAZY DANYCH (SUPABASE) ---
 */
async function loadRegions() {
    const container = document.getElementById('regions-container');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Loading regions...</div>';

    try {
        const { data, error } = await _supabase
            .from('locations')
            .select('region')
            .not('region', 'is', null);

        if (error) throw error;

        const uniqueRegions = [...new Set(data.map(item => item.region))].sort();

        container.innerHTML = '';
        uniqueRegions.forEach(region => {
            const card = document.createElement('div');
            card.className = 'menu-item';
            
            const dict = currentLang === 'en' ? TRANSLATIONS_EN : TRANSLATIONS_PL;
            const regionDisplayName = (dict && dict.regions && dict.regions[region]) ? dict.regions[region] : region;
            
            card.innerHTML = `<i>📍</i> <span>${regionDisplayName}</span>`;
            card.onclick = () => {
                currentRegion = region;
                cameFromSearch = false;
                showView('view-cities');
                loadLocations(region);
            };
            container.appendChild(card);
        });

    } catch (err) {
        console.error("Błąd podczas ładowania regionów:", err);
        container.innerHTML = '<div style="color:red; padding:20px;">Error loading data.</div>';
    }
}

async function loadLocations(region) {
    const container = document.getElementById('city-list-container');
    if (!container) return;
    
    const title = document.getElementById('reg-name');
    const dict = currentLang === 'en' ? TRANSLATIONS_EN : TRANSLATIONS_PL;
    
    if (title) title.innerText = (dict && dict.regions && dict.regions[region]) ? dict.regions[region] : region;
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Loading locations...</div>';

    try {
        const { data, error } = await _supabase
            .from('locations')
            .select('id, name, category')
            .eq('region', region);

        if (error) throw error;

        container.innerHTML = '';
        data.forEach(item => {
            const card = document.createElement('div');
            card.className = 'menu-card';
            
            let icon = '🏙️';
            if(item.category === 'ferry') icon = '🚢';
            if(item.category === 'attraction' || item.category === 'tourism' || item.category === 'castle') icon = '🏰';
            if(item.category === 'parking') icon = '🅿️';

            const catLabel = (dict && dict.categories && dict.categories[item.category]) ? dict.categories[item.category] : item.category;

            card.innerHTML = `
                <div class="menu-icon">${icon}</div>
                <div>
                    <h3>${item.name}</h3>
                    <p>${catLabel || ''}</p>
                </div>
            `;
            card.onclick = () => {
                currentID = item.id;
                cameFromSearch = false;
                showView('view-briefing');
                loadBriefing(item.id);
            };
            container.appendChild(card);
        });

    } catch (err) {
        console.error("Błąd ładowania lokalizacji:", err);
        container.innerHTML = '<div style="color:red; padding:20px;">Error loading locations.</div>';
    }
}

async function loadBriefing(id) {
    const container = document.getElementById('briefing-steps');
    if (!container) return;
    
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Loading instructions...</div>';

    try {
        const { data, error } = await _supabase
            .from('locations')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        currentItem = data; // Zapisz obiekt globalnie na potrzeby zmiany języka
        renderBriefingUI(data);

    } catch (err) {
        console.error("Błąd pobierania instrukcji:", err);
        container.innerHTML = '<div style="color:red; padding:20px;">Error loading details.</div>';
    }
}

function renderBriefingUI(data) {
    const container = document.getElementById('briefing-steps');
    const title = document.getElementById('city-name-display');
    if (title) title.innerText = data.name;

    // Wybór odpowiedniej wersji językowej prosto z kolumn bazy danych
    const isPl = currentLang === 'pl';
    const s1_title = isPl ? (data.step1_title_pl || data.step1_title) : data.step1_title;
    const s1_desc = isPl ? (data.step1_desc_pl || data.step1_desc) : data.step1_desc;
    
    const s2_title = isPl ? (data.step2_title_pl || data.step2_title) : data.step2_title;
    const s2_desc = isPl ? (data.step2_desc_pl || data.step2_desc) : data.step2_desc;

    const s3_title = isPl ? (data.step3_title_pl || data.step3_title) : data.step3_title;
    const s3_desc = isPl ? (data.step3_desc_pl || data.step3_desc) : data.step3_desc;

    // Generowanie sekcji z udogodnieniami (Checkboxy z bazy)
    let amenitiesHtml = '<div class="amenities-container" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:15px; background:#f8fafc; padding:12px; border-radius:8px; font-size:13px;">';
    amenitiesHtml += `<div>☕ ${isPl ? 'Darmowa kawa' : 'Free Coffee'}: <b>${data.free_coffee ? '✅' : '❌'}</b></div>`;
    amenitiesHtml += `<div>🚽 ${isPl ? 'Toaleta' : 'Toilet Access'}: <b>${data.toilet_access ? '✅' : '❌'}</b></div>`;
    amenitiesHtml += `<div>🚿 ${isPl ? 'Prysznic' : 'Shower'}: <b>${data.shower ? '✅' : '❌'}</b></div>`;
    amenitiesHtml += `<div>💰 ${isPl ? 'Płatne' : 'Paid'}: <b>${data.is_paid ? '✅' : '❌'}</b></div>`;
    amenitiesHtml += '</div>';

    // Przycisk szybkiej nawigacji oraz Street View jeśli istnieje URL
    const navButtonsHtml = `
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <a href="https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}" target="_blank" style="flex:1; text-align:center; background:#16a34a; padding:10px; border-radius:8px; text-decoration:none; color:white; font-size:13px; font-weight:600;">
                🚗 Google Maps Navigation
            </a>
            ${data.street_view_url ? `
                <a href="${data.street_view_url}" target="_blank" style="flex:1; text-align:center; background:#2563eb; padding:10px; border-radius:8px; text-decoration:none; color:white; font-size:13px; font-weight:600;">
                    👀 Street View
                </a>
            ` : ''}
        </div>
    `;

    container.innerHTML = `
        ${amenitiesHtml}
        ${navButtonsHtml}

        ${s1_title || s1_desc ? `
            <div class="brief-card step-1" style="background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 15px;">
                <h3>${s1_title || '1. Drop-off & Pick-up'}</h3>
                <div style="margin: 10px 0; color: #334155;">${s1_desc || ''}</div>
            </div>
        ` : ''}

        ${s2_title || s2_desc ? `
            <div class="brief-card step-2" style="background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 15px;">
                <h3>${s2_title || '2. Coach Parking'}</h3>
                <div style="margin: 10px 0; color: #334155;">${s2_desc || ''}</div>
            </div>
        ` : ''}

        ${s3_title || s3_desc ? `
            <div class="brief-card step-3" style="background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h3>${s3_title || '3. Facilities & Info'}</h3>
                <div style="margin: 10px 0; color: #334155;">${s3_desc || ''}</div>
            </div>
        ` : ''}
    `;
}

function closeBriefing() {
    currentID = null;
    currentItem = null;
    showView('view-cities');
}

/**
 * --- INTERAKTYWNA MAPA (LEAFLET) ---
 */
async function initMap() {
    if (map) {
        map.invalidateSize();
        return;
    }

    console.log("Inicjalizacja mapy Leaflet...");
    map = L.map('map').setView([54.5, -3.0], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    markersGroup = L.layerGroup().addTo(map);

    await fetchAllLocationsForMap();
    renderMapMarkers();
}

async function fetchAllLocationsForMap() {
    try {
        const { data, error } = await _supabase
            .from('locations')
            .select('id, name, category, lat, lng, description, address, region');

        if (error) throw error;
        allLocations = data;
    } catch (err) {
        console.error("Błąd pobierania punktów do mapy:", err);
    }
}

function renderMapMarkers() {
    if (!markersGroup) return;
    markersGroup.clearLayers();
    markers = [];

    const dict = currentLang === 'en' ? TRANSLATIONS_EN : TRANSLATIONS_PL;

    allLocations.forEach(poi => {
        if (!poi.lat || !poi.lng) return;

        // Domyślne mapowanie kolorów na podstawie kategorii z Twojej bazy
        let markerColor = '#2563eb'; // niebieski
        let categoryText = poi.category;

        if (poi.category === 'parking') {
            markerColor = '#16a34a'; // zielony
            categoryText = (dict && dict.category_parking) ? dict.category_parking : 'Parking';
        } else if (poi.category === 'dropoff') {
            markerColor = '#eab308'; // żółty
            categoryText = (dict && dict.category_dropoff) ? dict.category_dropoff : 'Drop-off';
        } else if (poi.category === 'service' || poi.category === 'ferry') {
            markerColor = '#db2777'; // różowy
            categoryText = (dict && dict.category_service) ? dict.category_service : 'Service';
        }

        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${markerColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        const marker = L.marker([poi.lat, poi.lng], { icon: customIcon });
        
        const popupContent = `
            <div style="font-family: sans-serif; min-width: 170px;">
                <b style="font-size: 13px; color: #0f172a;">${poi.name}</b><br>
                <span style="font-size: 11px; color: #64748b;">${poi.region || ''} (${categoryText})</span>
                ${poi.description ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: #334155;">${poi.description}</p>` : ''}
                <hr style="margin: 8px 0; border: 0; border-top: 1px solid #e2e8f0;">
                <button onclick="openBriefingFromMap('${poi.id}')" style="display: block; width: 100%; text-align: center; background: #2563eb; padding: 6px; border-radius: 6px; border:none; color: white; font-size: 11px; font-weight: 600; cursor:pointer; margin-bottom:5px;">
                    📋 ${currentLang === 'pl' ? 'Zobacz Instrukcję' : 'View Briefing'}
                </button>
                <a href="https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}" target="_blank" style="display: block; text-align: center; background: #1e293b; padding: 6px; border-radius: 6px; text-decoration: none; color: white; font-size: 11px; font-weight: 600;">
                    🚗 Google Maps Navigation
                </a>
            </div>
        `;

        marker.bindPopup(popupContent);
        marker.coachWayType = poi.category;
        markers.push(marker);

        if (currentMapFilter === 'all' || currentMapFilter === poi.category) {
            markersGroup.addLayer(marker);
        }
    });
}

// Funkcja pozwalająca przejść z Popup'u mapy bezpośrednio do instrukcji tekstowej
function openBriefingFromMap(id) {
    currentID = id;
    cameFromSearch = true; // Flaga, żeby "Wstecz" wiedziało dokąd wrócić
    showView('view-briefing');
    loadBriefing(id);
}

function filterMap(type) {
    currentMapFilter = type;
    
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const clickedBtn = document.getElementById(`filter-${type}`);
    if (clickedBtn) clickedBtn.classList.add('active');

    if (!markersGroup) return;
    markersGroup.clearLayers();

    markers.forEach(marker => {
        if (type === 'all' || marker.coachWayType === type) {
            markersGroup.addLayer(marker);
        }
    });
}

/**
 * --- WYSZUKIWARKA (LIVE SEARCH) ---
 */
function initSearch() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#main-search') && !e.target.closest('.search-results-dropdown')) {
            document.querySelectorAll('.search-results-dropdown').forEach(wrapper => {
                wrapper.style.display = 'none';
            });
        }
    });
}

async function handleSearch(query) {
    const activeInput = document.activeElement;
    if (!activeInput || activeInput.id !== 'main-search') return;

    const wrapper = activeInput.nextElementSibling;
    if (!wrapper) return;

    if (!query || query.trim().length < 2) {
        wrapper.innerHTML = '';
        wrapper.style.display = 'none';
        return;
    }

    const cleanQuery = query.trim().toLowerCase();

    try {
        const { data, error } = await _supabase
            .from('locations')
            .select('id, name, region, category')
            .or(`name.ilike.%${cleanQuery}%,region.ilike.%${cleanQuery}%`)
            .limit(10);

        if (error) throw error;

        wrapper.innerHTML = '';
        if (data.length === 0) {
            wrapper.innerHTML = `
                <div style="padding: 12px; font-size: 13px; color: #64748b; text-align: center;">
                    ${currentLang === 'pl' ? 'Brak wyników...' : 'No results found...'}
                </div>
            `;
            wrapper.style.display = 'block';
            return;
        }

        wrapper.style.display = 'block';
        data.forEach(item => {
            const row = document.createElement('div');
            row.className = 'search-result-item';

            const dict = currentLang === 'en' ? TRANSLATIONS_EN : TRANSLATIONS_PL;
            const catLabel = (dict && dict.categories && dict.categories[item.category]) ? dict.categories[item.category] : item.category;

            row.innerHTML = `
                <div>
                    <strong style="color: #0f172a; font-size: 14px;">${item.name}</strong><br>
                    <span style="color: #64748b; font-size: 11px;">${item.region || ''}</span>
                </div>
                <span class="search-result-type">${catLabel || 'Location'}</span>
            `;

            row.onclick = () => {
                wrapper.style.display = 'none';
                activeInput.value = '';
                currentID = item.id;
                cameFromSearch = true;
                showView('view-briefing');
                loadBriefing(item.id);
            };

            wrapper.appendChild(row);
        });

    } catch (err) {
        console.error("Błąd podczas wyszukiwania:", err);
    }
}

/**
 * --- SOS / GPS ---
 */
function shareLocation() {
    if (!navigator.geolocation) {
        alert("GPS not supported.");
        return;
    }

    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
        
        if (navigator.share) {
            navigator.share({
                title: 'CoachWay SOS',
                text: `Emergency Driver Position: Lat ${latitude}, Lng ${longitude}`,
                url: googleMapsUrl,
            }).catch((err) => {
                console.error('Błąd udostępniania:', err);
            });
        } else {
            window.open(`https://wa.me/?text=SOS%20CoachWay%20Position:%20${encodeURIComponent(googleMapsUrl)}`, '_blank');
        }
    }, err => {
        console.error("Błąd geolokalizacji:", err);
        alert(currentLang === 'pl' ? "Nie udało się pobrać pozycji GPS." : "Could not retrieve GPS position.");
    });
}

/**
 * --- BEZPIECZNA REJESTRACJA SERVICE WORKERA (PWA) ---
 */
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('ServiceWorker zarejestrowany pomyślnie:', registration.scope);
                })
                .catch(error => {
                    console.warn('Obsługa Service Worker zablokowana przez środowisko uruchomieniowe:', error.message);
                });
        });
    }
}