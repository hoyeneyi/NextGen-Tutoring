import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const authLinks = document.getElementById("auth-links");
const userLinks = document.getElementById("user-links");

onAuthStateChanged(auth, (user) => {
  if (user) {
    authLinks.classList.add("hidden");
    userLinks.classList.remove("hidden");
  } else {
    authLinks.classList.remove("hidden");
    userLinks.classList.add("hidden");
  }
});

window.logout = () => {
  signOut(auth).then(() => {
    location.href = "index.html";
  });
};
