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
let nextButtonListeners = new WeakMap(); // Track listeners for buttons

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

    // Check if player already answered current question (after page refresh)
    checkPlayerAnswerStatus();
});

function setupQuestionListener(room) {
    roomRef.child('currentQ').on('value', async (snapshot) => {
        const qIndex = snapshot.val();

        if (qIndex === -1) return;

        if (qIndex >= room.questions.length) {
            await roomRef.update({ status: 'finished' });
            return;
        }

        // Clear previous timers
        if (window.currentTimerInterval) {
            clearInterval(window.currentTimerInterval);
            window.currentTimerInterval = null;
        }

        // Cancel countdown
        cancelNextCountdown();

        // Reset answer state for NEW question
        hasAnswered = false;
        selectedAnswer = null;

        // Stop previous listener
        if (answerCheckListener) {
            playersRef.off('value', answerCheckListener);
            answerCheckListener = null;
        }

        // Load question
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

async function checkPlayerAnswerStatus() {
    // After refresh, check if this player already answered the current question
    const playerSnapshot = await playerRef.once('value');
    const playerData = playerSnapshot.val();
    
    if (playerData && playerData.answered === true) {
        hasAnswered = true;
        selectedAnswer = playerData.answer;
        
        // Disable answer buttons
        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.disabled = true;
        });
        
        // Highlight their answer
        if (selectedAnswer !== null && selectedAnswer !== undefined) {
            document.querySelectorAll('.answer-btn')[selectedAnswer].classList.add('selected');
        }
    }
}

function displayQuestion(question, index) {
    currentQuestion = question;

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

    // Handle music
    const musicPlayerEl = document.getElementById('musicPlayer');
    if (question.type === 'music') {
        musicPlayerEl.style.display = 'none';
        
        if (!musicPlayer) {
            musicPlayer = new YouTubePlayer('musicPlayer');
        }
        
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = question.duration || 30;
            musicPlayer.playClip(question.startTime, duration, (remaining) => {
                const timerEl = document.getElementById('timeLeft');
                if (timerEl) {
                    timerEl.textContent = remaining;
                }
            });
        }).catch(error => {
            console.error('Failed to load music:', error);
        });
    } else {
        musicPlayerEl.style.display = 'none';
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

    // Check if already answered
    playerRef.once('value', snapshot => {
        const playerData = snapshot.val();
        if (playerData && playerData.answered === true && playerData.answer !== null) {
            hasAnswered = true;
            selectedAnswer = playerData.answer;

            document.querySelectorAll('.answer-btn').forEach(btn => {
                btn.disabled = true;
            });

            if (selectedAnswer !== null && selectedAnswer !== undefined) {
                document.querySelectorAll('.answer-btn')[selectedAnswer].classList.add('selected');
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
    if (hasAnswered) return; // Prevent re-answering

    hasAnswered = true;
    selectedAnswer = answerIndex;

    // Disable all buttons
    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.disabled = true;
    });

    // Highlight selected answer
    document.querySelectorAll('.answer-btn')[answerIndex].classList.add('selected');

    // Save to database - this is now COMMITTAL
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
            answered: true  // LOCKED IN - can't answer again
        });

        checkAllAnswered();

    } catch (error) {
        console.error('Error saving answer:', error);
    }
}

function checkAllAnswered() {
    answerCheckListener = playersRef.on('value', async (snapshot) => {
        const players = snapshot.val();
        if (!players) return;

        const playerArray = Object.values(players);
        const answeredCount = playerArray.filter(p => p.answered === true).length;
        const totalPlayers = playerArray.length;

        const progressMsg = document.getElementById('answerProgress');
        if (progressMsg) {
            progressMsg.textContent = `${answeredCount}/${totalPlayers} players answered`;
        }

        if (answeredCount === totalPlayers) {
            playersRef.off('value', answerCheckListener);
            answerCheckListener = null;
            await calculateAndShowResults(players);
        }
    });
}

async function calculateAndShowResults(players) {
    // Stop music
    if (musicPlayer && currentQuestion.type === 'music') {
        musicPlayer.stop();
    }

    if (window.currentTimerInterval) {
        clearInterval(window.currentTimerInterval);
        window.currentTimerInterval = null;
    }

    // Calculate points based on speed ranking
    const correctAnswers = Object.entries(players)
        .filter(([name, data]) => {
            return data.answer === currentQuestion.correct &&
                data.answered === true &&
                data.answerTime != null;
        })
        .sort((a, b) => (a[1].answerTime || Infinity) - (b[1].answerTime || Infinity));

    const pointsScale = [1000, 800, 600, 400];
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

    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    showFeedback(selectedAnswer === currentQuestion.correct);
}

function showFeedback(isCorrect) {
    const feedbackEl = document.getElementById('feedback');
    const buttons = document.querySelectorAll('.answer-btn');

    if (buttons[currentQuestion.correct]) {
        buttons[currentQuestion.correct].classList.add('correct');
    }

    if (!isCorrect && selectedAnswer !== null && selectedAnswer !== undefined && buttons[selectedAnswer]) {
        buttons[selectedAnswer].classList.add('incorrect');
    }

    document.getElementById('answerProgress').style.display = 'none';

    playerRef.once('value', snapshot => {
        const playerData = snapshot.val();
        const points = playerData.lastPoints || 0;
        const currentScore = playerData.score || 0;

        if (isCorrect) {
            feedbackEl.innerHTML = `✅ Correct! <strong>+${points} points</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback correct';
        } else {
            feedbackEl.innerHTML = `❌ Wrong! Correct answer: <strong>${currentQuestion.options[currentQuestion.correct]}</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback incorrect';
        }
        feedbackEl.style.display = 'block';
    });

    roomRef.once('value').then(snapshot => {
        const room = snapshot.val();
        const nextQ = room.currentQ + 1;

        if (nextQ >= room.questions.length) {
            document.getElementById('resultsBtn').style.display = 'block';
        } else {
            const nextBtn = document.getElementById('nextBtn');
            nextBtn.style.display = 'block';
            
            // Create FRESH listener for this button
            const newNextBtn = nextBtn.cloneNode(true);
            nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
            
            newNextBtn.addEventListener('click', () => {
                if (!countdownActive) {
                    startNextCountdown();
                }
            });
        }
    });
}

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
}

document.getElementById('cancelCountdownBtn')?.addEventListener('click', () => {
    cancelNextCountdown();
    
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn && document.getElementById('feedback').style.display !== 'none') {
        nextBtn.style.display = 'block';
    }
});

async function advanceToNextQuestion() {
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();
    
    const nextQ = room.currentQ + 1;
    const totalQ = room.questions.length;

    // Reset all players' answered status for next question
    const players = room.players;
    for (const name in players) {
        await db.ref(`rooms/${gameCode}/players/${name}`).update({
            answered: false,
            answer: null
        });
    }

    if (nextQ >= totalQ) {
        await roomRef.update({ status: 'finished' });
    } else {
        await roomRef.update({ currentQ: nextQ });
    }
}

document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
