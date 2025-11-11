

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Export for use in other scripts

window.db = database;
