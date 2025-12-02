const roomCache = new Map();
const CACHE_TTL = 500; // Cache for 500ms


/**
 * @returns {string} 8-character alphanumeric ID
 */
function generatePlayerId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

/**
 * Get room data with all players (with caching)
 * @param {string} code - Room code
 * @returns {Promise<Object|null>} Room data or null
 */
async function getRoom(code) {
    // Check cache
    const cached = roomCache.get(code);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    try {
        // Get room and players in parallel
        const [roomResult, playersResult] = await Promise.all([
            supabase.from('rooms').select('*').eq('code', code).single(),
            supabase.from('players').select('*').eq('room_code', code)
        ]);

        if (roomResult.error) {
            if (roomResult.error.code === 'PGRST116') return null;
            throw roomResult.error;
        }

        if (playersResult.error) throw playersResult.error;

        // Convert to app format
        const room = convertRoomFromDB(roomResult.data);
        room.players = {};

        playersResult.data.forEach(player => {
            room.players[player.name] = convertPlayerFromDB(player);
        });

        // Cache result
        roomCache.set(code, {
            data: room,
            timestamp: Date.now()
        });

        return room;
    } catch (error) {
        console.error('Error getting room:', error);
        return null;
    }
}


/**
 * Create a new game room
 * @param {string} code - 4-character room code
 * @param {string} hostName - Name of the host player
 * @param {string} mode - Game mode ('everybody' or 'buzzer')
 * @returns {Promise} Room creation result
 */
async function createRoom(code, hostName, mode = 'everybody') {
    try {
        // Create room
        const { data: roomData, error: roomError } = await supabase
            .from('rooms')
            .insert([{
                code: code,
                host: hostName,
                mode: mode,
                status: 'lobby',
                current_q: -1,
                questions: null,
                game_params: {
                    correctPointsScale: [1000, 800, 600, 400],
                    numQuestions: 10,
                    selectedCategories: ['game', 'series', 'composer', 'developer', 'title', 'location', 'boss', 'year'],
                    releaseYearMin: null,
                    releaseYearMax: null
                }
            }])
            .select()
            .single();

        if (roomError) throw roomError;

        // Create host player
        const hostPlayerId = generatePlayerId();
        const { data: playerData, error: playerError } = await supabase
            .from('players')
            .insert([{
                room_code: code,
                player_id: hostPlayerId,
                name: hostName,
                score: 0,
                is_host: true,
                last_seen: Date.now()
            }])
            .select()
            .single();

        if (playerError) throw playerError;

        return { success: true, room: roomData, player: playerData };
    } catch (error) {
        console.error('Error creating room:', error);
        alert(`Failed to create room: ${error.message}`);
        return { success: false, error };
    }
}

/**
 * Get room data with all players
 * @param {string} code - Room code
 * @returns {Promise<Object|null>} Room data or null
 */
