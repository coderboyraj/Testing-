const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const wiegine = require('ws3-fca');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({limit: '2mb'}));
app.use(express.static(path.join(__dirname, 'public')));

const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
let sessions = {};

// Load saved sessions from disk
if (fs.existsSync(SESSIONS_FILE)) {
  try {
    sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    console.log('[INIT] Restored', Object.keys(sessions).length, 'sessions from disk');
  } catch (e) {
    console.error('[INIT] Could not parse sessions.json, starting fresh');
    sessions = {};
  }
}

// Persist sessions to disk
function persist() {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

// Start a new session
function createSession({ cookie, postId, comment, delay }) {
  const sessionId = uuidv4();
  sessions[sessionId] = {
    sessionId,
    cookie,
    postId,
    comment,
    delay,
    active: false,
    lastActivity: null
  };
  persist();
  bootSession(sessionId);
  return sessionId;
}

// Boot or reboot a session
function bootSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) return;
  console.log('[' + sessionId + '] Logging in...');
  wiegine.login(session.cookie, {}, (err, api) => {
    if (err) {
      console.error('[' + sessionId + '] Login failed:', err.message);
      session.active = false;
      // Retry after 60 s
      setTimeout(() => bootSession(sessionId), 60 * 1000);
      return;
    }
    console.log('[' + sessionId + '] Login success');
    session.api = api;
    session.active = true;
    session.lastActivity = Date.now();
    persist();

    // Comment loop
    session.interval = setInterval(() => {
      api.sendMessage(session.comment, session.postId, (err2) => {
        if (err2) {
          console.error('[' + sessionId + '] Comment failed:', err2.message);
          clearInterval(session.interval);
          session.active = false;
          persist();
          // Attempt reboot in 30 s
          setTimeout(() => bootSession(sessionId), 30 * 1000);
        } else {
          session.lastActivity = Date.now();
          persist();
          console.log('[' + sessionId + '] Comment posted.');
        }
      });
    }, session.delay * 1000);
  });
}

// Stop a session
function stopSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) return false;
  if (session.interval) clearInterval(session.interval);
  if (session.api && session.api.logout) {
    try { session.api.logout(); } catch (_) {}
  }
  session.active = false;
  persist();
  console.log('[' + sessionId + '] Stopped');
  return true;
}

// Express endpoints
app.post('/start', (req, res) => {
  const { cookie, postId, comment, delay } = req.body;
  if (!cookie || !postId || !comment || !delay) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const sessionId = createSession({ cookie, postId, comment, delay });
  res.json({ sessionId });
});

app.post('/stop', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const stopped = stopSession(sessionId);
  res.json({ stopped });
});

app.get('/sessions', (req, res) => {
  res.json(Object.values(sessions));
});

app.get('/health', (_, res) => res.send('OK'));

// Cron job: every minute check sessions
cron.schedule('*/1 * * * *', () => {
  Object.values(sessions).forEach(s => {
    if (!s.active) {
      console.log('[' + s.sessionId + '] Detected inactive ‑ rebooting');
      bootSession(s.sessionId);
    }
  });
});

app.listen(PORT, () => console.log('Server listening on port', PORT));