import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// === Firebase config ===
const firebaseConfig = {
  apiKey: "AIzaSyDcE_rQ_Q6PnsA9uSlkOytVz70-t_ZzQNA",
  authDomain: "nextgen-tutoring.firebaseapp.com",
  projectId: "nextgen-tutoring",
  storageBucket: "nextgen-tutoring.appspot.com",
  messagingSenderId: "1064020614361",
  appId: "1:1064020614361:web:4a88beaf6765b23c59f2c8",
  measurementId: "G-GHM4FMXJQK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
export { auth, db };

document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const nameInput = document.getElementById("name");
  const rememberMe = document.getElementById("rememberMe");
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const forgotPassword = document.getElementById("forgotPassword");
  const toast = document.getElementById("toast");

  function showToast(message, type = "success") {
    toast.textContent = message;
    toast.className = `fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-md shadow-md z-50 ${
      type === "error" ? "bg-red-600" : "bg-cyan-600"
    } text-white`;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 3000);
  }

  // === Login ===
  loginBtn?.addEventListener("click", () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const persistence = rememberMe?.checked ? browserLocalPersistence : browserSessionPersistence;

    if (!email || !password) return showToast("Please fill in all fields", "error");

    setPersistence(auth, persistence)
      .then(() => signInWithEmailAndPassword(auth, email, password))
      .then(() => {
        showToast("Login successful!");
        setTimeout(() => (window.location.href = "dashboard.html"), 1200);
      })
      .catch(err => showToast(err.message, "error"));
  });

  // === Signup ===
  signupBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const fullName = nameInput?.value?.trim();

    if (!email || !password || !fullName) return showToast("Fill out all fields", "error");

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await setDoc(doc(db, "users", user.uid), {
        name: fullName,
        email,
        createdAt: new Date()
      });
      showToast("Account created!");
      setTimeout(() => (window.location.href = "dashboard.html"), 1500);
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // === Forgot Password ===
  forgotPassword?.addEventListener("click", () => {
    const email = emailInput.value.trim();
    if (!email) return showToast("Enter your email first", "error");

    sendPasswordResetEmail(auth, email)
      .then(() => showToast("Reset link sent to email"))
      .catch(error => showToast(error.message, "error"));
  });
});