async function getRoom(code) {
    try {
        // Get room
        const { data: roomData, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('code', code)
            .single();

        if (roomError) {
            if (roomError.code === 'PGRST116') return null; // Not found
            throw roomError;
        }

        // Get players
        const { data: playersData, error: playersError } = await supabase
            .from('players')
            .select('*')
            .eq('room_code', code);

        if (playersError) throw playersError;

        // Convert to Firebase-like structure
        const room = convertRoomFromDB(roomData);
        room.players = {};

        playersData.forEach(player => {
            room.players[player.name] = convertPlayerFromDB(player);
        });

        return room;
    } catch (error) {
        console.error('Error getting room:', error);
        return null;
    }
}

/**
 * Update room fields
 * @param {string} code - Room code
 * @param {Object} updates - Fields to update
 * @returns {Promise}
 */
async function updateRoom(code, updates) {
    try {
        const dbUpdates = convertRoomToDB(updates);

        const { error } = await supabase
            .from('rooms')
            .update(dbUpdates)
            .eq('code', code);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error updating room:', error);
        alert(`Failed to update room: ${error.message}`);
        return { success: false, error };
    }
}

/**
 * Delete a room (cascade deletes players)
 * @param {string} code - Room code
 * @returns {Promise}
 */
async function deleteRoom(code) {
    try {
        const { error } = await supabase
            .from('rooms')
            .delete()
            .eq('code', code);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error deleting room:', error);
        return { success: false, error };
    }
}

// PLAYERS - Create, Read, Update, Delete
// ============================================

/**
 * Add a player to a room
 * @param {string} code - Room code 
 * @param {string} playerName - Player name
 * @param {boolean} isHost - Whether player is host
 * @returns {Promise}
 */
async function addPlayer(code, playerName, isHost = false) {
    try {
        const playerId = generatePlayerId();

        let buzzerSoundId = null;
        if (!isHost) {
            buzzerSoundId = await getNextAvailableBuzzerSound(code);
        }

        const { data, error } = await supabase
            .from('players')
            .insert([{
                room_code: code,
                player_id: playerId,
                name: playerName,
                score: 0,
                is_host: isHost,
                last_seen: Date.now(),
                buzzer_sound_id: buzzerSoundId
            }])
            .select()
            .single();

        if (error) throw error;
        return { success: true, player: data };
    } catch (error) {
        console.error('Error adding player:', error);
        alert(`Failed to join room: ${error.message}`);
        return { success: false, error };
    }
}

/**
 * Update player fields
 * @param {string} code - Room code (CHANGED from roomCode)
 * @param {string} playerName - Player name
 * @param {Object} updates - Fields to update
 * @returns {Promise}
 */
async function updatePlayer(code, playerNameOrId, updates) {
    try {
        const dbUpdates = convertPlayerToDB(updates);
        const isPlayerId = playerNameOrId.length === 8 && !playerNameOrId.includes(' ');
        const query = supabase
            .from('players')
            .update(dbUpdates)
            .eq('room_code', code);

        if (isPlayerId) {
            query.eq('player_id', playerNameOrId);
        } else {
            query.eq('name', playerNameOrId);
        }

        const { error } = await query;

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error updating player:', error);
        alert(`Failed to update player: ${error.message}`);
        return { success: false, error };
    }
}

/**
 * Remove a player from a room
 * @param {string} code - Room code (CHANGED from roomCode)
 * @param {string} playerName - Player name
 * @returns {Promise}
 */
async function removePlayer(code, playerNameOrId) {
    try {
        const isPlayerId = playerNameOrId.length === 8 && !playerNameOrId.includes(' ');
        const query = supabase
            .from('players')
            .delete()
            .eq('room_code', code);

        if (isPlayerId) {
            query.eq('player_id', playerNameOrId);
        } else {
            query.eq('name', playerNameOrId);
        }

        const { error } = await query;

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error removing player:', error);
        return { success: false, error };
    }
}

/**
 * @param {string} code - Room code
 * @param {string} playerId - Player ID
 * @param {string} newName - New name
 * @returns {Promise}
 */
async function changePlayerName(code, playerId, newName) {
    try {
        const { data: existingPlayer, error: checkError } = await supabase
            .from('players')
            .select('player_id')
            .eq('room_code', code)
            .eq('name', newName)
            .single();

        if (existingPlayer && existingPlayer.player_id !== playerId) {
            return { success: false, error: 'Name already taken' };
        }

        const { error } = await supabase
            .from('players')
            .update({ name: newName })
            .eq('room_code', code)
            .eq('player_id', playerId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error changing player name:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all players in a room
 * @param {string} code - Room code (CHANGED from roomCode)
 * @returns {Promise<Object>} Players object keyed by name
 */
async function getPlayers(code) {
    try {
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('room_code', code);  // CHANGED: using 'code' parameter

        if (error) throw error;

        const players = {};
        data.forEach(player => {
            players[player.name] = convertPlayerFromDB(player);
        });

        return players;
    } catch (error) {
        console.error('Error getting players:', error);
        return {};
    }
}

// REAL-TIME SUBSCRIPTIONS
// ============================================

/**
 * Subscribe to room changes
 * @param {string} code - Room code
 * @param {Function} callback - Called when room/players change
 * @returns {Object} Subscription channel (call unsubscribe() to stop)
 */
function subscribeToRoom(code, callback) {
    console.log('subscribeToRoom called for:', code);

    // Create unique channel name
    const channelName = `room_${code}_${Math.random().toString(36).substr(2, 9)}`;

    const channel = supabase
        .channel(channelName)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'rooms',
                filter: `code=eq.${code}`
            },
            async (payload) => {
                console.log('Rooms table changed:', payload);
                const room = await getRoom(code);
                callback(room);
            }
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'players',
                filter: `room_code=eq.${code}`
            },
            async (payload) => {
                console.log('Players table changed:', payload);
                const room = await getRoom(code);
                callback(room);
            }
        )
        .subscribe((status, err) => {
            console.log('Room subscription status:', status);
            if (err) console.error('Subscription error:', err);
        });

    // Do initial fetch
    getRoom(code).then(callback);

    return channel;
}

/**
 * Subscribe to specific room field
 * @param {string} code - Room code
 * @param {string} field - Field name (e.g., 'status', 'currentQ')
 * @param {Function} callback - Called with field value
 * @returns {Object} Subscription channel
 */
function subscribeToRoomField(code, field, callback) {
    console.log('subscribeToRoomField called for:', code, field);

    const dbField = camelToSnake(field);
    const channelName = `room_${code}_${field}_${Math.random().toString(36).substr(2, 9)}`;

    const channel = supabase
        .channel(channelName)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'rooms',
                filter: `code=eq.${code}`
            },
            async (payload) => {
                console.log(`Room field ${field} changed:`, payload);

                if (payload.new && payload.new[dbField] !== undefined) {
                    callback(payload.new[dbField]);
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'DELETE',
                schema: 'public',
                table: 'rooms',
                filter: `code=eq.${code}`
            },
            () => {
                console.log(`Room ${code} deleted`);
                callback(null);
            }
        )
        .subscribe((status, err) => {
            console.log(`Field ${field} subscription status:`, status);
            if (err) console.error('Subscription error:', err);
        });

    // Do initial fetch
    getRoom(code).then(room => {
        if (room && room[field] !== undefined) {
            callback(room[field]);
        }
    });

    return channel;
}

