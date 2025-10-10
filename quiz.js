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
let selectedAnswer = null;
let hasAnswered = false;
let timer = null;

// Load initial room data
roomRef.once('value').then(snapshot => {
    const room = snapshot.val();
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('totalQ').textContent = room.questions.length;
    
    // Setup listeners
    setupQuestionListener(room);
    setupStatusListener();
    
    if (room.mode === 'auto') {
        setupAutoMode(room);
    }
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

        // Reset state for new question
        hasAnswered = false;
        selectedAnswer = null;
        
        // Clear previous answer and timing data
        await playerRef.update({
            answer: null,
            answerTime: null,
            lastPoints: 0
        });
        
        // Stop any existing listeners
        if (playersRef) {
            playersRef.off('value');
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
        }
    });
}

function setupAutoMode(room) {
    // Only host manages the timer
    if (!isHost) return;

    roomRef.child('currentQ').on('value', async (snapshot) => {
        const qIndex = snapshot.val();
        
        if (qIndex === -1 || qIndex >= room.questions.length) return;

        // Wait a bit before starting timer
        await new Promise(resolve => setTimeout(resolve, 500));

        // Start countdown
        let timeLeft = room.timePerQuestion;
        const timerInterval = setInterval(async () => {
            timeLeft--;
            
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                
                // Move to next question or finish
                const nextQ = qIndex + 1;
                if (nextQ >= room.questions.length) {
                    await roomRef.update({ status: 'finished' });
                } else {
                    await roomRef.update({ currentQ: nextQ });
                }
            }
        }, 1000);
    });
}

function displayQuestion(question, index) {
    currentQuestion = question;
    
    // Update question number
    document.getElementById('currentQ').textContent = index + 1;
    
    // Display question text
    document.getElementById('questionText').textContent = question.text;
    
    // Hide feedback and buttons
    document.getElementById('feedback').style.display = 'none';
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';
    
    // Reset answer progress
    const progressEl = document.getElementById('answerProgress');
    progressEl.textContent = 'Waiting for answers...';
    progressEl.style.display = 'block';
    
    // Render answer options
    const container = document.getElementById('answersContainer');
    container.innerHTML = question.options.map((option, i) => `
        <button class="answer-btn" data-index="${i}">
            ${option}
        </button>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.index)));
    });
    
    // Show timer for auto mode
    roomRef.child('mode').once('value', snapshot => {
        if (snapshot.val() === 'auto') {
            document.getElementById('timerDisplay').style.display = 'block';
            startTimerDisplay();
        }
    });
}

function startTimerDisplay() {
    roomRef.child('timePerQuestion').once('value', snapshot => {
        let timeLeft = snapshot.val();
        const timerEl = document.getElementById('timeLeft');
        
        const interval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = timeLeft;
            
            if (timeLeft <= 0) {
                clearInterval(interval);
            }
        }, 1000);
        
        // Clear interval when question changes
        roomRef.child('currentQ').once('value', () => {
            clearInterval(interval);
        });
    });
}

async function handleAnswer(answerIndex) {
    if (hasAnswered) return;
    
    hasAnswered = true;
    selectedAnswer = answerIndex;
    
    // Disable all buttons
    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.disabled = true;
    });
    
    // Highlight selected answer
    document.querySelectorAll('.answer-btn')[answerIndex].classList.add('selected');
    
    // Save answer with timestamp for ranking
    const answerTime = Date.now();
    const isCorrect = answerIndex === currentQuestion.correct;
    
    try {
        const playerSnapshot = await playerRef.once('value');
        const playerData = playerSnapshot.val();
        
        if (!playerData) {
            console.error('Player data not found');
            return;
        }
        
        const currentScore = playerData.score || 0;
        
        await playerRef.update({
            answer: answerIndex,
            answerTime: answerTime,
            score: isCorrect ? currentScore + 1 : currentScore
        });
        
        // Wait for all players or show waiting message
        checkAllAnswered();
        
    } catch (error) {
        console.error('Error saving answer:', error);
    }
}

function checkAllAnswered() {
    // Listen for all players' answers
    playersRef.on('value', (snapshot) => {
        const players = snapshot.val();
        if (!players) return;
        
        const playerArray = Object.values(players);
        const answeredCount = playerArray.filter(p => p.answer !== null && p.answer !== undefined).length;
        const totalPlayers = playerArray.length;
        
        // Update UI to show progress
        const progressMsg = document.getElementById('answerProgress');
        if (progressMsg) {
            progressMsg.textContent = `${answeredCount}/${totalPlayers} players answered`;
        }
        
        // All players answered - show results
        if (answeredCount === totalPlayers) {
            playersRef.off('value'); // Stop listening
            setTimeout(() => calculateAndShowResults(players), 500);
        }
    });
}

async function calculateAndShowResults(players) {
    // Get current question info
    const roomSnapshot = await roomRef.once('value');
    const room = roomSnapshot.val();
    const currentQ = room.currentQ;
    
    // Calculate points based on speed ranking
    const correctAnswers = Object.entries(players)
        .filter(([name, data]) => data.answer === currentQuestion.correct)
        .sort((a, b) => (a[1].answerTime || 0) - (b[1].answerTime || 0));
    
    // Award points: 1st = 1000, 2nd = 800, 3rd = 600, rest = 400
    const pointsScale = [1000, 800, 600, 400];
    
    for (let i = 0; i < correctAnswers.length; i++) {
        const [name, data] = correctAnswers[i];
        const points = i < pointsScale.length ? pointsScale[i] : 400;
        const newScore = (data.score || 0) + points;
        
        await db.ref(`rooms/${gameCode}/players/${name}`).update({
            score: newScore,
            lastPoints: points
        });
    }
    
    // Show feedback for this player
    const isCorrect = selectedAnswer === currentQuestion.correct;
    showFeedback(isCorrect, players);

    const feedbackEl = document.getElementById('feedback');
    const buttons = document.querySelectorAll('.answer-btn');
    
    // Highlight correct answer
    buttons[currentQuestion.correct].classList.add('correct');
    
    // Highlight wrong answer if applicable
    if (!isCorrect && selectedAnswer !== null) {
        buttons[selectedAnswer].classList.add('incorrect');
    }
    
    // Show feedback message
    feedbackEl.textContent = isCorrect ? '✅ Correct!' : `❌ Wrong! Correct answer: ${currentQuestion.options[currentQuestion.correct]}`;
    feedbackEl.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`;
    feedbackEl.style.display = 'block';
    
    // Show next button or waiting message
    roomRef.once('value').then(snapshot => {
        const room = snapshot.val();
        const nextQ = room.currentQ + 1;
        
        if (room.mode === 'host' && isHost) {
            if (nextQ >= room.questions.length) {
                document.getElementById('resultsBtn').style.display = 'block';
            } else {
                document.getElementById('nextBtn').style.display = 'block';
            }
        } else if (room.mode === 'host' && !isHost) {
            document.getElementById('waitingMsg').style.display = 'block';
        }
    });
}

// Next button handler (host only)
document.getElementById('nextBtn')?.addEventListener('click', async () => {
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();
    
    await roomRef.update({ currentQ: room.currentQ + 1 });
});

// Results button handler (host only)
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
