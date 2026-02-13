const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_ACCOUNTS = {
  '2934': 'Amil',
  '5661': 'Gabriel'
};

const dataDir = __dirname;
const usersJsonPath = path.join(dataDir, 'users.json');
const usersTxtPath = path.join(dataDir, 'users.txt');
const publicDir = path.join(__dirname, 'public');

function ensureDataFiles() {
  if (!fs.existsSync(usersJsonPath)) {
    const initial = [
      {
        name: 'Adrian',
        status: 'Normal',
        deleted: false,
        deletedReason: '',
        ban: { until: 0, reason: '' }
      },
      {
        name: 'Gabriel',
        status: 'Normal',
        deleted: false,
        deletedReason: '',
        ban: { until: 0, reason: '' }
      },
      {
        name: 'Amil',
        status: 'Normal',
        deleted: false,
        deletedReason: '',
        ban: { until: 0, reason: '' }
      },
      {
        name: 'Alexander',
        status: 'Normal',
        deleted: false,
        deletedReason: '',
        ban: { until: 0, reason: '' }
      },
      {
        name: 'Filip',
        status: 'Normal',
        deleted: false,
        deletedReason: '',
        ban: { until: 0, reason: '' }
      }
    ];
    fs.writeFileSync(usersJsonPath, JSON.stringify(initial, null, 2), 'utf8');
  }

  if (!fs.existsSync(usersTxtPath)) {
    syncTxtFromJson();
  }
}

function readUsers() {
  const raw = fs.readFileSync(usersJsonPath, 'utf8');
  return JSON.parse(raw);
}

function writeUsers(users) {
  fs.writeFileSync(usersJsonPath, JSON.stringify(users, null, 2), 'utf8');
  syncTxtFromUsers(users);
}

function syncTxtFromJson() {
  const users = readUsers();
  syncTxtFromUsers(users);
}

function syncTxtFromUsers(users) {
  const lines = users
    .filter((u) => !u.deleted)
    .map((u) => `[${u.name}] [${u.status}]`)
    .join('\n');
  fs.writeFileSync(usersTxtPath, `${lines}\n`, 'utf8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.normalize(filePath).replace(/^\.+/, '');
  const fullPath = path.join(publicDir, filePath);

  if (!fullPath.startsWith(publicDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(fullPath);
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8'
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function getUserByName(users, name) {
  return users.find((u) => u.name.toLowerCase() === name.toLowerCase());
}

function isActiveBan(user) {
  return user.ban && user.ban.until && user.ban.until > Date.now();
}

function daysRemaining(until) {
  const ms = until - Date.now();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/users' && req.method === 'GET') {
    const users = readUsers()
      .filter((u) => !u.deleted)
      .map((u) => ({
        name: u.name,
        status: u.status,
        banned: isActiveBan(u),
        banDaysLeft: isActiveBan(u) ? daysRemaining(u.ban.until) : 0,
        banReason: isActiveBan(u) ? u.ban.reason : ''
      }));

    sendJson(res, 200, { users });
    return;
  }

  if (req.url === '/api/login' && req.method === 'POST') {
    try {
      const { name = '', code = '' } = await parseBody(req);

      if (ADMIN_ACCOUNTS[code]) {
        const displayName = ADMIN_ACCOUNTS[code];
        const role = displayName === 'Gabriel' ? 'owner' : 'admin';
        sendJson(res, 200, { ok: true, role, displayName });
        return;
      }

      if (!name.trim()) {
        sendJson(res, 400, { ok: false, title: 'Fehler', message: 'Bitte Namen eingeben.' });
        return;
      }

      const users = readUsers();
      const user = getUserByName(users, name.trim());

      if (!user) {
        sendJson(res, 404, { ok: false, title: 'Nicht gefunden', message: 'Account existiert nicht.' });
        return;
      }

      if (user.deleted) {
        sendJson(res, 403, {
          ok: false,
          deleted: true,
          title: 'Account Gelöscht',
          message: `Dein Account wurde gelöscht. Grund: ${user.deletedReason || 'Kein Grund angegeben.'}`
        });
        return;
      }

      if (isActiveBan(user)) {
        sendJson(res, 403, {
          ok: false,
          banned: true,
          title: 'Account Gebannt',
          message: `Dein Account wurde gebannt. Grund: ${user.ban.reason}. Noch ${daysRemaining(user.ban.until)} Tag(e).`
        });
        return;
      }

      sendJson(res, 200, { ok: true, role: 'user', displayName: user.name, status: user.status });
    } catch (err) {
      sendJson(res, 400, { ok: false, title: 'Fehler', message: err.message });
    }
    return;
  }

  if (req.url === '/api/admin/ban' && req.method === 'POST') {
    try {
      const { adminCode = '', targetName = '', days = 1, reason = '' } = await parseBody(req);

      if (!ADMIN_ACCOUNTS[adminCode]) {
        sendJson(res, 401, { ok: false, message: 'Ungültiger Admin/Owner-Code.' });
        return;
      }

      const parsedDays = Number(days);
      if (!targetName.trim() || !reason.trim() || !Number.isFinite(parsedDays) || parsedDays < 1) {
        sendJson(res, 400, { ok: false, message: 'Name, Tage (>=1) und Grund sind Pflicht.' });
        return;
      }

      const users = readUsers();
      const user = getUserByName(users, targetName.trim());

      if (!user || user.deleted) {
        sendJson(res, 404, { ok: false, message: 'Nutzer nicht gefunden.' });
        return;
      }

      user.ban = {
        until: Date.now() + parsedDays * 24 * 60 * 60 * 1000,
        reason: reason.trim()
      };

      writeUsers(users);
      sendJson(res, 200, { ok: true, message: `${user.name} wurde für ${parsedDays} Tag(e) gebannt.` });
    } catch (err) {
      sendJson(res, 400, { ok: false, message: err.message });
    }
    return;
  }

  if (req.url === '/api/admin/delete' && req.method === 'POST') {
    try {
      const { adminCode = '', targetName = '', reason = '' } = await parseBody(req);

      if (!ADMIN_ACCOUNTS[adminCode]) {
        sendJson(res, 401, { ok: false, message: 'Ungültiger Admin/Owner-Code.' });
        return;
      }

      if (!targetName.trim() || !reason.trim()) {
        sendJson(res, 400, { ok: false, message: 'Name und Grund sind Pflicht.' });
        return;
      }

      const users = readUsers();
      const user = getUserByName(users, targetName.trim());

      if (!user || user.deleted) {
        sendJson(res, 404, { ok: false, message: 'Nutzer nicht gefunden.' });
        return;
      }

      user.deleted = true;
      user.deletedReason = reason.trim();
      user.ban = { until: 0, reason: '' };
      writeUsers(users);

      sendJson(res, 200, { ok: true, message: `${user.name} wurde gelöscht.` });
    } catch (err) {
      sendJson(res, 400, { ok: false, message: err.message });
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`OrangeSchwarz läuft auf http://localhost:${PORT}`);
});