/**
 * Subscribe to players in a room
 * @param {string} code - Room code
 * @param {Function} callback - Called with players object
 * @returns {Object} Subscription channel
 */
function subscribeToPlayers(code, callback) {
    console.log('subscribeToPlayers called for:', code);

    const channelName = `players_${code}_${Math.random().toString(36).substr(2, 9)}`;

    const channel = supabase
        .channel(channelName)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'players',
                filter: `room_code=eq.${code}`
            },
            async (payload) => {
                console.log('Players changed:', payload);
                const players = await getPlayers(code);
                callback(players);
            }
        )
        .subscribe((status, err) => {
            console.log('Players subscription status:', status);
            if (err) console.error('Subscription error:', err);
        });

    // Do initial fetch
    getPlayers(code).then(callback);

    return channel;
}
/** 
 * Unsubscribe from a channel
 * @param {Object} channel - Channel returned from subscribe function
 */
function unsubscribe(channel) {
    if (channel) {
        supabase.removeChannel(channel);
    }
}

// SONGS - Query Operations
// ============================================

/**
 * Get all verified songs
 * @returns {Promise<Array>} Array of songs
 */
async function getVerifiedSongs() {
    try {
        const { data, error } = await supabase
            .from('songs')
            .select('*')
            .eq('verified', true);

        if (error) throw error;

        return data.map(song => convertSongFromDB(song));
    } catch (error) {
        console.error('Error getting songs:', error);
        return [];
    }
}

/**
 * Get song by ID
 * @param {string} id - Song ID
 * @returns {Promise<Object|null>}
 */
async function getSong(id) {
    try {
        const { data, error } = await supabase
            .from('songs')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        return convertSongFromDB(data);
    } catch (error) {
        console.error('Error getting song:', error);
        return null;
    }
}


/**
 * Get all active buzzer sounds
 * @returns {Promise<Array>}
 */
async function getBuzzerSounds() {
    try {
        const { data, error } = await supabase
            .from('buzzer_sounds')
            .select('*')
            .eq('is_active', true)
            .order('display_name');

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting buzzer sounds:', error);
        return [];
    }
}

