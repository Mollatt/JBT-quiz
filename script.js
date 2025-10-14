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

// Join Lobby
if (document.getElementById('joinBtn')) {
    document.getElementById('joinBtn').addEventListener('click', async () => {
        const code = document.getElementById('gameCodeInput').value.trim().toUpperCase();
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
}

// Auto-uppercase game code
if (document.getElementById('gameCodeInput')) {
    document.getElementById('gameCodeInput').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
}
