// Utility Functions - UNCHANGED
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

function sanitizeName(name) {
    return name.trim().replace(/[.#$/[\]]/g, '');
}

// Create Lobby - Supabase helper functions
if (document.getElementById('createLobbyBtn')) {
    document.getElementById('createLobbyBtn').addEventListener('click', async () => {
        const name = sanitizeName(document.getElementById('nameInput').value);
        if (!name) return showError('Please enter your name!');

        const code = generateCode();

        //  Using createRoom() instead of Firebase db.ref().set()
        const result = await createRoom(code, name, 'everybody');

        if (result.success) {
            sessionStorage.setItem('gameCode', code);
            sessionStorage.setItem('playerName', name);
            sessionStorage.setItem('isHost', 'true');
            window.location.href = 'lobby.html';
        } else {
            // Error already shown by createRoom()
        }
    });
}


const joinModal = document.getElementById('joinModal');
const joinLobbyBtn = document.getElementById('joinLobbyBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalJoinBtn = document.getElementById('modalJoinBtn');
const gameCodeInput = document.getElementById('gameCodeInput');

//Modal
if (joinLobbyBtn) {
    joinLobbyBtn.addEventListener('click', () => {
        joinModal.style.display = 'flex';
        gameCodeInput.focus();
    });
}

const closeModal = () => {
    joinModal.style.display = 'none';
    gameCodeInput.value = '';
};

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
}

if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeModal);
}

window.addEventListener('click', (event) => {
    if (event.target === joinModal) {
        closeModal();
    }
});

gameCodeInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
});

// Join from modal - Now uses Supabase helper functions
if (modalJoinBtn) {
    modalJoinBtn.addEventListener('click', async () => {
        const code = gameCodeInput.value.trim().toUpperCase();
        const name = sanitizeName(document.getElementById('nameInput').value);

        if (!code) return showError('Please enter a game code!');
        if (!name) return showError('Please enter your name!');

        //  Using getRoom() instead of Firebase db.ref().once('value')
        const room = await getRoom(code);

        if (!room) return showError('Lobby not found!');
        if (room.status !== 'lobby') return showError('Game already started!');
        if (room.players && room.players[name]) return showError('Name already taken!');

        //  Using addPlayer() instead of Firebase db.ref().set()
        const result = await addPlayer(code, name, false);

        if (result.success) {
            sessionStorage.setItem('gameCode', code);
            sessionStorage.setItem('playerName', name);
            sessionStorage.setItem('isHost', 'false');
            window.location.href = 'lobby.html';
        } else {
            // Error already shown by addPlayer()
        }
    });

    gameCodeInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            modalJoinBtn.click();
        }
    });
}
