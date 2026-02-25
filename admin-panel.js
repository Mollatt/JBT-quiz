let editingSongId = null;
let allSongs = [];
let sortColumn = 'title';
let sortDirection = 'asc';


function showMessage(text, type = 'success') {
    const el = document.getElementById('statusMessage');
    el.textContent = text;
    el.className = `status-message ${type}`;
    setTimeout(() => {
        el.className = 'status-message';
    }, 3000);
}



function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
        /youtube\.com\/embed\/([^&\n?#]+)/
    ];

    for (let pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

document.getElementById('addSongForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    // Validate required fields
    if (!data.title || !data.specificGame || !data.youtubeUrl || !data.difficulty) {
        showMessage('Please fill in all required fields', 'error');
        return;
    }

    const alternateValidation = window.AlternateAnswersHelper.validateAllAlternates(formData);
    if (!alternateValidation.valid) {
        showMessage(alternateValidation.error, 'error');
        return;
    }

    const youtubeId = extractYouTubeId(data.youtubeUrl);
    if (!youtubeId) {
        showMessage('Invalid YouTube URL', 'error');
        return;
    }

    const songData = {
        title: data.title.trim(),
        artist: data.artist.trim() || '',
        specific_game: data.specificGame.trim(),
        series_source: data.seriesSource.trim() || '',
        developer: data.developer.trim() || '',
        release_year: data.releaseYear ? parseInt(data.releaseYear) : null,
        boss_battle: data.bossBattle.trim() || '',
        area: data.area.trim() || '',
        youtube_url: `https://youtube.com/watch?v=${youtubeId}`,
        youtube_id: youtubeId,
        start_time: parseInt(data.startTime) || 0,
        duration: parseInt(data.duration) || 30,
        difficulty: data.difficulty,
        updated_at: new Date().toISOString(),
        ...window.AlternateAnswersHelper.getAllAlternateData()
    };


    try {
        if (editingSongId) {
            const { error } = await supabase
                .from('songs')
                .update(songData)
                .eq('id', editingSongId);

            if (error) throw error;

            showMessage(`Song "${songData.title}" updated successfully!`);

            editingSongId = null;
            document.getElementById('addSongForm').reset();
            document.getElementById('formTitle').textContent = 'Add New Song';
            const submitBtn = document.querySelector('#addSongForm button[type="submit"]');
            if (submitBtn) submitBtn.textContent = 'Add Song';
            window.AlternateAnswersHelper.clearAlternateFields();
        } else {
            songData.created_at = new Date().toISOString();
            songData.verified = false;

            const { data: newSong, error } = await supabase
                .from('songs')
                .insert([songData])
                .select()
                .single();

            if (error) throw error;

            showMessage(`Song added successfully! ID: ${newSong.id.substring(0, 8)}...`);
            document.getElementById('addSongForm').reset();
            window.AlternateAnswersHelper.clearAlternateFields();
        }

        loadSongs();

    } catch (error) {
        showMessage(`Error saving song: ${error.message}`, 'error');
        console.error(error);
    }
});

async function loadSongs() {
    try {
        const { data: songsData, error } = await supabase
            .from('songs')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('songsList');

        if (!songsData || songsData.length === 0) {
            container.innerHTML = '<p style="opacity: 0.7;">No songs added yet</p>';
            allSongs = [];
            return;
        }

        allSongs = songsData.map(song => convertSongFromDB(song));

        displaySongs(allSongs);

    } catch (error) {
        console.error('Error loading songs:', error);
        document.getElementById('songsList').innerHTML =
            `<p style="color: #ff6b6b;">Error loading songs: ${error.message}</p>`;
    }
}

function displaySongs(songs) {
    const container = document.getElementById('songsList');
    if (!songs || songs.length === 0) {
        container.innerHTML = '<p style="opacity: 0.7;">No songs match your filters</p>';
        return;
    }

    const sorted = [...songs].sort((a, b) => {
        let valA = a[sortColumn] ?? '';
        let valB = b[sortColumn] ?? '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const difficultyOrder = { 'Very Easy': 1, 'Easy': 2, 'Medium': 3, 'Hard': 4, 'Very Hard': 5, 'Unknown': 6 };
    if (sortColumn === 'difficulty') {
        sorted.sort((a, b) => {
            const diff = (difficultyOrder[a.difficulty] ?? 9) - (difficultyOrder[b.difficulty] ?? 9);
            return sortDirection === 'asc' ? diff : -diff;
        });
    }

    const arrow = col => col === sortColumn ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    container.innerHTML = `
    <table class="songs-table">
        <thead>
            <tr>
                <th class="sortable" data-col="title">Title${arrow('title')}</th>
                <th class="sortable" data-col="specificGame">Game${arrow('specificGame')}</th>
                <th class="sortable" data-col="artist">Artist${arrow('artist')}</th>
                <th class="sortable" data-col="developer">Developer${arrow('developer')}</th>
                <th class="sortable" data-col="releaseYear">Year${arrow('releaseYear')}</th>
                <th class="sortable" data-col="bossBattle">Boss?${arrow('bossBattle')}</th>
                <th class="sortable" data-col="duration">Duration${arrow('duration')}</th>
                <th class="sortable" data-col="difficulty">Difficulty${arrow('difficulty')}</th>
                <th class="sortable" data-col="verified">Status${arrow('verified')}</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${sorted.map(song => `
            <tr>
                <td><strong>${song.title}</strong></td>
                <td>${song.specificGame}</td>
                <td>${song.artist || '—'}</td>
                <td>${song.developer || '—'}</td>
                <td>${song.releaseYear || '—'}</td>
                <td>${song.bossBattle ? '⚔️ Yes' : '—'}</td>
                <td>${song.startTime}s / ${song.duration}s</td>
                <td>${song.difficulty}</td>
                <td>${song.verified ? '<span class="status-verified">✓ Verified</span>' : '<span class="status-pending">⏳ Pending</span>'}</td>
                <td class="actions-cell">
                    <button class="btn-secondary btn-sm" onclick="editSong('${song.id}')">✏️</button>
                    <button class="btn-secondary btn-sm" onclick="verifySong('${song.id}')">${song.verified ? '↩️' : '✓'}</button>
                    <button class="btn-secondary btn-sm" onclick="deleteSong('${song.id}')">🗑️</button>
                    ${song.youtubeUrl ? `<a href="${song.youtubeUrl}" target="_blank" class="btn-secondary btn-sm" style="text-decoration:none;">🔗</a>` : ''}
                </td>
            </tr>`).join('')}
        </tbody>
    </table>`;

    container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortColumn === col) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = col;
                sortDirection = 'asc';
            }
            filterSongs(); // re-filter
        });
    });
}

