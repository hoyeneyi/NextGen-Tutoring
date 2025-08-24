<script type="module" src="auth_nav.js"></script>
document.querySelectorAll('[data-include]').forEach(el => {
  const file = el.getAttribute('data-include');
  fetch(file)
    .then(response => {
      if (!response.ok) throw new Error(`Failed to load ${file}`);
      return response.text();
    })
    .then(data => el.innerHTML = data)
    .catch(error => {
      console.error('Include error:', error);
      el.innerHTML = `<p style="color:red;">Error loading content.</p>`;
    });
});
