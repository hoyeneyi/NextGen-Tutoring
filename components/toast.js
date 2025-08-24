// toast.js — Handles toast notifications for status feedback

/**
 * Displays a toast notification at the bottom center of the screen.
 * @param {string} message - The text to display in the toast.
 * @param {'success' | 'error'} [type='success'] - Type of notification.
 */
export function showToast(message, type = "success") {
  const toast = document.getElementById("toast");

  if (!toast) {
    console.warn("Toast element not found in the DOM.");
    return;
  }

  // Set message and style
  toast.textContent = message;
  toast.className = [
    "fixed", "bottom-6", "left-1/2", "transform", "-translate-x-1/2",
    "px-6", "py-3", "rounded-md", "shadow-md", "z-50", "text-white",
    type === "error" ? "bg-red-600" : "bg-cyan-600"
  ].join(" ");
  
  toast.classList.remove("hidden");

  // Auto-hide after 3 seconds
  clearTimeout(toast.dataset.timeoutId); // Clear any existing timeout
  const timeoutId = setTimeout(() => toast.classList.add("hidden"), 3000);
  toast.dataset.timeoutId = timeoutId;
}