async function editSong(songId) {
    const song = allSongs.find(s => s.id === songId);
    if (!song) return;

    editingSongId = songId;

    document.getElementById('addSongForm').elements['title'].value = song.title;
    document.getElementById('addSongForm').elements['artist'].value = song.artist || '';
    document.getElementById('addSongForm').elements['specificGame'].value = song.specificGame;
    document.getElementById('addSongForm').elements['seriesSource'].value = song.seriesSource || '';
    document.getElementById('addSongForm').elements['developer'].value = song.developer || '';
    document.getElementById('addSongForm').elements['releaseYear'].value = song.releaseYear || '';
    document.getElementById('addSongForm').elements['bossBattle'].value = song.bossBattle || '';
    document.getElementById('addSongForm').elements['area'].value = song.area || '';
    document.getElementById('addSongForm').elements['youtubeUrl'].value = song.youtubeUrl;
    document.getElementById('addSongForm').elements['startTime'].value = song.startTime || 0;
    document.getElementById('addSongForm').elements['duration'].value = song.duration || 30;
    document.getElementById('addSongForm').elements['difficulty'].value = song.difficulty;

    window.AlternateAnswersHelper.populateAlternateFields(song);

    document.getElementById('formTitle').textContent = `Edit Song: ${song.title}`;
    const submitBtn = document.querySelector('#addSongForm button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Update Song';

    document.getElementById('addSongForm').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    editingSongId = null;
    document.getElementById('addSongForm').reset();
    document.getElementById('formTitle').textContent = 'Add New Song';
    const submitBtn = document.querySelector('#addSongForm button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Add Song';
    window.AlternateAnswersHelper.clearAlternateFields();
}

async function verifySong(songId) {
    try {
        const song = allSongs.find(s => s.id === songId);
        if (!song) return showMessage('Song not found', 'error');

        const { error } = await supabase
            .from('songs')
            .update({
                verified: !song.verified,
                updated_at: new Date().toISOString()
            })
            .eq('id', songId);

        if (error) throw error;

        showMessage(`Song ${song.verified ? 'unverified' : 'verified'}!`);
        loadSongs();

    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

async function deleteSong(songId) {
    const song = allSongs.find(s => s.id === songId);
    if (!song) return;

    if (!confirm(`Are you sure you want to delete "${song.title}"?`)) return;

    try {
        const { error } = await supabase
            .from('songs')
            .delete()
            .eq('id', songId);

        if (error) throw error;

        if (editingSongId === songId) {
            cancelEdit();
        }

        showMessage('Song deleted!');
        loadSongs();

    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

function filterSongs() {
    const searchText = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const difficultyFilter = document.getElementById('difficultyFilter')?.value || '';
    const verifiedFilter = document.getElementById('verifiedFilter')?.value || '';

    let filtered = allSongs;

    if (searchText) {
        filtered = filtered.filter(song =>
            song.title.toLowerCase().includes(searchText) ||
            song.specificGame.toLowerCase().includes(searchText) ||
            song.artist.toLowerCase().includes(searchText) ||
            song.developer.toLowerCase().includes(searchText)
        );
    }

    if (difficultyFilter) {
        filtered = filtered.filter(song => song.difficulty === difficultyFilter);
    }

    if (verifiedFilter === 'verified') {
        filtered = filtered.filter(song => song.verified === true);
    } else if (verifiedFilter === 'unverified') {
        filtered = filtered.filter(song => song.verified === false);
    }

    displaySongs(filtered);
}

document.getElementById('searchInput')?.addEventListener('input', filterSongs);
document.getElementById('difficultyFilter')?.addEventListener('change', filterSongs);
document.getElementById('verifiedFilter')?.addEventListener('change', filterSongs);
document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);

function convertSongFromDB(dbSong) {
    return {
        id: dbSong.id,
        title: dbSong.title,
        artist: dbSong.artist,
        specificGame: dbSong.specific_game,
        seriesSource: dbSong.series_source,
        developer: dbSong.developer,
        releaseYear: dbSong.release_year,
        bossBattle: dbSong.boss_battle,
        area: dbSong.area,
        youtubeUrl: dbSong.youtube_url,
        youtubeId: dbSong.youtube_id,
        startTime: dbSong.start_time,
        duration: dbSong.duration,
        difficulty: dbSong.difficulty,
        verified: dbSong.verified,
        alternateTitles: dbSong.alternate_titles || [],
        alternateArtists: dbSong.alternate_artists || [],
        alternateGames: dbSong.alternate_games || [],
        alternateDevelopers: dbSong.alternate_developers || [],
        alternateBossBattles: dbSong.alternate_boss_battles || [],
        alternateAreas: dbSong.alternate_areas || []
    };
}

loadSongs();

if (window.AlternateAnswersHelper) {
    window.AlternateAnswersHelper.setupAlternateFields();
}
