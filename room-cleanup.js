// Client-side room cleanup
// Add this script to index.html to run cleanup when users visit homepage

async function cleanupOldRooms() {
    const db = window.db;
    if (!db) return;
    
    const roomsRef = db.ref('rooms');
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    try {
        const snapshot = await roomsRef.once('value');
        const rooms = snapshot.val();
        
        if (!rooms) return;
        
        for (const [roomCode, roomData] of Object.entries(rooms)) {
            let shouldDelete = false;
            
            // Delete if room is older than 24 hours
            if (roomData.created && roomData.created < twentyFourHoursAgo) {
                console.log(`Cleaning up old room: ${roomCode}`);
                shouldDelete = true;
            }
            
            // Delete if room has no players
            if (!roomData.players || Object.keys(roomData.players).length === 0) {
                console.log(`Cleaning up empty room: ${roomCode}`);
                shouldDelete = true;
            }
            
            // Delete finished games older than 1 hour
            const oneHourAgo = now - (60 * 60 * 1000);
            if (roomData.status === 'finished' && roomData.created < oneHourAgo) {
                console.log(`Cleaning up finished room: ${roomCode}`);
                shouldDelete = true;
            }
            
            if (shouldDelete) {
                try {
                    await roomsRef.child(roomCode).remove();
                    console.log(`Deleted room: ${roomCode}`);
                } catch (error) {
                    console.error(`Failed to delete room ${roomCode}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error during room cleanup:', error);
    }
}

// Run cleanup when homepage loads
if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    // Wait for Firebase to initialize
    setTimeout(() => {
        cleanupOldRooms();
    }, 2000);
}
