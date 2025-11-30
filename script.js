let modalMode = 'create';
let joinFlowStep = 1;


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

    gameCodeInput.value = '';
    modalNameInput.value = '';

    if (mode === 'create') {
        modalTitle.textContent = 'Create Lobby';
        modalActionBtn.textContent = 'Create';
        gameCodeInput.style.display = 'none';
        modalNameInput.style.display = 'block';
        modalNameInput.focus();
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

    joinFlowStep = 2;
    modalTitle.textContent = 'Enter Your Name';
    modalActionBtn.textContent = 'Join';
    gameCodeInput.style.display = 'none';
    modalNameInput.style.display = 'block';
    modalNameInput.focus();

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
            sessionStorage.setItem('gameCode', code);
            sessionStorage.setItem('playerName', name);
            sessionStorage.setItem('playerId', result.player.player_id);
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
