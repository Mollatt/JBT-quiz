// Question Generation System
// Dynamically generates quiz questions from song database

class QuestionGenerator {
    constructor() {
        this.questionTemplates = [
            {
                id: "q-game",
                text: "Which game is this music from?",
                field: "specificGame",
                category: "game",
                difficulty: "easy"
            },
            {
                id: "q-series",
                text: "Which game series is this from?",
                field: "seriesSource",
                category: "series",
                difficulty: "easy"
            },
            {
                id: "q-artist",
                text: "Who composed this music?",
                field: "artist",
                category: "composer",
                difficulty: "medium"
            },
            {
                id: "q-developer",
                text: "Which company developed this game?",
                field: "developer",
                category: "developer",
                difficulty: "medium"
            },
            {
                id: "q-title",
                text: "What is the title of this track?",
                field: "title",
                category: "title",
                difficulty: "hard"
            },
            {
                id: "q-area",
                text: "Which area does this music play in?",
                field: "area",
                category: "location",
                difficulty: "hard"
            },
            {
                id: "q-boss",
                text: "Which boss battle features this music?",
                field: "bossBattle",
                category: "boss",
                difficulty: "hard"
            },
            {
                id: "q-year",
                text: "What year was this game released?",
                field: "releaseYear",
                category: "year",
                difficulty: "medium"
            }
        ];
    }

    // Generate questions for a quiz
    async generateQuestions(count, selectedTemplates = null, difficulty = null) {
        try {
            // Get all verified songs from database
            const songsSnapshot = await db.ref('songs')
                .orderByChild('verified')
                .equalTo(true)
                .once('value');

            const songsData = songsSnapshot.val();
            if (!songsData) {
                console.error('No songs found in database');
                return [];
            }

            const songsList = Object.entries(songsData).map(([id, data]) => ({
                id,
                ...data
            }));

            if (songsList.length < count) {
                console.warn(`Only ${songsList.length} songs available, requested ${count}`);
                count = songsList.length;
            }

            const questions = [];
            const usedSongs = new Set();

            for (let i = 0; i < count; i++) {
                // Get random song (avoid duplicates)
                let song;
                let attempts = 0;
                do {
                    song = songsList[Math.floor(Math.random() * songsList.length)];
                    attempts++;
                } while (usedSongs.has(song.id) && attempts < 10);

                if (attempts >= 10) {
                    break; // Not enough unique songs
                }

                usedSongs.add(song.id);

                // Get applicable templates for this song
                let templates = selectedTemplates || this.questionTemplates;
                
                const applicableTemplates = templates.filter(template => {
                    const value = song[template.field];
                    return value && value !== "N/A" && value !== "" && value !== null;
                });

                if (applicableTemplates.length === 0) {
                    continue; // Skip this song if no applicable templates
                }

                // Pick random template
                const template = applicableTemplates[
                    Math.floor(Math.random() * applicableTemplates.length)
                ];

                // Get correct answer
                const correctAnswer = song[template.field];

                // Generate wrong answers
                const wrongAnswers = this.generateWrongAnswers(
                    song,
                    template.field,
                    songsList,
                    3
                );

                // Combine all answers and shuffle
                const allAnswers = [correctAnswer, ...wrongAnswers];
                const shuffled = this.shuffleArray(allAnswers);
                const correctIndex = shuffled.indexOf(correctAnswer);

                // Create question
                const question = {
                    type: "music",
                    youtubeUrl: song.youtubeUrl,
                    startTime: song.startTime || 0,
                    duration: song.duration || 30,
                    text: template.text,
                    options: shuffled,
                    correct: correctIndex,
                    songId: song.id,
                    templateId: template.id
                };

                questions.push(question);
            }

            return questions;

        } catch (error) {
            console.error('Error generating questions:', error);
            return [];
        }
    }

    // Generate wrong answers from other songs
    generateWrongAnswers(correctSong, field, allSongs, count) {
        const wrongAnswers = allSongs
            .filter(song =>
                song[field] !== correctSong[field] &&
                song[field] &&
                song[field] !== "N/A" &&
                song[field] !== null &&
                song.verified === true
            )
            .map(song => song[field])
            .filter((value, index, self) => self.indexOf(value) === index) // Unique only
            .sort(() => Math.random() - 0.5)
            .slice(0, count);

        // If not enough unique wrong answers, pad with N/A
        while (wrongAnswers.length < count) {
            wrongAnswers.push("Unknown");
        }

        return wrongAnswers;
    }

    // Shuffle array
    shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Get template by ID
    getTemplate(id) {
        return this.questionTemplates.find(t => t.id === id);
    }

    // Get all templates
    getAllTemplates() {
        return this.questionTemplates;
    }
}

// Export for use
window.QuestionGenerator = QuestionGenerator;
