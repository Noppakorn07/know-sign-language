const firebaseConfig = {
  apiKey: "AIzaSyCCfTktZ5P0rkaiaFeqNkfPovqxeAX3op4",
  authDomain: "know-sign-language.firebaseapp.com",
  projectId: "know-sign-language",
  storageBucket: "know-sign-language.firebasestorage.app",
  messagingSenderId: "119225196339",
  appId: "1:119225196339:web:3c5a115f05b73e1b74e846",
  measurementId: "G-RDFKYTEV3W"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();