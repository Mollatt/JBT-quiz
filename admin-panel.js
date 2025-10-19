// Admin Panel - Song Management with Edit

const songsRef = db.ref('songs');

let editingSongId = null;
let allSongs = [];

// Show status message
function showMessage(text, type = 'success') {
    const el = document.getElementById('statusMessage');
    el.textContent = text;
    el.className = `status-message ${type}`;
    setTimeout(() => {
        el.className = 'status-message';
    }, 3000);
}

// Extract YouTube video ID from URL
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

// Add/Edit song form submission
document.getElementById('addSongForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form data
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    // Validate required fields
    if (!data.title || !data.specificGame || !data.youtubeUrl || !data.difficulty) {
        showMessage('Please fill in all required fields', 'error');
        return;
    }

    // Validate YouTube URL and extract ID
    const youtubeId = extractYouTubeId(data.youtubeUrl);
    if (!youtubeId) {
        showMessage('Invalid YouTube URL', 'error');
        return;
    }

    // Prepare song data
    const songData = {
        title: data.title.trim(),
        artist: data.artist.trim() || '',
        specificGame: data.specificGame.trim(),
        seriesSource: data.seriesSource.trim() || '',
        developer: data.developer.trim() || '',
        releaseYear: data.releaseYear ? parseInt(data.releaseYear) : null,
        bossBattle: data.bossBattle.trim() || '',
        area: data.area.trim() || '',
        youtubeUrl: `https://youtube.com/watch?v=${youtubeId}`,
        youtubeId: youtubeId,
        startTime: parseInt(data.startTime) || 0,
        duration: parseInt(data.duration) || 30,
        difficulty: data.difficulty,
        updatedAt: Date.now()
    };

    try {
        if (editingSongId) {
            // Update existing song (keep createdAt)
            const originalSong = allSongs.find(s => s.id === editingSongId);
            if (originalSong) {
                songData.createdAt = originalSong.createdAt;
            }

            await songsRef.child(editingSongId).update(songData);
            showMessage(`Song "${songData.title}" updated successfully!`);
            
            // Reset edit mode
            editingSongId = null;
            document.getElementById('addSongForm').reset();
            document.getElementById('formTitle').textContent = 'Add New Song';
            const submitBtn = document.querySelector('#addSongForm button[type="submit"]');
            if (submitBtn) submitBtn.textContent = 'Add Song';
        } else {
            // Create new song
            songData.createdAt = Date.now();
            songData.verified = false;

            const newSongRef = songsRef.push();
            await newSongRef.set(songData);

            showMessage(`Song added successfully! ID: ${newSongRef.key.substring(0, 8)}...`);
            document.getElementById('addSongForm').reset();
        }

        loadSongs();

    } catch (error) {
        showMessage(`Error saving song: ${error.message}`, 'error');
        console.error(error);
    }
});

// Load and display songs
async function loadSongs() {
    try {
        const snapshot = await songsRef.once('value');
        const songsData = snapshot.val();

        const container = document.getElementById('songsList');

        if (!songsData || Object.keys(songsData).length === 0) {
            container.innerHTML = '<p style="opacity: 0.7;">No songs added yet</p>';
            allSongs = [];
            return;
        }

        allSongs = Object.entries(songsData)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.createdAt - a.createdAt);

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

    container.innerHTML = songs.map(song => `
        <div class="song-card">
            <div class="song-title">${song.title}</div>
            <div class="song-details">
                <span>🎮 ${song.specificGame}</span>
                ${song.artist ? `<span>🎵 ${song.artist}</span>` : ''}
                ${song.developer ? `<span>🏢 ${song.developer}</span>` : ''}
                ${song.releaseYear ? `<span>📅 ${song.releaseYear}</span>` : ''}
            </div>
            <div class="song-details">
                <span>⏱️ ${song.startTime}s - ${song.duration}s</span>
                <span>📊 ${song.difficulty}</span>
                ${song.verified ? '<span style="color: #4CAF50;">✓ Verified</span>' : '<span style="color: #FFC107;">⏳ Pending</span>'}
            </div>
            <div class="song-url">
                <small>🔗 <a href="${song.youtubeUrl}" target="_blank" rel="noopener noreferrer">View YouTube</a></small>
            </div>
            <div class="song-actions">
                <button class="btn-secondary" onclick="editSong('${song.id}')">✏️ Edit</button>
                <button class="btn-secondary" onclick="verifySong('${song.id}')">
                    ${song.verified ? 'Unverify' : 'Verify'}
                </button>
                <button class="btn-secondary" onclick="deleteSong('${song.id}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

// Edit song
async function editSong(songId) {
    const song = allSongs.find(s => s.id === songId);
    if (!song) return;

    editingSongId = songId;

    // Populate form with song data
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

    // Update form title and button
    document.getElementById('formTitle').textContent = `Edit Song: ${song.title}`;
    const submitBtn = document.querySelector('#addSongForm button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Update Song';

    // Scroll to form
    document.getElementById('addSongForm').scrollIntoView({ behavior: 'smooth' });
}

// Cancel edit
function cancelEdit() {
    editingSongId = null;
    document.getElementById('addSongForm').reset();
    document.getElementById('formTitle').textContent = 'Add New Song';
    const submitBtn = document.querySelector('#addSongForm button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Add Song';
}

// Verify/Unverify song
async function verifySong(songId) {
    try {
        const snapshot = await songsRef.child(songId).once('value');
        const song = snapshot.val();
        
        if (!song) return showMessage('Song not found', 'error');

        await songsRef.child(songId).update({
            verified: !song.verified,
            updatedAt: Date.now()
        });

        showMessage(`Song ${song.verified ? 'unverified' : 'verified'}!`);
        loadSongs();

    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// Delete song
async function deleteSong(songId) {
    const song = allSongs.find(s => s.id === songId);
    if (!song) return;

    if (!confirm(`Are you sure you want to delete "${song.title}"?`)) return;

    try {
        await songsRef.child(songId).remove();
        
        // If we were editing this song, cancel edit
        if (editingSongId === songId) {
            cancelEdit();
        }

        showMessage('Song deleted!');
        loadSongs();

    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// Search and filter functionality
function filterSongs() {
    const searchText = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const difficultyFilter = document.getElementById('difficultyFilter')?.value || '';
    const verifiedFilter = document.getElementById('verifiedFilter')?.value || '';

    let filtered = allSongs;

    // Search filter
    if (searchText) {
        filtered = filtered.filter(song =>
            song.title.toLowerCase().includes(searchText) ||
            song.specificGame.toLowerCase().includes(searchText) ||
            song.artist.toLowerCase().includes(searchText) ||
            song.developer.toLowerCase().includes(searchText)
        );
    }

    // Difficulty filter
    if (difficultyFilter) {
        filtered = filtered.filter(song => song.difficulty === difficultyFilter);
    }

    // Verified filter
    if (verifiedFilter === 'verified') {
        filtered = filtered.filter(song => song.verified === true);
    } else if (verifiedFilter === 'unverified') {
        filtered = filtered.filter(song => song.verified === false);
    }

    displaySongs(filtered);
}

// Setup search and filter listeners
document.getElementById('searchInput')?.addEventListener('input', filterSongs);
document.getElementById('difficultyFilter')?.addEventListener('change', filterSongs);
document.getElementById('verifiedFilter')?.addEventListener('change', filterSongs);

// Add cancel edit button listener
document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);

// Load songs on page load
loadSongs();
