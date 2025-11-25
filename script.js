// FEATURE 3: Modal flow state management
let modalMode = 'create'; // 'create' or 'join'
let joinFlowStep = 1; // 1 = room code, 2 = name

// Utility Functions
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

// FEATURE 3: Added modal error display
function showModalError(msg) {
    // Create error element if it doesn't exist
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

// FEATURE 3: Modal management functions
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

    // Clear inputs
    gameCodeInput.value = '';
    modalNameInput.value = '';

    if (mode === 'create') {
        // Create lobby flow - just ask for name
        modalTitle.textContent = 'Create Lobby';
        modalActionBtn.textContent = 'Create';
        gameCodeInput.style.display = 'none';
        modalNameInput.style.display = 'block';
        modalNameInput.focus();
    } else {
        // Join lobby flow - start with room code
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

    // Clear any modal errors
    const errorEl = document.getElementById('modalError');
    if (errorEl) {
        errorEl.style.display = 'none';
    }
}

// FEATURE 3: Create lobby button
if (document.getElementById('createLobbyBtn')) {
    document.getElementById('createLobbyBtn').addEventListener('click', () => {
        openModal('create');
    });
}

// FEATURE 3: Join lobby button
if (document.getElementById('joinLobbyBtn')) {
    document.getElementById('joinLobbyBtn').addEventListener('click', () => {
        openModal('join');
    });
}

// FEATURE 3: Modal close buttons
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
}

if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeModal);
}

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

// FEATURE 3: Auto-uppercase for game code
gameCodeInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
});

// FEATURE 3: Handle Enter key in inputs
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

// FEATURE 3: Main modal action button handler
if (modalActionBtn) {
    modalActionBtn.addEventListener('click', async () => {
        if (modalMode === 'create') {
            // Create lobby flow - validate name and create room
            await handleCreateLobby();
        } else {
            // Join lobby flow - two steps
            if (joinFlowStep === 1) {
                // Step 1: Validate room code
                await handleJoinStep1();
            } else {
                // Step 2: Validate name and join room
                await handleJoinStep2();
            }
        }
    });
}

// FEATURE 3: Create lobby handler
async function handleCreateLobby() {
    const name = sanitizeName(modalNameInput.value);

    if (!name) {
        showModalError('Please enter your name!');
        return;
    }

    const code = generateCode();

    // Disable button during creation
    modalActionBtn.disabled = true;
    modalActionBtn.textContent = 'Creating...';

    const result = await createRoom(code, name, 'everybody');

    if (result.success) {
        sessionStorage.setItem('gameCode', code);
        sessionStorage.setItem('playerName', name);
        sessionStorage.setItem('isHost', 'true');
        window.location.href = 'lobby.html';
    } else {
        modalActionBtn.disabled = false;
        modalActionBtn.textContent = 'Create';
        showModalError('Failed to create lobby. Please try again.');
    }
}

// FEATURE 3: Join lobby step 1 - validate room code
async function handleJoinStep1() {
    const code = gameCodeInput.value.trim().toUpperCase();

    if (!code) {
        showModalError('Please enter a game code!');
        return;
    }

    // Disable button during check
    modalActionBtn.disabled = true;
    modalActionBtn.textContent = 'Checking...';

    const room = await getRoom(code);

    modalActionBtn.disabled = false;

    if (!room) {
        modalActionBtn.textContent = 'Next';
        showModalError('Lobby not found!');
        return;
    }

    /* if (room.status !== 'lobby') {
         modalActionBtn.textContent = 'Next';
         showModalError('Game already started!');
         return;
     }*/

    // Room exists and is joinable - move to step 2
    joinFlowStep = 2;
    modalTitle.textContent = 'Enter Your Name';
    modalActionBtn.textContent = 'Join';
    gameCodeInput.style.display = 'none';
    modalNameInput.style.display = 'block';
    modalNameInput.focus();

    // Clear any errors
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

    // Check if name is already taken
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
        // Game is in progress - add player and redirect to appropriate page
        modalActionBtn.disabled = true;
        modalActionBtn.textContent = 'Joining...';

        const result = await addPlayer(code, name, false);

        if (result.success) {
            sessionStorage.setItem('gameCode', code);
            sessionStorage.setItem('playerName', name);
            sessionStorage.setItem('isHost', 'false');

            // Redirect based on current game status
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
                // Fallback to lobby if status is unknown
                window.location.href = 'lobby.html';
            }
        } else {
            modalActionBtn.disabled = false;
            modalActionBtn.textContent = 'Join';
            showModalError('Failed to join game. Please try again.');
        }
        return;
    }

    // Disable button during join
    modalActionBtn.disabled = true;
    modalActionBtn.textContent = 'Joining...';

    const result = await addPlayer(code, name, false);

    if (result.success) {
        sessionStorage.setItem('gameCode', code);
        sessionStorage.setItem('playerName', name);
        sessionStorage.setItem('isHost', 'false');
        window.location.href = 'lobby.html';
    } else {
        modalActionBtn.disabled = false;
        modalActionBtn.textContent = 'Join';
        showModalError('Failed to join lobby. Please try again.');
    }
}
