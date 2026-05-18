let _supabase;
let currentLang = 'en';
let map;
let markers = [];
let allLocations = []; // Tablica przechowująca wszystkie pobrane lokalizacje z bazy
let currentMapFilter = 'all'; // Śledzenie wybranego filtru mapy
let markersGroup; // Globalna grupa warstw Leaflet do łatwego filtrowania

// Zmienne śledzące aktualny stan (potrzebne do natychmiastowej zmiany języka)
let currentRegion = null;
let currentCity = null;

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
        _supabase = supabase.createClient(CONFIG.SB_URL, CONFIG.SB_KEY);
        console.log("CoachWay: Połączenie z Supabase nawiązane.");
    } catch (err) {
        console.error("Błąd podczas łączenia z Supabase:", err);
    }

    // Start aplikacji w wybranym języku
    changeLang('en');
    
    // Inicjalizacja wyszukiwarki
    initSearch();

    // Pobranie danych startowych z bazy danych
    loadInitialData();
});

/**
 * --- POBIERANIE DANYCH Z SUPABASE ---
 */
async function loadInitialData() {
    try {
        const { data, error } = await _supabase
            .from('locations') // Tabela w Supabase
            .select('*');

        if (error) throw error;

        if (data) {
            allLocations = data;
            console.log(`Pobrano ${allLocations.length} lokalizacji.`);
            
            // Jeśli użytkownik jest już na widoku mapy, odświeżamy markery po załadowaniu danych
            if (map) {
                updateMapMarkers();
            }
        }
    } catch (err) {
        console.error("Błąd podczas pobierania danych startowych:", err);
    }
}

/**
 * --- NAWIGACJA ---
 */
function showView(viewId) {
    console.log("Widok:", viewId);
    
    // Ukrywanie wszystkich widoków
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    // Aktywacja wybranego widoku
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');
    }

    // Jeśli wychodzimy z widoków szczegółowych do menu, czyścimy pamięć podręczną stanu
    if (viewId === 'view-main') {
        currentRegion = null;
        currentCity = null;
    }

    // Jeśli wchodzimy na widok mapy, inicjalizujemy ją lub wymuszamy przeliczenie współrzędnych dotyku
    if (viewId === 'view-map') {
        setTimeout(() => {
            if (!map) {
                initMap();
            } else {
                map.invalidateSize(); // FIX: Ratowanie klikalności mapy przy zmianie display z none na block
            }
        }, 120);
    }
}

/**
 * --- WIELOJĘZYCZNOŚĆ (TLUMACZENIA) ---
 */
