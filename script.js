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

function sanitizeName(name) {
    return name.trim().replace(/[.#$/[\]]/g, '');
}

// Create Lobby (default to text mode, can change in lobby)
if (document.getElementById('createLobbyBtn')) {
    document.getElementById('createLobbyBtn').addEventListener('click', async () => {
        const name = sanitizeName(document.getElementById('nameInput').value);
        if (!name) return showError('Please enter your name!');

        const code = generateCode();
        const roomData = {
            host: name,
            mode: 'text',  // Default mode, can be changed in lobby
            status: 'lobby',
            currentQ: -1,
            created: Date.now(),
            questions: [],  // Will be populated when game starts
            // Game parameters
            gameParams: {
                correctPointsScale: [1000, 800, 600, 400],
                buzzerCorrectPoints: 1000,
                buzzerWrongPoints: -250,
                buzzerLockoutTime: 5,
                autoPlayDuration: 30,
                hostTimerDuration: 60
            },
            players: {
                [name]: {
                    score: 0,
                    answer: null,
                    answered: false,
                    correctCount: 0,
                    isHost: true,
                    joined: Date.now()
                }
            }
        };

        try {
            await db.ref(`rooms/${code}`).set(roomData);
            sessionStorage.setItem('gameCode', code);
            sessionStorage.setItem('playerName', name);
            sessionStorage.setItem('isHost', 'true');
            window.location.href = 'lobby.html';
        } catch (error) {
            showError('Failed to create lobby. Please try again.');
            console.error(error);
        }
    });
}

// Modal handling
const joinModal = document.getElementById('joinModal');
const joinLobbyBtn = document.getElementById('joinLobbyBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalJoinBtn = document.getElementById('modalJoinBtn');
const gameCodeInput = document.getElementById('gameCodeInput');

// Open modal
if (joinLobbyBtn) {
    joinLobbyBtn.addEventListener('click', () => {
        joinModal.style.display = 'flex';
        gameCodeInput.focus();
    });
}

// Close modal
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

// Click outside modal to close
window.addEventListener('click', (event) => {
    if (event.target === joinModal) {
        closeModal();
    }
});

// Auto-uppercase game code in modal
gameCodeInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
});

// Join from modal
if (modalJoinBtn) {
    modalJoinBtn.addEventListener('click', async () => {
        const code = gameCodeInput.value.trim().toUpperCase();
        const name = sanitizeName(document.getElementById('nameInput').value);

        if (!code) return showError('Please enter a game code!');
        if (!name) return showError('Please enter your name!');

        try {
            const roomSnapshot = await db.ref(`rooms/${code}`).once('value');
            const room = roomSnapshot.val();

            if (!room) return showError('Lobby not found!');
            if (room.status !== 'lobby') return showError('Game already started!');
            if (room.players && room.players[name]) return showError('Name already taken!');

            await db.ref(`rooms/${code}/players/${name}`).set({
                score: 0,
                answer: null,
                answered: false,
                correctCount: 0,
                isHost: false,
                joined: Date.now()
            });

            sessionStorage.setItem('gameCode', code);
            sessionStorage.setItem('playerName', name);
            sessionStorage.setItem('isHost', 'false');
            window.location.href = 'lobby.html';
        } catch (error) {
            showError('Failed to join lobby. Please try again.');
            console.error(error);
        }
    });

    // Also allow Enter key to join
    gameCodeInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            modalJoinBtn.click();
        }
    });
}
