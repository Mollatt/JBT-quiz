// Get session data
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

const roomRef = db.ref(`rooms/${gameCode}`);
const playerRef = db.ref(`rooms/${gameCode}/players/${playerName}`);
const playersRef = db.ref(`rooms/${gameCode}/players`);

let currentQuestion = null;
let musicPlayer = null;
let isLockedOut = false;
let lockoutTimer = null;

// Load initial room data
roomRef.once('value').then(snapshot => {
    const room = snapshot.val();
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('totalQ').textContent = room.questions.length;
    
    setupQuestionListener(room);
    setupStatusListener();
    setupBuzzListener();
});

function setupQuestionListener(room) {
    roomRef.child('currentQ').on('value', async (snapshot) => {
        const qIndex = snapshot.val();

        if (qIndex === -1) return;

        // Check if quiz is finished
        if (qIndex >= room.questions.length) {
            await roomRef.update({ status: 'finished' });
            return;
        }

        // Reset buzzer state for new question
        await roomRef.update({
            buzzedPlayer: null,
            buzzTime: null,
            buzzerLocked: false,
            lockedOutPlayer: null
        });

        isLockedOut = false;
        if (lockoutTimer) {
            clearInterval(lockoutTimer);
            lockoutTimer = null;
        }

        // Load and display question
        displayQuestion(room.questions[qIndex], qIndex);
    });
}

function setupStatusListener() {
    roomRef.child('status').on('value', (snapshot) => {
        const status = snapshot.val();
        if (status === 'finished') {
            window.location.href = 'results.html';
        } else if (status === 'scoreboard') {
            window.location.href = 'scoreboard.html';
        }
    });
}

function setupBuzzListener() {
    roomRef.child('buzzedPlayer').on('value', (snapshot) => {
        const buzzedPlayer = snapshot.val();
        
        if (buzzedPlayer) {
            handleBuzzed(buzzedPlayer);
        } else {
            // Buzz cleared - handle resuming
            handleBuzzCleared();
        }
    });
}

function displayQuestion(question, index) {
    currentQuestion = question;

    // Update question number
    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    // Hide all UI elements initially
    document.getElementById('buzzerSection').style.display = 'none';
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('hostControls').style.display = 'none';
    document.getElementById('continueBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('lockoutMsg').style.display = 'none';

    // Show buzzer for non-hosts
    if (!isHost) {
        document.getElementById('buzzerSection').style.display = 'block';
    }

    // Initialize and play music
    const musicPlayerEl = document.getElementById('musicPlayer');
    if (!musicPlayer) {
        musicPlayer = new YoutubePlayer('musicPlayer');
    }

    if (question.type === 'music' && question.youtubeUrl) {
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = question.duration || 30;
            
            // Play music with timer sync
            musicPlayer.playClip(question.startTime, duration, (remaining) => {
                document.getElementById('timeLeft').textContent = remaining;
                
                // Time's up
                if (remaining <= 0) {
                    handleTimeUp();
                }
            });
        }).catch(error => {
            console.error('Failed to load music:', error);
        });
    }
}

// Player buzzes
document.getElementById('buzzerBtn')?.addEventListener('click', async () => {
    if (isLockedOut || isHost) return;

    const buzzTime = Date.now();
    
    // Try to set buzz (race condition handled by Firebase)
    const buzzedPlayerRef = roomRef.child('buzzedPlayer');
    const currentBuzz = await buzzedPlayerRef.once('value');
    
    if (!currentBuzz.val()) {
        // First to buzz!
        await roomRef.update({
            buzzedPlayer: playerName,
            buzzTime: buzzTime,
            buzzerLocked: true
        });
    }
});

function handleBuzzed(buzzedPlayerName) {
    // Pause music
    if (musicPlayer) {
        musicPlayer.pause();
    }

    // Show who buzzed
    document.getElementById('buzzDisplay').style.display = 'block';
    document.getElementById('buzzedPlayer').textContent = buzzedPlayerName;

    // Hide buzzer
    document.getElementById('buzzerSection').style.display = 'none';

    // Show host controls
    if (isHost) {
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('correctAnswer').textContent = currentQuestion.options[currentQuestion.correct];
    }
}

