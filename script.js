let modalMode = 'create';
let joinFlowStep = 1;
let selectedBuzzerSoundId = null;
let availableBuzzerSounds = [];

function generateCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function showError(msg) {
    const el = document.getElementById('errorMsg');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 4000);
    }
}


function showModalError(msg) {
    let errorEl = document.getElementById('modalError');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.id = 'modalError';
        errorEl.className = 'error';
        errorEl.style.marginBottom = '1rem';
        const modalBody = document.querySelector('.modal-body');
        modalBody.insertBefore(errorEl, modalBody.firstChild);
    }

    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    setTimeout(() => errorEl.style.display = 'none', 4000);
}

function sanitizeName(name) {
    return name.trim().replace(/[.#$/[\]]/g, '');
}

async function loadBuzzerSounds(usedSoundIds = []) {
    try {
        availableBuzzerSounds = await getBuzzerSounds();

        if (availableBuzzerSounds.length === 0) {
            document.getElementById('buzzerSoundSelection').style.display = 'none';
            return;
        }

        document.getElementById('buzzerSoundSelection').style.display = 'block';

        const grid = document.getElementById('buzzerSoundGrid');
        grid.innerHTML = availableBuzzerSounds.map(sound => {
            const isUsed = usedSoundIds.includes(sound.id);
            const isSelected = selectedBuzzerSoundId === sound.id;

            return `
                <div class="buzzer-sound-item ${isUsed ? 'disabled' : ''} ${isSelected ? 'selected' : ''}" 
                     data-sound-id="${sound.id}">
                    <input type="radio" 
                           name="buzzerSound" 
                           value="${sound.id}" 
                           ${isUsed ? 'disabled' : ''} 
                           ${isSelected ? 'checked' : ''}>
                    <span class="buzzer-sound-name">${sound.display_name}</span>
                    <button class="buzzer-sound-preview" 
                            data-sound-url="${sound.file_url}" 
                            type="button">▶️ Preview</button>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.buzzer-sound-item:not(.disabled)').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('buzzer-sound-preview')) return;

                const soundId = item.dataset.soundId;
                selectBuzzerSound(soundId);
            });
        });

        document.querySelectorAll('.buzzer-sound-preview').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                playBuzzerSoundPreview(btn.dataset.soundUrl);
            });
        });

        if (!selectedBuzzerSoundId && availableBuzzerSounds.length > 0) {
            const firstAvailable = availableBuzzerSounds.find(s => !usedSoundIds.includes(s.id));
            if (firstAvailable) {
                selectBuzzerSound(firstAvailable.id);
            }
        }

    } catch (error) {
        console.error('Error loading buzzer sounds:', error);
    }
}

function selectBuzzerSound(soundId) {
    selectedBuzzerSoundId = soundId;

    document.querySelectorAll('.buzzer-sound-item').forEach(item => {
        item.classList.remove('selected');
        item.querySelector('input[type="radio"]').checked = false;
    });

    const selectedItem = document.querySelector(`[data-sound-id="${soundId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedItem.querySelector('input[type="radio"]').checked = true;
    }
}

let currentAudio = null;
function playBuzzerSoundPreview(url) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    currentAudio = new Audio(url);
    currentAudio.play().catch(error => {
        console.error('Error playing sound:', error);
    });
}

const modal = document.getElementById('actionModal');
const modalTitle = document.getElementById('modalTitle');
const modalActionBtn = document.getElementById('modalActionBtn');
const gameCodeInput = document.getElementById('gameCodeInput');
const modalNameInput = document.getElementById('modalNameInput');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');

function openModal(mode) {
    modalMode = mode;
    joinFlowStep = 1;
    selectedBuzzerSoundId = null;

    // Clear inputs
    gameCodeInput.value = '';
    modalNameInput.value = '';

    document.getElementById('buzzerSoundSelection').style.display = 'none';

    if (mode === 'create') {
        modalTitle.textContent = 'Create Lobby';
        modalActionBtn.textContent = 'Create';
        gameCodeInput.style.display = 'none';
        modalNameInput.style.display = 'block';
        modalNameInput.focus();

        loadBuzzerSounds();
    } else {
        modalTitle.textContent = 'Join Lobby';
        modalActionBtn.textContent = 'Next';
        gameCodeInput.style.display = 'block';
        modalNameInput.style.display = 'none';
        gameCodeInput.focus();
    }

    modal.style.display = 'flex';
}

function closeModal() {
    modal.style.display = 'none';
    gameCodeInput.value = '';
    modalNameInput.value = '';
    joinFlowStep = 1;

    const errorEl = document.getElementById('modalError');
    if (errorEl) {
        errorEl.style.display = 'none';
    }
}

if (document.getElementById('createLobbyBtn')) {
    document.getElementById('createLobbyBtn').addEventListener('click', () => {
        openModal('create');
    });
}

if (document.getElementById('joinLobbyBtn')) {
    document.getElementById('joinLobbyBtn').addEventListener('click', () => {
        openModal('join');
    });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
}

if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeModal);
}

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

gameCodeInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
});

gameCodeInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        modalActionBtn.click();
    }
});

modalNameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        modalActionBtn.click();
    }
});

if (modalActionBtn) {
    modalActionBtn.addEventListener('click', async () => {
        if (modalMode === 'create') {
            await handleCreateLobby();
        } else {
            if (joinFlowStep === 1) {
                await handleJoinStep1();
            } else {
                await handleJoinStep2();
            }
        }
    });
}

async function handleCreateLobby() {
    const name = sanitizeName(modalNameInput.value);

    if (!name) {
        showModalError('Please enter your name!');
        return;
    }

    const code = generateCode();

    modalActionBtn.disabled = true;
    modalActionBtn.textContent = 'Creating...';

    const result = await createRoom(code, name, 'everybody');

    if (result.success) {
        sessionStorage.setItem('gameCode', code);
        sessionStorage.setItem('playerName', name);
        sessionStorage.setItem('playerId', result.player.player_id);
        sessionStorage.setItem('isHost', 'true');

        if (selectedBuzzerSoundId) {
            sessionStorage.setItem('buzzerSoundId', selectedBuzzerSoundId);
        }

        window.location.href = 'lobby.html';
    } else {
        modalActionBtn.disabled = false;
        modalActionBtn.textContent = 'Create';
        showModalError('Failed to create lobby. Please try again.');
    }
}

async function handleJoinStep1() {
    const code = gameCodeInput.value.trim().toUpperCase();

    if (!code) {
        showModalError('Please enter a game code!');
        return;
    }

    modalActionBtn.disabled = true;
    modalActionBtn.textContent = 'Checking...';

    const room = await getRoom(code);

    modalActionBtn.disabled = false;

    if (!room) {
        modalActionBtn.textContent = 'Next';
        showModalError('Lobby not found!');
        return;
    }

    if (room.status !== 'lobby') {
        modalActionBtn.textContent = 'Next';
        showModalError('Game already started!');
        return;
    }

    joinFlowStep = 2;
    modalTitle.textContent = 'Enter Your Name';
    modalActionBtn.textContent = 'Join';
    gameCodeInput.style.display = 'none';
    modalNameInput.style.display = 'block';
    modalNameInput.focus();

    const usedSoundIds = Object.values(room.players || {})
        .map(p => p.buzzerSoundId)
        .filter(Boolean);
    await loadBuzzerSounds(usedSoundIds);

    const errorEl = document.getElementById('modalError');
    if (errorEl) {
        errorEl.style.display = 'none';
    }
}

async function handleJoinStep2() {
    const code = gameCodeInput.value.trim().toUpperCase();
    const name = sanitizeName(modalNameInput.value);


    if (!name) {
        showModalError('Please enter your name!');
        return;
    }

    if (!selectedBuzzerSoundId) {
        showModalError('Please select a buzzer sound!');
        return;
    }

    const room = await getRoom(code);

    if (!room) {
        showModalError('Lobby not found!');
        return;
    }

    if (room.players && room.players[name]) {
        showModalError('Name already taken!');
        return;
    }

    if (room.status !== 'lobby') {
        modalActionBtn.disabled = true;
        modalActionBtn.textContent = 'Joining...';

        const result = await addPlayer(code, name, false);

        if (result.success) {

            const nextSound = await getNextAvailableBuzzerSound(code);
            if (nextSound) {
                await updatePlayer(code, result.player.player_id, {
                    buzzerSoundId: nextSound
                });
                sessionStorage.setItem('buzzerSoundId', nextSound);
            }

            sessionStorage.setItem('gameCode', code);
            sessionStorage.setItem('playerName', name);
            sessionStorage.setItem('playerId', result.player.player_id);
            sessionStorage.setItem('buzzerSoundId', selectedBuzzerSoundId);
            sessionStorage.setItem('isHost', 'false');

            if (room.status === 'scoreboard') {
                window.location.href = 'scoreboard.html';
            } else if (room.status === 'playing') {
                if (room.mode === 'buzzer') {
                    window.location.href = 'buzzer.html';
                } else {
                    window.location.href = 'quiz.html';
                }
            } else if (room.status === 'finished') {
                window.location.href = 'results.html';
            } else {
                window.location.href = 'lobby.html';
            }
        } else {
            modalActionBtn.disabled = false;
            modalActionBtn.textContent = 'Join';
            showModalError('Failed to join game. Please try again.');
        }
        return;
    }

    modalActionBtn.disabled = true;
    modalActionBtn.textContent = 'Joining...';

    const result = await addPlayer(code, name, false);

    if (result.success) {
        sessionStorage.setItem('gameCode', code);
        sessionStorage.setItem('playerName', name);
        sessionStorage.setItem('playerId', result.player.player_id); // FEATURE 5
        sessionStorage.setItem('isHost', 'false');
        window.location.href = 'lobby.html';
    } else {
        modalActionBtn.disabled = false;
        modalActionBtn.textContent = 'Join';
        showModalError('Failed to join lobby. Please try again.');
    }
}
