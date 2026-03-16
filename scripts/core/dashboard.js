import { auth, db } from "./auth.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

document.addEventListener("DOMContentLoaded", () => {
  const userNameElement = document.getElementById("userName");

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const name = userDoc.exists() ? userDoc.data().name : user.email.split("@")[0];
        userNameElement.textContent = name.split(" ")[0]; // First name only
      } catch {
        userNameElement.textContent = "Student";
      }
    } else {
      window.location.href = "login.html";
    }
  });
});