function handleBuzzCleared() {
    // Hide buzz display
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('hostControls').style.display = 'none';

    // Check if this player should be locked out
    roomRef.child('lockedOutPlayer').once('value', (snapshot) => {
        const lockedOutPlayerName = snapshot.val();
        
        if (!isHost) {
            if (playerName === lockedOutPlayerName) {
                // This player is locked out
                isLockedOut = true;
                document.getElementById('lockoutMsg').style.display = 'block';
                document.getElementById('buzzerSection').style.display = 'none';
                
                let timeLeft = 5;
                document.getElementById('lockoutTime').textContent = timeLeft;
                
                if (lockoutTimer) {
                    clearInterval(lockoutTimer);
                }
                
                lockoutTimer = setInterval(() => {
                    timeLeft--;
                    document.getElementById('lockoutTime').textContent = timeLeft;
                    
                    if (timeLeft <= 0) {
                        clearInterval(lockoutTimer);
                        lockoutTimer = null;
                        isLockedOut = false;
                        document.getElementById('lockoutMsg').style.display = 'none';
                        document.getElementById('buzzerSection').style.display = 'block';
                        
                        // Clear the lockout flag in database
                        roomRef.child('lockedOutPlayer').remove();
                    }
                }, 1000);
            } else {
                // Other players can buzz again immediately
                document.getElementById('buzzerSection').style.display = 'block';
                document.getElementById('lockoutMsg').style.display = 'none';
            }
        }
    });

    // Resume music from where it paused
    if (musicPlayer && currentQuestion && currentQuestion.type === 'music') {
        musicPlayer.play();
    }
}

// Host clicks Correct
document.getElementById('correctBtn')?.addEventListener('click', async () => {
    const buzzedPlayerName = (await roomRef.child('buzzedPlayer').once('value')).val();
    
    if (buzzedPlayerName) {
        // Award points
        const playerSnapshot = await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).once('value');
        const playerData = playerSnapshot.val();
        const newScore = (playerData.score || 0) + 1000;
        const correctCount = (playerData.correctCount || 0) + 1;
        
        await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({
            score: newScore,
            correctCount: correctCount,
            lastPoints: 1000
        });
    }

    // Move to next question
    await advanceQuestion();
});

// Host clicks Wrong
document.getElementById('wrongBtn')?.addEventListener('click', async () => {
    const buzzedPlayerName = (await roomRef.child('buzzedPlayer').once('value')).val();
    
    if (buzzedPlayerName) {
        // Deduct points
        const playerSnapshot = await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).once('value');
        const playerData = playerSnapshot.val();
        const newScore = (playerData.score || 0) - 250;
        
        await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({
            score: newScore,
            lastPoints: -250
        });

        // Set who is locked out, then clear buzz state
        await roomRef.update({
            lockedOutPlayer: buzzedPlayerName,
            buzzedPlayer: null,
            buzzerLocked: false
        });
    }
});

function handleTimeUp() {
    // Stop music
    if (musicPlayer) {
        musicPlayer.stop();
    }

    // Hide buzzer
    document.getElementById('buzzerSection').style.display = 'none';

    // Show continue button for host
    if (isHost) {
        roomRef.once('value').then(snapshot => {
            const roomData = snapshot.val();
            const nextQ = roomData.currentQ + 1;
            
            if (nextQ >= roomData.questions.length) {
                document.getElementById('resultsBtn').style.display = 'block';
            } else {
                document.getElementById('continueBtn').style.display = 'block';
            }
        });
    }
}

async function advanceQuestion() {
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();
    
    const nextQ = room.currentQ + 1;
    const totalQ = room.questions.length;
    
    if (nextQ >= totalQ) {
        await roomRef.update({ status: 'finished' });
    } else if (shouldShowScoreboard(nextQ, totalQ)) {
        await roomRef.update({ 
            currentQ: nextQ,
            status: 'scoreboard'
        });
    } else {
        await roomRef.update({ currentQ: nextQ });
    }
}

// Calculate scoreboard display points
function shouldShowScoreboard(currentQ, totalQ) {
    if (totalQ <= 5) {
        return currentQ === Math.floor(totalQ * 0.5);
    } else if (totalQ <= 10) {
        const showPoints = [
            Math.floor(totalQ * 0.33),
            Math.floor(totalQ * 0.66)
        ];
        return showPoints.includes(currentQ);
    } else {
        const showPoints = [
            Math.floor(totalQ * 0.25),
            Math.floor(totalQ * 0.5),
            Math.floor(totalQ * 0.75)
        ];
        return showPoints.includes(currentQ);
    }
}

// Continue button (host only, after time runs out)
document.getElementById('continueBtn')?.addEventListener('click', async () => {
    await advanceQuestion();
});

// Results button (host only, after last question)
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});

// Skip button (host only) - advances to next question without scoring
document.getElementById('skipBtn')?.addEventListener('click', async () => {
    if (!isHost) return;

    if (confirm('Skip this question without scoring?')) {
        await advanceQuestion();
    }
});
