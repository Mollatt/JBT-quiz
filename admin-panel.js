// Admin Panel - Song Management

const songsRef = db.ref('songs');

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

// Add song form submission
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
        verified: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    try {
        // Add to database
        const newSongRef = songsRef.push();
        await newSongRef.set(songData);

        showMessage(`Song added successfully! ID: ${newSongRef.key.substring(0, 8)}...`);
        e.target.reset();
        loadSongs();

    } catch (error) {
        showMessage(`Error adding song: ${error.message}`, 'error');
        console.error(error);
    }
});

// Search and filter functionality
let allSongs = [];

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
                <button class="btn-secondary" onclick="verifySong('${song.id}')">
                    ${song.verified ? 'Unverify' : 'Verify'}
                </button>
                <button class="btn-secondary" onclick="deleteSong('${song.id}')">Delete</button>
            </div>
        </div>
    `).join('');
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
    if (!confirm('Are you sure you want to delete this song?')) return;

    try {
        await songsRef.child(songId).remove();
        showMessage('Song deleted!');
        loadSongs();

    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// Setup search and filter listeners
document.getElementById('searchInput')?.addEventListener('input', filterSongs);
document.getElementById('difficultyFilter')?.addEventListener('change', filterSongs);
document.getElementById('verifiedFilter')?.addEventListener('change', filterSongs);

// Load songs on page load
loadSongs();
