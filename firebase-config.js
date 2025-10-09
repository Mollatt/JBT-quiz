// Firebase Configuration
// REPLACE THESE VALUES with your own Firebase project credentials
// Get these from: Firebase Console > Project Settings > General > Your apps > SDK setup and configuration

const firebaseConfig = {

    apiKey: "AIzaSyA1OPPptM5gqhiwhEhJ2JE1vnEOJEdpyeU",

    authDomain: "jbt-quiz.firebaseapp.com",

    databaseURL: "https://jbt-quiz-default-rtdb.europe-west1.firebasedatabase.app",

    projectId: "jbt-quiz",

    storageBucket: "jbt-quiz.firebasestorage.app",

    messagingSenderId: "509323900465",

    appId: "1:509323900465:web:7f295cb9389e18ffbe4710"

};


// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Export for use in other scripts
window.db = database;