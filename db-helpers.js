const roomCache = new Map();
const CACHE_TTL = 500; //500ms


/**
 * @returns {string} 
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
 * @param {string} code - Room code
 * @returns {Promise<Object|null>} Room data or null
 */
async function getRoom(code) {
    const cached = roomCache.get(code);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    try {
        const [roomResult, playersResult] = await Promise.all([
            supabase.from('rooms').select('*').eq('code', code).single(),
            supabase.from('players').select('*').eq('room_code', code)
        ]);

        if (roomResult.error) {
            if (roomResult.error.code === 'PGRST116') return null;
            throw roomResult.error;
        }

        if (playersResult.error) throw playersResult.error;

        const room = convertRoomFromDB(roomResult.data);
        room.players = {};

        playersResult.data.forEach(player => {
            room.players[player.name] = convertPlayerFromDB(player);
        });

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
 * @param {string} code
 * @param {string} hostName 
 * @param {string} mode 
 * @returns {Promise}
 */
async function createRoom(code, hostName, mode = 'everybody', selectedSoundId = null) {
    try {
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

        const hostPlayerId = generatePlayerId();
        const { data: playerData, error: playerError } = await supabase
            .from('players')
            .insert([{
                room_code: code,
                player_id: hostPlayerId,
                name: hostName,
                score: 0,
                is_host: true,
                last_seen: Date.now(),
                buzzer_sound_id: selectedSoundId || null
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
 * @param {string} code 
 * @param {Object} updates 
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
 * @param {string} code 
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

/**

 * @param {string} code 
 * @param {string} playerName 
 * @param {boolean} isHost 
 * @returns {Promise}
 */
async function addPlayer(code, playerName, isHost = false, selectedSoundId = null) {
    try {
        const playerId = generatePlayerId();

        let buzzerSoundId = selectedSoundId;

        if (!buzzerSoundId && !isHost) {
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
 * @param {string} code 
 * @param {string} playerName 
 * @param {Object} updates 
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
 * @param {string} code 
 * @param {string} playerName 
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
 * @param {string} code 
 * @param {string} playerId 
 * @param {string} newName 
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
 * @param {string} code 
 * @returns {Promise<Object>} 
 */
async function getPlayers(code) {
    try {
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('room_code', code); 

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

/**
 * @param {string} code 
 * @param {Function} callback 
 */
function subscribeToRoom(code, callback) {
    console.log('subscribeToRoom called for:', code);

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

    getRoom(code).then(callback);

    return channel;
}

/**
 * @param {string} code 
 * @param {string} field 
 * @param {Function} callback 
 * @returns {Object} 
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

    getRoom(code).then(room => {
        if (room && room[field] !== undefined) {
            callback(room[field]);
        }
    });

    return channel;
}

/**
 * @param {string} code 
 * @param {Function} callback 
 * @returns {Object} 
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

    getPlayers(code).then(callback);

    return channel;
}
/** 
 * @param {Object} channel 
 */
function unsubscribe(channel) {
    if (channel) {
        supabase.removeChannel(channel);
    }
}

/**
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
 * @param {string} id 
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
 * @param {File} file 
 * @param {string} displayName 
 * @param {boolean} isStarter 
 * @returns {Promise}
 */
async function uploadBuzzerSound(file, displayName, isStarter = false) {
    try {
        //(500KB = 512000 bytes)
        if (file.size > 512000) {
            return { success: false, error: 'File size must be under 500KB' };
        }

        if (!file.type.includes('audio/mpeg') && !file.type.includes('audio/mp3')) {
            return { success: false, error: 'File must be MP3 format' };
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('buzzer-sounds')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('buzzer-sounds')
            .getPublicUrl(fileName);

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
 * @param {string} id 
 * @returns {Promise}
 */
async function deleteBuzzerSound(id) {
    try {
        const sound = await getBuzzerSound(id);
        if (!sound) return { success: false, error: 'Sound not found' };

        const { error: storageError } = await supabase.storage
            .from('buzzer-sounds')
            .remove([sound.file_name]);

        if (storageError) console.warn('Storage delete error:', storageError);

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
 * @param {string} id 
 * @param {Object} updates 
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
 * @param {string} code
 * @returns {Promise<string|null>} 
 */
async function getNextAvailableBuzzerSound(code) {
    try {
        const { data: starterSounds, error: soundsError } = await supabase
            .from('buzzer_sounds')
            .select('id')
            .eq('is_starter', true)
            .eq('is_active', true)
            .order('display_name');

        if (soundsError) throw soundsError;
        if (!starterSounds || starterSounds.length === 0) return null;

        const { data: players, error: playersError } = await supabase
            .from('players')
            .select('buzzer_sound_id')
            .eq('room_code', code);

        if (playersError) throw playersError;

        const usedSoundIds = players.map(p => p.buzzer_sound_id).filter(Boolean);

        const availableSound = starterSounds.find(s => !usedSoundIds.includes(s.id));

        return availableSound ? availableSound.id : starterSounds[0].id; // Fallback to first if all used
    } catch (error) {
        console.error('Error getting next available buzzer sound:', error);
        return null;
    }
}

function camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

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
        previousWinner: dbPlayer.previous_winner || false,
        joined: new Date(dbPlayer.joined_at).getTime()
    };
}

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
        'buzzerSoundId': 'buzzer_sound_id',
        'previousWinner': 'previous_winner'
    };

    for (const [appKey, dbKey] of Object.entries(fieldMap)) {
        if (appPlayer[appKey] !== undefined) {
            dbPlayer[dbKey] = appPlayer[appKey];
        }
    }

    return dbPlayer;
}

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
        verified: dbSong.verified,
        alternateTitles: dbSong.alternate_titles || [],
        alternateArtists: dbSong.alternate_artists || [],
        alternateGames: dbSong.alternate_games || [],
        alternateDevelopers: dbSong.alternate_developers || [],
        alternateBossBattles: dbSong.alternate_boss_battles || [],
        alternateAreas: dbSong.alternate_areas || []
    };
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function sanitizeName(name) {
    return name.trim().replace(/[.#$/[\]]/g, '');
}
