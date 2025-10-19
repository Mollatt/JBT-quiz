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
let musicPlayer = null;
let nextQuestionCountdown = null;
let countdownActive = false;

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

        // Cancel any pending next question countdown
        cancelNextCountdown();

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
            lastPoints: 0,
            answered: false
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
        } else if (status === 'scoreboard') {
            window.location.href = 'scoreboard.html';
        }
    });
}

function displayQuestion(question, index) {
    currentQuestion = question;

    // Update question number
    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    // Hide feedback and buttons
    document.getElementById('feedback').style.display = 'none';
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';
    document.getElementById('nextCountdown').style.display = 'none';

    // Reset and show answer progress
    const progressEl = document.getElementById('answerProgress');
    progressEl.textContent = 'Waiting for answers...';
    progressEl.style.display = 'block';

    // Handle music questions
    const musicPlayerEl = document.getElementById('musicPlayer');
    if (question.type === 'music') {
        musicPlayerEl.style.display = 'none';
        
        // Initialize music player if not already done
        if (!musicPlayer) {
            musicPlayer = new YouTubePlayer('musicPlayer');
        }
        
        // Load the track
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = question.duration || 30;
            
            // Play with timer callback
            musicPlayer.playClip(question.startTime, duration, (remaining) => {
                const timerEl = document.getElementById('timeLeft');
                if (timerEl) {
                    timerEl.textContent = remaining;
                }
            });
            
        }).catch(error => {
            console.error('Failed to load music:', error);
            document.getElementById('questionText').innerHTML += '<br><span style="color: #ff6b6b; font-size: 0.9rem;">⚠️ Music failed to load</span>';
        });
    } else {
        musicPlayerEl.style.display = 'none';
        // Stop any playing music
        if (musicPlayer) {
            musicPlayer.stop();
        }
    }

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
            hasAnswered = true;
            selectedAnswer = playerData.answer;

            document.querySelectorAll('.answer-btn').forEach(btn => {
                btn.disabled = true;
            });

            if (playerData.answer !== null && playerData.answer !== undefined) {
                document.querySelectorAll('.answer-btn')[playerData.answer].classList.add('selected');
            }

            checkAllAnswered();
        }
    });

    // Show timer display
    const timerDisplay = document.getElementById('timerDisplay');
    if (question.type === 'music') {
        timerDisplay.style.display = 'block';
        const duration = question.duration || 30;
        document.getElementById('timeLeft').textContent = duration;
    } else {
        timerDisplay.style.display = 'none';
    }
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

async function calculateAndShowResults(players) {
    // Stop timer and music
    if (window.currentTimerInterval) {
        clearInterval(window.currentTimerInterval);
        window.currentTimerInterval = null;
    }
    
    if (musicPlayer && currentQuestion.type === 'music') {
        musicPlayer.stop();
    }

    // Calculate points based on speed ranking
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
        const correctCount = (data.correctCount || 0) + 1;

        updates[`rooms/${gameCode}/players/${name}/score`] = newScore;
        updates[`rooms/${gameCode}/players/${name}/lastPoints`] = points;
        updates[`rooms/${gameCode}/players/${name}/correctCount`] = correctCount;
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

    // Show next button for ALL players
    roomRef.once('value').then(snapshot => {
        const room = snapshot.val();
        const nextQ = room.currentQ + 1;

        if (nextQ >= room.questions.length) {
            document.getElementById('resultsBtn').style.display = 'block';
        } else {
            document.getElementById('nextBtn').style.display = 'block';
            // Setup listener for next button after it appears
            setupNextButtonListener();
        }
    });
}

// Next button handler (all players can click)
const setupNextButtonListener = () => {
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
        // Remove old listeners
        nextBtn.replaceWith(nextBtn.cloneNode(true));
        const newNextBtn = document.getElementById('nextBtn');
        newNextBtn.addEventListener('click', async () => {
            if (!countdownActive) {
                startNextCountdown();
            }
        });
    }
};

function startNextCountdown() {
    countdownActive = true;
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('nextCountdown').style.display = 'block';
    
    let timeLeft = 3;
    const countdownEl = document.getElementById('nextCountdownTime');
    countdownEl.textContent = timeLeft;
    
    nextQuestionCountdown = setInterval(() => {
        timeLeft--;
        countdownEl.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(nextQuestionCountdown);
            nextQuestionCountdown = null;
            advanceToNextQuestion();
        }
    }, 1000);
}

function cancelNextCountdown() {
    if (nextQuestionCountdown) {
        clearInterval(nextQuestionCountdown);
        nextQuestionCountdown = null;
        countdownActive = false;
    }
    
    document.getElementById('nextCountdown').style.display = 'none';
    
    // Re-show next button if still on results screen
    roomRef.once('value').then(snapshot => {
        const room = snapshot.val();
        const nextQ = room.currentQ + 1;
        
        if (nextQ < room.questions.length && document.getElementById('feedback').style.display !== 'none') {
            document.getElementById('nextBtn').style.display = 'block';
        }
    });
}

// Cancel button for countdown
document.getElementById('cancelCountdownBtn')?.addEventListener('click', () => {
    cancelNextCountdown();
});

async function advanceToNextQuestion() {
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();
    
    const nextQ = room.currentQ + 1;
    const totalQ = room.questions.length;

    // Reset all players' answered status
    const players = room.players;
    for (const name in players) {
        await db.ref(`rooms/${gameCode}/players/${name}`).update({
            answered: false
        });
    }

    if (nextQ >= totalQ) {
        await roomRef.update({ status: 'finished' });
    } else {
        await roomRef.update({ currentQ: nextQ });
    }
}

// Results button handler
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
