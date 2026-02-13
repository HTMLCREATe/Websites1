const topRightUser = document.getElementById('topRightUser');
const usersEl = document.getElementById('users');
const adminPanel = document.getElementById('adminPanel');
const popup = document.getElementById('popup');
const popupTitle = document.getElementById('popupTitle');
const popupMessage = document.getElementById('popupMessage');

let adminCode = '';

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function showPopup(title, message) {
  popupTitle.textContent = title;
  popupMessage.textContent = message;
  popup.classList.remove('hidden');
}

document.getElementById('popupClose').addEventListener('click', () => {
  popup.classList.add('hidden');
});

async function loadUsers() {
  const data = await api('/api/users');
  usersEl.innerHTML = '';

  data.users.forEach((u) => {
    const row = document.createElement('div');
    row.className = 'user-row';

    const name = document.createElement('span');
    name.textContent = u.name; // [] entfernt beim Namen

    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = `[${u.status}]`; // [] nur beim Status

    row.append(name, status);
    usersEl.appendChild(row);
  });
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const name = document.getElementById('nameInput').value;
  const code = document.getElementById('codeInput').value;

  const data = await api('/api/login', 'POST', { name, code });

  if (!data.ok) {
    showPopup(data.title || 'Fehler', data.message || 'Unbekannter Fehler');
    return;
  }

  topRightUser.textContent = data.displayName;

  if (data.role === 'admin' || data.role === 'owner') {
    adminCode = code;
    adminPanel.hidden = false;
    await loadUsers();
    return;
  }

  adminPanel.hidden = true;
  showPopup('Eingeloggt', `Willkommen ${data.displayName}! Status: [${data.status}]`);
});

document.getElementById('banBtn').addEventListener('click', async () => {
  const targetName = document.getElementById('banTarget').value;
  const days = document.getElementById('banDays').value;
  const reason = document.getElementById('banReason').value;

  const data = await api('/api/admin/ban', 'POST', { adminCode, targetName, days, reason });
  showPopup(data.ok ? 'Erfolg' : 'Fehler', data.message);
  if (data.ok) {
    await loadUsers();
  }
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  const targetName = document.getElementById('deleteTarget').value;
  const reason = document.getElementById('deleteReason').value;

  const data = await api('/api/admin/delete', 'POST', { adminCode, targetName, reason });
  showPopup(data.ok ? 'Erfolg' : 'Fehler', data.message);
  if (data.ok) {
    await loadUsers();
  }
});

loadUsers();
