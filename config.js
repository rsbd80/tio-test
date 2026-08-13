import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBW7EtBSaGq4BO4QuSy2unTJrMobQ3lIfU",
    authDomain: "rs-tv-admin.firebaseapp.com",
    projectId: "rs-tv-admin",
    storageBucket: "rs-tv-admin.firebasestorage.app",
    messagingSenderId: "619060422153"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const YOUTUBE_API_KEY = "AIzaSyBFxF8kRg7VdxYKsQdFO-WQkdxS9vF-B6M";
