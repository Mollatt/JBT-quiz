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
let answerCheckListener = null;

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

        // Clear any existing timer
        if (window.currentTimerInterval) {
            clearInterval(window.currentTimerInterval);
            window.currentTimerInterval = null;
        }

        // Reset calculation flag
        window.resultsCalculated = false;

        // Reset state for new question
        hasAnswered = false;
        selectedAnswer = null;
        
        // Stop previous answer listener if exists
        if (answerCheckListener) {
            playersRef.off('value', answerCheckListener);
            answerCheckListener = null;
        }
        
        // Clear previous answer and timing data
        await playerRef.update({
            answer: null,
            answerTime: null,
            lastPoints: 0
        });
        
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
    // Only host manages the timer in auto mode
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
                
                // Force show results even if not everyone answered
                await forceShowResults();
                
                // Wait 3 seconds then move to next
                setTimeout(async () => {
                    const nextQ = qIndex + 1;
                    if (nextQ >= room.questions.length) {
                        await roomRef.update({ status: 'finished' });
                    } else {
                        await roomRef.update({ currentQ: nextQ });
                    }
                }, 3000);
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
    
    // Reset and show answer progress
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
    
    // Check if this player already answered (after refresh)
    playerRef.once('value', snapshot => {
        const playerData = snapshot.val();
        if (playerData && playerData.answered === true) {
            // Player already answered, disable buttons
            hasAnswered = true;
            selectedAnswer = playerData.answer;
            
            document.querySelectorAll('.answer-btn').forEach(btn => {
                btn.disabled = true;
            });
            
            // Highlight their previous answer
            if (playerData.answer !== null && playerData.answer !== undefined) {
                document.querySelectorAll('.answer-btn')[playerData.answer].classList.add('selected');
            }
            
            // Start checking for all answers
            checkAllAnswered();
        }
    });
    
    // Show timer display
    roomRef.child('mode').once('value', snapshot => {
        const mode = snapshot.val();
        const timerDisplay = document.getElementById('timerDisplay');
        
        if (mode === 'auto') {
            timerDisplay.style.display = 'block';
            startTimerDisplay();
        } else {
            // Host mode also shows a timer but doesn't auto-advance
            timerDisplay.style.display = 'block';
            startHostTimer();
        }
    });
}

function startTimerDisplay() {
    roomRef.child('timePerQuestion').once('value', snapshot => {
        let timeLeft = snapshot.val() || 15;
        const timerEl = document.getElementById('timeLeft');
        timerEl.textContent = timeLeft;
        
        const interval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = Math.max(0, timeLeft);
            
            if (timeLeft <= 0) {
                clearInterval(interval);
            }
        }, 1000);
        
        // Store interval ID to clear later
        window.currentTimerInterval = interval;
    });
}

function startHostTimer() {
    // For host mode, show elapsed time instead of countdown
    const timerEl = document.getElementById('timeLeft');
    let timeElapsed = 0;
    timerEl.textContent = timeElapsed;
    
    const interval = setInterval(() => {
        timeElapsed++;
        timerEl.textContent = timeElapsed;
    }, 1000);
    
    // Store interval ID to clear later
    window.currentTimerInterval = interval;
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
        
        await playerRef.update({
            answer: answerIndex,
            answerTime: answerTime,
            answered: true
        });
        
        // Start checking if all players have answered
        checkAllAnswered();
        
    } catch (error) {
        console.error('Error saving answer:', error);
    }
}

function checkAllAnswered() {
    // Create a one-time listener for answer changes
    answerCheckListener = playersRef.on('value', async (snapshot) => {
        const players = snapshot.val();
        if (!players) return;
        
        const playerArray = Object.values(players);
        const answeredCount = playerArray.filter(p => p.answered === true).length;
        const totalPlayers = playerArray.length;
        
        // Update UI to show progress
        const progressMsg = document.getElementById('answerProgress');
        if (progressMsg) {
            progressMsg.textContent = `${answeredCount}/${totalPlayers} players answered`;
        }
        
        // All players answered - show results
        if (answeredCount === totalPlayers) {
            playersRef.off('value', answerCheckListener);
            answerCheckListener = null;
            await calculateAndShowResults(players);
        }
    });
}

async function forceShowResults() {
    const snapshot = await playersRef.once('value');
    const players = snapshot.val();
    if (players) {
        await calculateAndShowResults(players);
    }
}

async function calculateAndShowResults(players) {
    // Prevent double calculation
    if (window.resultsCalculated) {
        showFeedback(selectedAnswer === currentQuestion.correct);
        return;
    }
    window.resultsCalculated = true;
    
    // Calculate points based on speed ranking - ONLY for players who answered
    const correctAnswers = Object.entries(players)
        .filter(([name, data]) => {
            return data.answer === currentQuestion.correct && 
                   data.answered === true && 
                   data.answerTime != null;
        })
        .sort((a, b) => (a[1].answerTime || Infinity) - (b[1].answerTime || Infinity));
    
    // Award points: 1st = 1000, 2nd = 800, 3rd = 600, rest = 400
    const pointsScale = [1000, 800, 600, 400];
    
    // Use a batch update to prevent race conditions
    const updates = {};
    
    for (let i = 0; i < correctAnswers.length; i++) {
        const [name, data] = correctAnswers[i];
        const points = i < pointsScale.length ? pointsScale[i] : 400;
        const currentScore = data.score || 0;
        const newScore = currentScore + points;
        
        updates[`rooms/${gameCode}/players/${name}/score`] = newScore;
        updates[`rooms/${gameCode}/players/${name}/lastPoints`] = points;
    }
    
    // Apply all updates at once
    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }
    
    // Small delay to ensure database updates
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Show feedback for this player
    const isCorrect = selectedAnswer === currentQuestion.correct;
    showFeedback(isCorrect);
}

function showFeedback(isCorrect) {
    const feedbackEl = document.getElementById('feedback');
    const buttons = document.querySelectorAll('.answer-btn');
    
    // Always highlight the correct answer in green
    if (buttons[currentQuestion.correct]) {
        buttons[currentQuestion.correct].classList.add('correct');
    }
    
    // Highlight wrong answer if applicable
    if (!isCorrect && selectedAnswer !== null && selectedAnswer !== undefined && buttons[selectedAnswer]) {
        buttons[selectedAnswer].classList.add('incorrect');
    }
    
    // Hide answer progress
    document.getElementById('answerProgress').style.display = 'none';
    
    // Get points earned this round
    playerRef.once('value', snapshot => {
        const playerData = snapshot.val();
        const points = playerData.lastPoints || 0;
        const currentScore = playerData.score || 0;
        
        // Show feedback message with points
        if (isCorrect) {
            feedbackEl.innerHTML = `✅ Correct! <strong>+${points} points</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback correct';
        } else {
            feedbackEl.innerHTML = `❌ Wrong! Correct answer: <strong>${currentQuestion.options[currentQuestion.correct]}</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback incorrect';
        }
        feedbackEl.style.display = 'block';
    });
    
    // Show next button for host
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
        } else if (room.mode === 'auto') {
            // In auto mode, show waiting message
            document.getElementById('waitingMsg').textContent = 'Next question starting soon...';
            document.getElementById('waitingMsg').style.display = 'block';
        }
    });
}

// Next button handler (host only)
document.getElementById('nextBtn')?.addEventListener('click', async () => {
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();
    
    // Reset all players' answered status
    const players = room.players;
    for (const name in players) {
        await db.ref(`rooms/${gameCode}/players/${name}`).update({
            answered: false
        });
    }
    
    await roomRef.update({ currentQ: room.currentQ + 1 });
});

// Results button handler (host only)
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