/**
 * Get a specific buzzer sound
 * @param {string} id - Sound ID
 * @returns {Promise<Object|null>}
 */
async function getBuzzerSound(id) {
    try {
        const { data, error } = await supabase
            .from('buzzer_sounds')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }
        return data;
    } catch (error) {
        console.error('Error getting buzzer sound:', error);
        return null;
    }
}

/**
 * Upload a buzzer sound file
 * @param {File} file - Audio file
 * @param {string} displayName - Display name
 * @param {boolean} isStarter - Whether it's a starter sound
 * @returns {Promise}
 */
async function uploadBuzzerSound(file, displayName, isStarter = false) {
    try {
        // Validate file size (500KB = 512000 bytes)
        if (file.size > 512000) {
            return { success: false, error: 'File size must be under 500KB' };
        }

        // Validate file type
        if (!file.type.includes('audio/mpeg') && !file.type.includes('audio/mp3')) {
            return { success: false, error: 'File must be MP3 format' };
        }

        // Generate unique file name
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('buzzer-sounds')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('buzzer-sounds')
            .getPublicUrl(fileName);

        // Create database entry
        const { data: soundData, error: dbError } = await supabase
            .from('buzzer_sounds')
            .insert([{
                file_name: fileName,
                display_name: displayName,
                file_url: urlData.publicUrl,
                is_starter: isStarter,
                file_size: file.size
            }])
            .select()
            .single();

        if (dbError) throw dbError;

        return { success: true, sound: soundData };
    } catch (error) {
        console.error('Error uploading buzzer sound:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete a buzzer sound
 * @param {string} id - Sound ID
 * @returns {Promise}
 */
async function deleteBuzzerSound(id) {
    try {
        // Get sound data first to delete file
        const sound = await getBuzzerSound(id);
        if (!sound) return { success: false, error: 'Sound not found' };

        // Delete from storage
        const { error: storageError } = await supabase.storage
            .from('buzzer-sounds')
            .remove([sound.file_name]);

        if (storageError) console.warn('Storage delete error:', storageError);

        // Delete from database
        const { error: dbError } = await supabase
            .from('buzzer_sounds')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        return { success: true };
    } catch (error) {
        console.error('Error deleting buzzer sound:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update buzzer sound properties
 * @param {string} id - Sound ID
 * @param {Object} updates - Fields to update
 * @returns {Promise}
 */
async function updateBuzzerSound(id, updates) {
    try {
        const { error } = await supabase
            .from('buzzer_sounds')
            .update(updates)
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error updating buzzer sound:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get next available default buzzer sound for a room
 * @param {string} code - Room code
 * @returns {Promise<string|null>} Sound ID or null
 */
async function getNextAvailableBuzzerSound(code) {
    try {
        // Get all starter sounds
        const { data: starterSounds, error: soundsError } = await supabase
            .from('buzzer_sounds')
            .select('id')
            .eq('is_starter', true)
            .eq('is_active', true)
            .order('display_name');

        if (soundsError) throw soundsError;
        if (!starterSounds || starterSounds.length === 0) return null;

        // Get all players in room and their sound IDs
        const { data: players, error: playersError } = await supabase
            .from('players')
            .select('buzzer_sound_id')
            .eq('room_code', code);

        if (playersError) throw playersError;

        const usedSoundIds = players.map(p => p.buzzer_sound_id).filter(Boolean);

        // Find first unused starter sound
        const availableSound = starterSounds.find(s => !usedSoundIds.includes(s.id));

        return availableSound ? availableSound.id : starterSounds[0].id; // Fallback to first if all used
    } catch (error) {
        console.error('Error getting next available buzzer sound:', error);
        return null;
    }
}



// CONVERSION HELPERS
// ============================================

/**
 * Convert camelCase to snake_case
 */
function camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert snake_case to camelCase
 */
function snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Convert room data FROM database format TO app format
 */
function convertRoomFromDB(dbRoom) {
    return {
        code: dbRoom.code,
        host: dbRoom.host,
        mode: dbRoom.mode,
        status: dbRoom.status,
        currentQ: dbRoom.current_q,
        questions: dbRoom.questions,
        gameParams: dbRoom.game_params,
        buzzedPlayer: dbRoom.buzzed_player,
        buzzTime: dbRoom.buzz_time,
        buzzerLocked: dbRoom.buzzer_locked,
        isPaused: dbRoom.is_paused,
        remainingTime: dbRoom.remaining_time,
        questionStartTime: dbRoom.question_start_time,
        resultsCalculated: dbRoom.results_calculated,
        nextCountdown: dbRoom.next_countdown,
        scoreboardCountdown: dbRoom.scoreboard_countdown,
        created: new Date(dbRoom.created_at).getTime()
    };
}

/**
 * Convert room data FROM app format TO database format
 */
function convertRoomToDB(appRoom) {
    const dbRoom = {};

    const fieldMap = {
        'host': 'host',
        'mode': 'mode',
        'status': 'status',
        'currentQ': 'current_q',
        'questions': 'questions',
        'gameParams': 'game_params',
        'buzzedPlayer': 'buzzed_player',
        'buzzTime': 'buzz_time',
        'buzzerLocked': 'buzzer_locked',
        'isPaused': 'is_paused',
        'remainingTime': 'remaining_time',
        'questionStartTime': 'question_start_time',
        'resultsCalculated': 'results_calculated',
        'nextCountdown': 'next_countdown',
        'scoreboardCountdown': 'scoreboard_countdown'
    };

    for (const [appKey, dbKey] of Object.entries(fieldMap)) {
        if (appRoom[appKey] !== undefined) {
            dbRoom[dbKey] = appRoom[appKey];
        }
    }

    return dbRoom;
}

/**
 * Convert player data FROM database format TO app format
 */
function convertPlayerFromDB(dbPlayer) {
    return {
        playerId: dbPlayer.player_id,
        name: dbPlayer.name,
        score: dbPlayer.score,
        answer: dbPlayer.answer,
        answered: dbPlayer.answered,
        answerTime: dbPlayer.answer_time,
        lastPoints: dbPlayer.last_points,
        correctCount: dbPlayer.correct_count,
        isHost: dbPlayer.is_host,
        lockoutUntil: dbPlayer.lockout_until,
        lastSeen: dbPlayer.last_seen,
        buzzerSoundId: dbPlayer.buzzer_sound_id,
        joined: new Date(dbPlayer.joined_at).getTime()
    };
}

/**
 * Convert player data FROM app format TO database format
 */
function convertPlayerToDB(appPlayer) {
    const dbPlayer = {};

    const fieldMap = {
        'score': 'score',
        'answer': 'answer',
        'answered': 'answered',
        'answerTime': 'answer_time',
        'lastPoints': 'last_points',
        'correctCount': 'correct_count',
        'isHost': 'is_host',
        'lockoutUntil': 'lockout_until',
        'lastSeen': 'last_seen',
        'buzzerSoundId': 'buzzer_sound_id'
    };

    for (const [appKey, dbKey] of Object.entries(fieldMap)) {
        if (appPlayer[appKey] !== undefined) {
            dbPlayer[dbKey] = appPlayer[appKey];
        }
    }

    return dbPlayer;
}

/**
 * Convert song data FROM database format TO app format
 */
function convertSongFromDB(dbSong) {
    return {
        id: dbSong.id,
        title: dbSong.title,
        artist: dbSong.artist,
        specificGame: dbSong.specific_game,
        seriesSource: dbSong.series_source,
        developer: dbSong.developer,
        releaseYear: dbSong.release_year,
        bossBattle: dbSong.boss_battle,
        area: dbSong.area,
        youtubeUrl: dbSong.youtube_url,
        youtubeId: dbSong.youtube_id,
        startTime: dbSong.start_time,
        duration: dbSong.duration,
        difficulty: dbSong.difficulty,
        verified: dbSong.verified
    };
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

/**
 * Sanitize player name (remove invalid characters)
 */
function sanitizeName(name) {
    return name.trim().replace(/[.#$/[\]]/g, '');
}