function toggleLangMenu() {
    const menu = document.getElementById('lang-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
}

function changeLang(lang) {
    currentLang = lang;
    console.log("Zmiana języka na:", lang);

    // Schowaj menu wyboru języka
    const menu = document.getElementById('lang-menu');
    if (menu) menu.style.display = 'none';

    // Aktualizacja widocznej flagi w nagłówku
    const currentLangBtn = document.getElementById('lang-current');
    if (currentLangBtn) {
        currentLangBtn.innerText = lang === 'pl' ? '🇵🇱' : '🇬🇧';
    }

    // Pobranie odpowiedniego obiektu tłumaczeń
    const texts = lang === 'pl' ? TRANSLATIONS_PL : TRANSLATIONS_EN;

    try {
        // Tłumaczenie elementów interfejsu (Nagłówek i Menu Główne)
        if (document.getElementById('ui-header-sub')) document.getElementById('ui-header-sub').innerText = texts.header_sub;
        if (document.getElementById('ui-menu-brief-title')) document.getElementById('ui-menu-brief-title').innerText = texts.menu_briefings_title;
        if (document.getElementById('ui-menu-brief-desc')) document.getElementById('ui-menu-brief-desc').innerText = texts.menu_briefings_desc;
        if (document.getElementById('ui-menu-map-title')) document.getElementById('ui-menu-map-title').innerText = texts.menu_map_title || "Interactive Map";
        if (document.getElementById('ui-menu-map-desc')) document.getElementById('ui-menu-map-desc').innerText = texts.menu_map_desc || "Parking, Drop-offs, Service";
        if (document.getElementById('ui-menu-pit-title')) document.getElementById('ui-menu-pit-title').innerText = texts.menu_pitstop_title;
        if (document.getElementById('ui-menu-pit-desc')) document.getElementById('ui-menu-pit-desc').innerText = texts.menu_pitstop_desc;
        if (document.getElementById('ui-menu-handbook-title')) document.getElementById('ui-menu-handbook-title').innerText = texts.menu_handbook_title || "Handbook";
        if (document.getElementById('ui-menu-handbook-desc')) document.getElementById('ui-menu-handbook-desc').innerText = texts.menu_handbook_desc || "Regulations & Tacho";
        if (document.getElementById('ui-menu-emergency-title')) document.getElementById('ui-menu-emergency-title').innerText = texts.menu_emergency_title || "Emergency";
        if (document.getElementById('ui-menu-emergency-desc')) document.getElementById('ui-menu-emergency-desc').innerText = texts.menu_emergency_desc || "SOS & Breakdown";
        
        // Tłumaczenie przycisków "Wstecz", Nagłówków Sekcji i Elementów Pomocniczych
        if (document.getElementById('ui-browse-title')) document.getElementById('ui-browse-title').innerText = texts.browse_regions;
        if (document.getElementById('ui-back-main')) document.getElementById('ui-back-main').innerText = texts.back;
        if (document.getElementById('ui-back-map')) document.getElementById('ui-back-map').innerText = texts.back;
        if (document.getElementById('ui-back-handbook')) document.getElementById('ui-back-handbook').innerText = texts.back;
        if (document.getElementById('ui-back-emergency')) document.getElementById('ui-back-emergency').innerText = texts.back;
        if (document.getElementById('ui-back-reg')) document.getElementById('ui-back-reg').innerText = texts.back;
        if (document.getElementById('ui-back-brief')) document.getElementById('ui-back-brief').innerText = texts.back;
        
        if (document.getElementById('ui-map-title')) document.getElementById('ui-map-title').innerText = texts.menu_map_title || "Interactive Map";
        if (document.getElementById('ui-handbook-title')) document.getElementById('ui-handbook-title').innerText = texts.menu_handbook_title || "Driver's Handbook";
        if (document.getElementById('ui-emergency-title')) document.getElementById('ui-emergency-title').innerText = texts.menu_emergency_title || "Emergency Hub";
        if (document.getElementById('ui-emergency-text')) document.getElementById('ui-emergency-text').innerText = texts.emergency_text || "Need assistance? Share your location with the service team.";
        if (document.getElementById('ui-sos-btn')) document.getElementById('ui-sos-btn').innerText = texts.sos_button || "📍 SHARE MY LOCATION";
        if (document.getElementById('ui-quick-call')) document.getElementById('ui-quick-call').innerText = texts.quick_call || "Quick Call:";

        // Tłumaczenie przycisków filtrów na mapie
        if (document.getElementById('filter-all')) document.getElementById('filter-all').innerText = texts.map_filter_all || "All";
        if (document.getElementById('filter-parking')) document.getElementById('filter-parking').innerText = '🅿️ ' + (texts.map_filter_parking || "Parking");
        if (document.getElementById('filter-dropoff')) document.getElementById('filter-dropoff').innerText = '📍 ' + (texts.map_filter_dropoff || "Drop-off");
        if (document.getElementById('filter-service')) document.getElementById('filter-service').innerText = '🛠️ ' + (texts.map_filter_service || "Service");

        // Tłumaczenie dynamicznego paska wyszukiwania (Placeholder)
        if (document.getElementById('city-search')) {
            document.getElementById('city-search').placeholder = texts.search_placeholder || "Search...";
        }

        // Odświeżenie list widoków strukturalnych
        renderRegions();

        if (currentRegion && document.getElementById('view-cities').classList.contains('active')) {
            loadCitiesForRegion(currentRegion);
        }

        if (currentCity && document.getElementById('view-briefing').classList.contains('active')) {
            openBriefing(currentCity);
        }

        if (map) {
            updateMapMarkers();
        }

    } catch (e) {
        console.error("Błąd podczas podmieniania tekstów językowych:", e);
    }
}

/**
 * --- GENEROWANIE WIDOKU REGIONÓW ---
 */
function renderRegions() {
    const container = document.getElementById('region-list');
    if (!container) return;

    container.innerHTML = '';
    const texts = currentLang === 'pl' ? TRANSLATIONS_PL : TRANSLATIONS_EN;

    const availableRegions = [
        "Greater London", "South East", "South West", "West Midlands", 
        "North West", "North East", "Yorkshire", "East Midlands", "East of England"
    ];

    availableRegions.forEach(regKey => {
        const translatedName = texts.regions[regKey] || regKey;

        const div = document.createElement('div');
        div.className = 'menu-item';
        div.onclick = () => loadCitiesForRegion(regKey);
        div.innerHTML = `
            <i>📍</i>
            <div><b>${translatedName}</b></div>
        `;
        container.appendChild(div);
    });
}

/**
 * --- ŁADOWANIE MIAST DLA REGIONU ---
 */
async function loadCitiesForRegion(regionName) {
    currentRegion = regionName;
    showView('view-cities');
    
    const titleField = document.getElementById('reg-name');
    const container = document.getElementById('city-list-container');
    
    const texts = currentLang === 'pl' ? TRANSLATIONS_PL : TRANSLATIONS_EN;
    if (titleField) titleField.innerText = texts.regions[regionName] || regionName;
    if (container) container.innerHTML = '<p style="padding:20px; text-align:center; opacity:0.5;">Loading...</p>';

    try {
        const cities = allLocations.filter(loc => loc.region === regionName);

        if (!container) return;
        container.innerHTML = '';

        if (cities.length === 0) {
            container.innerHTML = `<p style="padding:20px; text-align:center; opacity:0.5;">${currentLang === 'pl' ? 'Brak miast w tym regionie.' : 'No cities found in this region.'}</p>`;
            return;
        }

        cities.forEach(city => {
            const div = document.createElement('div');
            div.className = 'menu-item';
            div.onclick = () => openBriefing(city);
            div.innerHTML = `
                <i>🏙️</i>
                <div><b>${city.name}</b></div>
            `;
            container.appendChild(div);
        });

    } catch (err) {
        console.error("Błąd ładowania miast:", err);
    }
}

/**
 * --- OTWIERANIE I ZAMYKANIE BRIEFINGU (INSTRUKCJI) ---
 */
let previousViewBeforeBriefing = 'view-main';

function openBriefing(cityData) {
    currentCity = cityData;

    const activeView = document.querySelector('.view.active');
    if (activeView && activeView.id !== 'view-briefing') {
        previousViewBeforeBriefing = activeView.id;
    }

    showView('view-briefing');

    const titleField = document.getElementById('city-name-display');
    const stepsContainer = document.getElementById('briefing-steps');

    if (titleField) titleField.innerText = cityData.name;
    if (!stepsContainer) return;

    stepsContainer.innerHTML = '';
    const texts = currentLang === 'pl' ? TRANSLATIONS_PL : TRANSLATIONS_EN;
    const suffix = currentLang === 'pl' ? '_pl' : '';

    const s1_title = cityData[`step1_title${suffix}`] || cityData.step1_title || (currentLang === 'pl' ? '1. Wysadzanie / Odbiór' : '1. Set-down / Pick-up Point');
    const s1_desc  = cityData[`step1_desc${suffix}`]  || cityData.step1_desc;

    const s2_title = cityData[`step2_title${suffix}`] || cityData.step2_title || (currentLang === 'pl' ? '2. Parking dla autokarów' : '2. Coach Parking');
    const s2_desc  = cityData[`step2_desc${suffix}`]  || cityData.step2_desc;

    const s3_title = cityData[`step3_title${suffix}`] || cityData.step3_title || (currentLang === 'pl' ? '3. Udogodnienia dla kierowców' : '3. Driver Facilities');
    const s3_desc  = cityData[`step3_desc${suffix}`]  || cityData.step3_desc;

    const steps = [
        { label: texts.step1_label || "KROK 1", title: s1_title, desc: s1_desc },
        { label: texts.step2_label || "KROK 2", title: s2_title, desc: s2_desc },
        { label: texts.step3_label || "KROK 3", title: s3_title, desc: s3_desc }
    ];

    steps.forEach(step => {
        if (!step.desc) return;

        const card = document.createElement('div');
        card.className = 'brief-card';
        card.innerHTML = `
            <span class="s-label">${step.label}</span>
            <span class="s-title">${step.title}</span>
            <div class="s-desc" style="white-space: pre-line; background: #f8fafc; padding: 12px; border-radius: 8px; border-left: 3px solid #3b82f6;">
                ${step.desc}
            </div>
        `;
        stepsContainer.appendChild(card);
    });
}

function closeBriefing() {
    currentCity = null;
    showView(previousViewBeforeBriefing);
}

/**
 * --- PROSTY PIT-STOP ---
 */
function handlePitStop() {
    const texts = currentLang === 'pl' ? TRANSLATIONS_PL : TRANSLATIONS_EN;
    alert(texts.pitstop_alert || "Feature coming soon!");
}

/**
 * --- MAPA INTERAKTYWNA SYSTEM ---
 */
function initMap() {
    if (map) return;

    console.log("System: Tworzenie mapy Leaflet...");
    map = L.map('map', {
        tap: false, // Zapobiega konfliktom kliknięć na Safari/iOS
        touchZoom: true
    }).setView([54.0, -2.5], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    markersGroup = L.layerGroup().addTo(map);
    updateMapMarkers();
}

function updateMapMarkers() {
    if (!map || !markersGroup || !allLocations || allLocations.length === 0) return;

    markersGroup.clearLayers();
    markers = [];

    const texts = currentLang === 'pl' ? TRANSLATIONS_PL : TRANSLATIONS_EN;
    const suffix = currentLang === 'pl' ? '_pl' : '';

    allLocations.forEach(loc => {
        if (!loc.latitude || !loc.longitude) return;

        const locName = loc.name || "Location";
        const locTitle = loc[`step1_title${suffix}`] || loc.step1_title || "";
        const dbCategory = loc.category ? loc.category.toLowerCase().trim() : 'dropoff';

        let catLabel = texts.category_dropoff || "Drop-off Point";
        if (dbCategory === 'parking') catLabel = texts.category_parking || "Coach Parking";
        if (dbCategory === 'service') catLabel = texts.category_service || "Service & Facilities";

        const marker = L.marker([parseFloat(loc.latitude), parseFloat(loc.longitude)]);
        marker.pointType = dbCategory;

        const popupContent = `
            <div style="font-family: sans-serif; padding: 5px; min-width: 190px; text-align: left;">
                <strong style="font-size: 14px; color: #1e293b; display: block; margin-bottom: 2px;">${locName}</strong>
                <span style="font-size: 10px; color: #0284c7; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${catLabel}</span>
                <p style="font-size: 12px; margin: 8px 0; color: #475569; line-height: 1.4;">${locTitle}</p>
                <button onclick="openBriefingFromMap('${loc.id}')" style="width: 100%; background: #1e293b; color: white; border: none; padding: 8px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: bold;">
                    ${texts.map_view_briefing || "View Access Instructions"}
                </button>
            </div>
        `;

        marker.bindPopup(popupContent, { autoPan: true });
        markers.push(marker);

        if (currentMapFilter === 'all' || dbCategory === currentMapFilter) {
            markersGroup.addLayer(marker);
        }
    });
}

function openBriefingFromMap(locationId) {
    if (!allLocations) return;
    const loc = allLocations.find(l => String(l.id) === String(locationId));
    if (loc) {
        if (map) map.closePopup();
        openBriefing(loc);
    }
}

function filterMap(type) {
    currentMapFilter = type;
    console.log("Filtr mapy na:", type);

    if (!markersGroup) return;
    markersGroup.clearLayers();

    markers.forEach(marker => {
        if (type === 'all' || marker.pointType === type) {
            markersGroup.addLayer(marker);
        }
    });

    document.querySelectorAll('.map-filters .filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const targetBtn = document.getElementById(`filter-${type}`);
    if (targetBtn) targetBtn.classList.add('active');
}

/**
 * --- DYNAMICZNA WYSZUKIWARKA OFFLINE ---
 */
function initSearch() {
    const input = document.getElementById('city-search');
    const wrapper = document.getElementById('search-results-wrapper');
    const resultsList = document.getElementById('search-results-list');
    
    if (!input || !wrapper || !resultsList) return;

    input.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        
        if (term.length < 2) {
            wrapper.style.display = 'none';
            resultsList.innerHTML = '';
            return;
        }

        const hits = allLocations.filter(loc => {
            const nameMatch = loc.name ? loc.name.toLowerCase().includes(term) : false;
            const regionMatch = loc.region ? loc.region.toLowerCase().includes(term) : false;
            return nameMatch || regionMatch;
        });

        resultsList.innerHTML = '';

        if (hits.length > 0) {
            wrapper.style.display = 'block';
            
            hits.forEach(city => {
                const item = document.createElement('div');
                item.style.padding = '10px 12px';
                item.style.cursor = 'pointer';
                item.style.borderBottom = '1px solid #f1f5f9';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '10px';
                
                item.innerHTML = `
                    <span style="font-size: 18px;">🏙️</span>
                    <div style="text-align: left;">
                        <strong style="font-size: 14px; color: #1e293b; display: block;">${city.name}</strong>
                        <small style="color: #64748b; font-size: 12px;">${city.region || ''}</small>
                    </div>
                `;
                
                item.onclick = () => {
                    input.value = '';
                    wrapper.style.display = 'none';
                    openBriefing(city);
                };
                
                item.onmouseenter = () => item.style.background = '#f8fafc';
                item.onmouseleave = () => item.style.background = 'none';
                
                resultsList.appendChild(item);
            });
        } else {
            wrapper.style.display = 'block';
            resultsList.innerHTML = `
                <div style="padding: 12px; font-size: 13px; color: #64748b; text-align: center;">
                    ${currentLang === 'pl' ? 'Brak wyników...' : 'No results found...'}
                </div>
            `;
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !wrapper.contains(e.target)) {
            wrapper.style.display = 'none';
        }
    });
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
                text: `Moja pozycja awaryjna: Lat ${latitude}, Lng ${longitude}`,
                url: googleMapsUrl,
            }).then(() => {
                console.log('Pozycja udostępniona pomyślnie');
            }).catch((err) => {
                console.error('Błąd udostępniania:', err);
            });
        } else {
            window.open(googleMapsUrl, '_blank');
        }
    }, err => {
        console.error("Błąd GPS:", err);
        alert("Nie udało się pobrać lokalizacji GPS.");
    });
}