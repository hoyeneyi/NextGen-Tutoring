import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from '../core/auth.js';

document.addEventListener("DOMContentLoaded", () => {
  fetch("header.html")
    .then((res) => res.text())
    .then((data) => {
      document.querySelector("header").innerHTML = data;

      const authLinks = document.getElementById("authNavLinks");

      onAuthStateChanged(auth, (user) => {
        if (user) {
          authLinks.innerHTML = `
            <a href="dashboard.html" class="text-cyan-600 hover:underline">Dashboard</a>
            <button id="logoutBtn" class="text-cyan-600 hover:underline">Logout</button>
          `;
          document.getElementById("logoutBtn").addEventListener("click", () => {
            signOut(auth).then(() => window.location.href = "index.html");
          });
        } else {
          authLinks.innerHTML = `
            <a href="login.html" class="text-cyan-600 hover:underline">Login</a>
            <a href="signup.html" class="text-cyan-600 hover:underline">Sign Up</a>
          `;
        }
      });
    });
});
