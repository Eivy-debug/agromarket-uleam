// ──────────────────────────────────────────────────────
// firebase-config.js
// Configura Firebase. Los datos los encuentras en:
// Firebase Console → Tu proyecto → ⚙️ Configuración → SDK de Firebase
// ──────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            "TU_API_KEY",
  authDomain:        "TU_PROYECTO.firebaseapp.com",
  projectId:         "TU_PROYECTO",
  storageBucket:     "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId:             "TU_APP_ID"
};

// Inicializar Firebase (una sola vez)
firebase.initializeApp(firebaseConfig);

// Clientes globales disponibles para todos los JS
const auth      = firebase.auth();
const db        = firebase.firestore();
const storage   = firebase.storage();

const DOMINIO_ULEAM = "@uleam.edu.ec";
