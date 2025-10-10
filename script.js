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

// Sample quiz questions - you can replace these with your own
const sampleQuestions = [
    {
        text: "What is the capital of France?",
        options: ["Paris", "London", "Berlin", "Madrid"],
        correct: 0
    },
    {
        text: "Which planet is known as the Red Planet?",
        options: ["Venus", "Mars", "Jupiter", "Saturn"],
        correct: 1
    },
    {
        text: "What is 7 × 8?",
        options: ["54", "56", "58", "62"],
        correct: 1
    },
    {
        text: "Who painted the Mona Lisa?",
        options: ["Van Gogh", "Picasso", "Da Vinci", "Monet"],
        correct: 2
    },
    {
        text: "What is the largest ocean on Earth?",
        options: ["Atlantic", "Indian", "Arctic", "Pacific"],
        correct: 3
    }
];

// Debug: Check if Firebase is loaded
console.log('Script loaded!');
console.log('Firebase available:', typeof firebase !== 'undefined');
console.log('Database available:', typeof db !== 'undefined');

// HOME PAGE LOGIC
if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/')) {
    console.log('Home page detected');
    const nameInput = document.getElementById('nameInput');
    const codeInput = document.getElementById('gameCodeInput');
    
    console.log('Name input found:', !!nameInput);
    console.log('Code input found:', !!codeInput);

    // Create Host-Controlled Game
    const createHostBtn = document.getElementById('createHostBtn');
    console.log('Create host button found:', !!createHostBtn);
    
    createHostBtn?.addEventListener('click', async () => {
        console.log('Create host button clicked!');
        
        // Check if Firebase is ready
        if (typeof db === 'undefined') {
            alert('Firebase not initialized! Check your firebase-config.js file.');
            console.error('Firebase database not available');
            return;
        }
        
        const name = sanitizeName(nameInput.value);
        console.log('Name entered:', name);
        
        if (!name) return showError('Please enter your name!');

        const code = generateCode();
        const roomData = {
            host: name,
            mode: 'host',
            status: 'lobby',
            currentQ: -1,
            created: Date.now(),
            questions: sampleQuestions,
            players: {
                [name]: {
                    score: 0,
                    answer: null,
                    answered: false,
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
            showError('Failed to create game. Please try again.');
            console.error(error);
        }
    });

    // Create Auto-Play Game
    document.getElementById('createAutoBtn')?.addEventListener('click', async () => {
        const name = sanitizeName(nameInput.value);
        if (!name) return showError('Please enter your name!');

        const code = generateCode();
        const roomData = {
            host: name,
            mode: 'auto',
            status: 'lobby',
            currentQ: -1,
            timePerQuestion: 15,
            created: Date.now(),
            questions: sampleQuestions,
            players: {
                [name]: {
                    score: 0,
                    answer: null,
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
            showError('Failed to create game. Please try again.');
            console.error(error);
        }
    });

    // Join Game
    document.getElementById('joinBtn')?.addEventListener('click', async () => {
        const code = codeInput.value.trim().toUpperCase();
        const name = sanitizeName(nameInput.value);

        if (!code) return showError('Please enter a game code!');
        if (!name) return showError('Please enter your name!');

        try {
            const roomSnapshot = await db.ref(`rooms/${code}`).once('value');
            const room = roomSnapshot.val();

            if (!room) return showError('Game not found!');
            if (room.status !== 'lobby') return showError('Game already started!');
            if (room.players && room.players[name]) return showError('Name already taken!');

            await db.ref(`rooms/${code}/players/${name}`).set({
                score: 0,
                answer: null,
                isHost: false,
                joined: Date.now()
            });

            sessionStorage.setItem('gameCode', code);
            sessionStorage.setItem('playerName', name);
            sessionStorage.setItem('isHost', 'false');
            window.location.href = 'lobby.html';
        } catch (error) {
            showError('Failed to join game. Please try again.');
            console.error(error);
        }
    });

    // Auto-uppercase game code
    codeInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
}



