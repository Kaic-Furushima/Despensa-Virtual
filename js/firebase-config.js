// Importa as funções necessárias dos SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Configuração do projeto Firebase "despensa-virtual"
const firebaseConfig = {
  apiKey: "AIzaSyDWNVxAg3CsaYUYb2CLBPTjP7ffArzmzwc",
  authDomain: "despensa-virtual-68ba9.firebaseapp.com",
  projectId: "despensa-virtual-68ba9",
  storageBucket: "despensa-virtual-68ba9.firebasestorage.app",
  messagingSenderId: "744670481371",
  appId: "1:744670481371:web:9d740eb13d07a8a3f3b5fe",
  measurementId: "G-3L7221ZDL5"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };

