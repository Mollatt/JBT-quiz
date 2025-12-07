let allSounds = [];
let currentSoundAudio = null;

// Load all buzzer sounds
async function loadSounds() {
    try {
        const { data: soundsData, error } = await supabase
            .from('buzzer_sounds')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('soundsList');

        if (!soundsData || soundsData.length === 0) {
            container.innerHTML = '<p style="opacity: 0.7;">No buzzer sounds added yet</p>';
            allSounds = [];
            return;
        }

        allSounds = soundsData;
        displaySounds(allSounds);

    } catch (error) {
        console.error('Error loading sounds:', error);
        document.getElementById('soundsList').innerHTML =
            `<p style="color: #ff6b6b;">Error loading sounds: ${error.message}</p>`;
    }
}

// Display sounds in the list
function displaySounds(sounds) {
    const container = document.getElementById('soundsList');

    if (!sounds || sounds.length === 0) {
        container.innerHTML = '<p style="opacity: 0.7;">No sounds match your filters</p>';
        return;
    }

    container.innerHTML = sounds.map(sound => `
        <div class="sound-card">
            <div class="sound-title">${sound.display_name}</div>
            <div class="sound-details">
                <span>📁 ${formatFileSize(sound.file_size)}</span>
                ${sound.is_starter ? '<span style="color: #4CAF50;">⭐ Starter Sound</span>' : '<span style="color: #FFC107;">Standard</span>'}
                ${sound.is_active ? '<span style="color: #4CAF50;">✓ Active</span>' : '<span style="color: #ff6b6b;">✗ Inactive</span>'}
            </div>
            <div class="sound-actions">
                <button class="btn-secondary" onclick="playSoundPreview('${sound.file_url}')">▶️ Play</button>
                <button class="btn-secondary" onclick="toggleStarter('${sound.id}', ${!sound.is_starter})">
                    ${sound.is_starter ? 'Remove Starter' : 'Make Starter'}
                </button>
                <button class="btn-secondary" onclick="toggleActive('${sound.id}', ${!sound.is_active})">
                    ${sound.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button class="btn-secondary" onclick="deleteSound('${sound.id}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

// Format file size for display
function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Play sound preview
function playSoundPreview(url) {
    if (currentSoundAudio) {
        currentSoundAudio.pause();
        currentSoundAudio.currentTime = 0;
    }

    currentSoundAudio = new Audio(url);
    currentSoundAudio.play().catch(error => {
        console.error('Error playing sound:', error);
        showMessage('Failed to play sound', 'error');
    });
}

// Toggle starter status
async function toggleStarter(soundId, makeStarter) {
    try {
        const result = await updateBuzzerSound(soundId, { is_starter: makeStarter });
        
        if (result.success) {
            showMessage(`Sound ${makeStarter ? 'marked' : 'unmarked'} as starter!`);
            loadSounds();
        } else {
            showMessage(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// Toggle active status
async function toggleActive(soundId, makeActive) {
    try {
        const result = await updateBuzzerSound(soundId, { is_active: makeActive });
        
        if (result.success) {
            showMessage(`Sound ${makeActive ? 'activated' : 'deactivated'}!`);
            loadSounds();
        } else {
            showMessage(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// Delete sound
async function deleteSound(soundId) {
    const sound = allSounds.find(s => s.id === soundId);
    if (!sound) return;

    if (!confirm(`Are you sure you want to delete "${sound.display_name}"?`)) return;

    try {
        const result = await deleteBuzzerSound(soundId);
        
        if (result.success) {
            showMessage('Sound deleted!');
            loadSounds();
        } else {
            showMessage(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// Add sound form submission
document.getElementById('addSoundForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const displayName = formData.get('displayName').trim();
    const isStarter = formData.get('isStarter') === 'on';
    const audioFile = formData.get('audioFile');

    if (!displayName || !audioFile) {
        showMessage('Please fill in all required fields', 'error');
        return;
    }

    // Validate file
    if (!audioFile.type.includes('audio/mpeg') && !audioFile.type.includes('audio/mp3')) {
        showMessage('File must be MP3 format', 'error');
        return;
    }

    if (audioFile.size > 512000) { // 500KB
        showMessage('File size must be under 500KB', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';

    try {
        const result = await uploadBuzzerSound(audioFile, displayName, isStarter);

        if (result.success) {
            showMessage(`Sound "${displayName}" uploaded successfully!`);
            document.getElementById('addSoundForm').reset();
            loadSounds();
        } else {
            showMessage(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Sound';
    }
});

// Tab switching
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        // Update tab buttons
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });
        
        const targetTab = document.getElementById(`${tabName}Tab`);
        if (targetTab) {
            targetTab.classList.add('active');
            targetTab.style.display = 'block';
        }
        
        // Load sounds when switching to sounds tab
        if (tabName === 'sounds') {
            loadSounds();
        }
    });
});

// Load sounds on page load if on sounds tab
if (document.getElementById('soundsTab')) {
    loadSounds();
}

function showMessage(text, type = 'success') {
    const el = document.getElementById('statusMessage');
    el.textContent = text;
    el.className = `status-message ${type}`;
    setTimeout(() => {
        el.className = 'status-message';
    }, 3000);
}
