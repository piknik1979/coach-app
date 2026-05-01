const supabaseClient = supabase.createClient(CONFIG.SB_URL, CONFIG.SB_KEY);

// Navigation
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0,0);
}

// Special back button for briefing to handle search results
function closeBriefing() {
    showView('view-cities');
}

// Search Logic
document.getElementById('city-search').addEventListener('input', async (e) => {
    const term = e.target.value;
    
    if (term.length > 2) {
        const container = document.getElementById('city-list-container');
        document.getElementById('reg-name').innerText = "Search Results";
        container.innerHTML = '<div style="padding:20px; text-align:center;">Searching...</div>';
        showView('view-cities');

        const { data, error } = await supabaseClient
            .from('locations')
            .select('*')
            .ilike('name', `%${term}%`)
            .limit(10);

        if (data && data.length > 0) {
            container.innerHTML = '';
            data.forEach(city => {
                const div = document.createElement('div');
                div.className = 'menu-item';
                div.innerHTML = `<i>📍</i> <b>${city.name}</b> <small style="margin-left:auto; color:#94a3b8;">${city.region}</small>`;
                div.onclick = () => renderBriefing(city);
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<div style="padding:20px; text-align:center;">No cities found.</div>';
        }
    }
});

// Load by Region
async function loadCities(regionName) {
    const container = document.getElementById('city-list-container');
    container.innerHTML = '<div style="text-align:center; padding:20px;">Loading...</div>';
    document.getElementById('reg-name').innerText = regionName;
    showView('view-cities');

    const { data, error } = await supabaseClient
        .from('locations')
        .select('*')
        .eq('region', regionName)
        .order('name', { ascending: true });

    if (data) {
        container.innerHTML = '';
        data.forEach(city => {
            const div = document.createElement('div');
            div.className = 'menu-item';
            div.innerHTML = `<i>📍</i> <b>${city.name}</b>`;
            div.onclick = () => renderBriefing(city);
            container.appendChild(div);
        });
    }
}

// Render Briefing
function renderBriefing(city) {
    document.getElementById('city-name-display').innerText = city.name;
    const stepsBox = document.getElementById('briefing-steps');
    
    stepsBox.innerHTML = `
        <div class="brief-card">
            <span class="s-label">Step 1: Arrival</span>
            <span class="s-title">${city.step1_title}</span>
            <p class="s-desc">${city.step1_desc}</p>
            <div class="btn-row">
                <div class="btn-opt" onclick="window.open('https://www.google.com/maps?q=${city.lat},${city.lng}')">📍 Map View</div>
                ${city.street_view_url ? `<div class="btn-opt" onclick="window.open('${city.street_view_url}')">📸 Street View</div>` : ''}
            </div>
        </div>
        <div class="brief-card" style="border-color: #64748b;">
            <span class="s-label">Step 2: Parking</span>
            <span class="s-title">${city.step2_title}</span>
            <p class="s-desc">${city.step2_desc}</p>
        </div>
        <div class="brief-card" style="border-color: #22c55e;">
            <span class="s-label">Step 3: Facilities</span>
            <span class="s-title">${city.step3_title}</span>
            <p class="s-desc">${city.step3_desc}</p>
        </div>
    `;
    showView('view-briefing');
}