import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_DIR = process.cwd();

// Detect serverless hosting environments (Vercel, AWS Lambda, Netlify, Cloud Functions)
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.NETLIFY ||
  process.env.FUNCTION_TARGET
);

// Determine writable directory for serverless environments (read-only root safety)
function getStorageDir() {
  if (isServerless) {
    const tmpStorage = path.join(os.tmpdir(), 'jkuat_wayfinder');
    try {
      if (!fs.existsSync(tmpStorage)) {
        fs.mkdirSync(tmpStorage, { recursive: true });
      }
      return tmpStorage;
    } catch {
      return os.tmpdir();
    }
  }

  // Check if current directory is writable
  try {
    const testFile = path.join(BASE_DIR, '.writable_probe');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return BASE_DIR;
  } catch {
    const tmpStorage = path.join(os.tmpdir(), 'jkuat_wayfinder');
    try {
      if (!fs.existsSync(tmpStorage)) {
        fs.mkdirSync(tmpStorage, { recursive: true });
      }
      return tmpStorage;
    } catch {
      return os.tmpdir();
    }
  }
}

const STORAGE_DIR = getStorageDir();
const DATABASE_FILE = path.join(STORAGE_DIR, 'database.json');
const VOICE_DIR = path.join(STORAGE_DIR, 'voice_notes');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// Safe initialization of voice notes directory
try {
  if (!fs.existsSync(VOICE_DIR)) {
    fs.mkdirSync(VOICE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('Storage directory initialization note:', err.message);
}

// In-memory sessions token -> userId
const SESSIONS = new Map();

function defaultDatabase() {
  return {
    expenses: [],
    experiences: [],
    stranded: [],
    voice_notes: [],
    users: [],
    messages: []
  };
}

let inMemoryDb = null;
let databaseLoadPromise = null;
let pendingDatabaseWrite = Promise.resolve();

function readDatabase() {
  if (inMemoryDb) {
    return inMemoryDb;
  }
  try {
    let content = '';
    if (fs.existsSync(DATABASE_FILE)) {
      content = fs.readFileSync(DATABASE_FILE, 'utf-8').trim();
    } else {
      // Check bundled seed file if database hasn't been copied to writable storage yet
      const seedFile = path.join(BASE_DIR, 'database.json');
      if (fs.existsSync(seedFile)) {
        content = fs.readFileSync(seedFile, 'utf-8').trim();
      }
    }

    if (!content) {
      inMemoryDb = defaultDatabase();
      return inMemoryDb;
    }

    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      inMemoryDb = { ...defaultDatabase(), expenses: parsed };
      return inMemoryDb;
    }

    inMemoryDb = {
      expenses: parsed.expenses || [],
      experiences: parsed.experiences || [],
      stranded: parsed.stranded || [],
      voice_notes: parsed.voice_notes || [],
      users: parsed.users || [],
      messages: parsed.messages || []
    };
    return inMemoryDb;
  } catch (error) {
    console.error('Error reading database:', error);
    inMemoryDb = defaultDatabase();
    return inMemoryDb;
  }
}

function writeDatabase(data) {
  inMemoryDb = data;
  try {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Filesystem write deferred (using memory cache):', error.message);
  }
  if (supabase) {
    pendingDatabaseWrite = pendingDatabaseWrite
      .catch(() => {})
      .then(async () => {
        const { error } = await supabase.from('app_state').upsert({
          id: 'jkuat-wayfinder',
          data,
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
      })
      .catch((error) => console.error('Supabase write failed:', error.message));
  }
}

async function ensureDatabase() {
  if (inMemoryDb || databaseLoadPromise) return databaseLoadPromise;
  databaseLoadPromise = (async () => {
    if (!supabase) {
      readDatabase();
      return;
    }

    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', 'jkuat-wayfinder')
      .maybeSingle();
    if (error) throw error;

    if (data?.data) {
      inMemoryDb = { ...defaultDatabase(), ...data.data };
      return;
    }

    readDatabase();
    const { error: seedError } = await supabase.from('app_state').upsert({
      id: 'jkuat-wayfinder',
      data: inMemoryDb,
      updated_at: new Date().toISOString()
    });
    if (seedError) throw seedError;
  })().catch((error) => {
    console.error('Supabase initialization failed; using local storage:', error.message);
    readDatabase();
  });
  return databaseLoadPromise;
}

function passwordHash(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const digest = crypto.pbkdf2Sync(password, s, 120000, 32, 'sha256').toString('hex');
  return { salt: s, digest };
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    identifier: user.identifier,
    last_login: user.last_login
  };
}

function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const userId = SESSIONS.get(token);
  if (!userId) return null;
  const db = readDatabase();
  return db.users.find((user) => user.id === userId) || null;
}

// CORS headers for serverless/cross-origin deployments
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Support large payloads for audio base64 uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(async (req, res, next) => {
  try {
    await ensureDatabase();
    await pendingDatabaseWrite;
    next();
  } catch (error) {
    next(error);
  }
});

// Health check endpoint for serverless readiness probes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverless: isServerless, aiConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

app.get('/api/supabase-config', (req, res) => {
  res.json({ url: SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY || '' });
});

// Static directory for uploaded voice notes
try {
  app.use('/voice_notes', express.static(VOICE_DIR));
  if (VOICE_DIR !== path.join(BASE_DIR, 'voice_notes')) {
    app.use('/voice_notes', express.static(path.join(BASE_DIR, 'voice_notes')));
  }
} catch (e) {
  console.warn('Voice notes static serve warning:', e.message);
}

// ==================== EXPENSE & CAMPUS API ====================

app.get('/api/expenses', (req, res) => {
  const db = readDatabase();
  res.json(db.expenses);
});

app.post('/api/expenses', (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || 'Other').trim();
    const amount = Number(req.body.amount || 0);
    const date = String(req.body.date || '').trim();

    if (!name || amount <= 0 || !date) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const saved = {
      id: crypto.randomUUID(),
      name,
      category,
      amount,
      date
    };

    const db = readDatabase();
    db.expenses.push(saved);
    writeDatabase(db);
    res.status(201).json(saved);
  } catch {
    res.status(400).json({ error: 'Invalid data' });
  }
});

app.delete('/api/expenses', (req, res) => {
  const db = readDatabase();
  db.expenses = [];
  writeDatabase(db);
  res.json({ success: true });
});

app.delete('/api/expenses/:id', (req, res) => {
  const expenseId = req.params.id;
  const db = readDatabase();
  db.expenses = db.expenses.filter((item) => item.id !== expenseId);
  writeDatabase(db);
  res.json({ success: true });
});

app.get('/api/experiences', (req, res) => {
  const db = readDatabase();
  res.json(db.experiences.slice(-50));
});

app.post('/api/experiences', (req, res) => {
  try {
    const rating = parseInt(req.body.rating, 10);
    const text = String(req.body.text || '').trim();
    const date = String(req.body.date || '');
    const destination = String(req.body.destination || 'Campus');

    if (!rating || rating < 1 || rating > 5 || !text) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const saved = {
      id: crypto.randomUUID(),
      rating,
      text,
      date,
      destination
    };

    const db = readDatabase();
    db.experiences.push(saved);
    writeDatabase(db);
    res.status(201).json(saved);
  } catch {
    res.status(400).json({ error: 'Invalid data' });
  }
});

app.get('/api/stranded', (req, res) => {
  const db = readDatabase();
  res.json(db.stranded.slice(-50));
});

app.post('/api/stranded', (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    const location = String(req.body.location || 'Unknown location').trim();
    const date = String(req.body.date || '');

    if (!message) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const saved = {
      id: crypto.randomUUID(),
      message,
      location,
      date,
      status: 'open'
    };

    const db = readDatabase();
    db.stranded.push(saved);
    writeDatabase(db);
    res.status(201).json(saved);
  } catch {
    res.status(400).json({ error: 'Invalid data' });
  }
});

app.get('/api/voice-notes', (req, res) => {
  const db = readDatabase();
  res.json(db.voice_notes.slice(-50));
});

app.post('/api/voice-notes', (req, res) => {
  try {
    const voiceData = String(req.body.data || '');
    if (!voiceData.startsWith('data:audio/')) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const [mimePart, encoded] = voiceData.split(',', 2);
    const extension = mimePart.includes('webm') ? 'webm' : (mimePart.includes('ogg') ? 'ogg' : 'wav');
    const filename = `${crypto.randomUUID()}.${extension}`;
    try {
      if (!fs.existsSync(VOICE_DIR)) {
        fs.mkdirSync(VOICE_DIR, { recursive: true });
      }
      fs.writeFileSync(path.join(VOICE_DIR, filename), Buffer.from(encoded, 'base64'));
    } catch (fsErr) {
      console.warn('Voice note audio file persistence note:', fsErr.message);
    }

    const saved = {
      id: crypto.randomUUID(),
      url: `/voice_notes/${filename}`,
      date: String(req.body.date || '')
    };

    const db = readDatabase();
    db.voice_notes.push(saved);
    writeDatabase(db);
    res.status(201).json(saved);
  } catch {
    res.status(400).json({ error: 'Invalid data' });
  }
});

// ==================== CHAT API ====================

app.post('/api/chat/register', (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const identifier = String(req.body.identifier || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (name.length < 2 || identifier.length < 3 || password.length < 8) {
      return res.status(400).json({ error: 'Use a name, phone/email, and password of at least 8 characters' });
    }

    const db = readDatabase();
    if (db.users.some((item) => item.identifier === identifier)) {
      return res.status(400).json({ error: 'That phone number or email is already registered' });
    }

    const { salt, digest } = passwordHash(password);
    const user = {
      id: crypto.randomUUID(),
      name,
      identifier,
      salt,
      password_hash: digest,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    };

    db.users.push(user);
    writeDatabase(db);

    const token = crypto.randomBytes(24).toString('base64url');
    SESSIONS.set(token, user.id);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.post('/api/chat/login', (req, res) => {
  try {
    const identifier = String(req.body.identifier || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const db = readDatabase();
    const user = db.users.find((item) => item.identifier === identifier);
    if (!user) {
      return res.status(400).json({ error: 'Invalid login details' });
    }

    const { digest } = passwordHash(password, user.salt);
    if (!safeCompare(digest, user.password_hash)) {
      return res.status(400).json({ error: 'Invalid login details' });
    }

    user.last_login = new Date().toISOString();
    writeDatabase(db);

    const token = crypto.randomBytes(24).toString('base64url');
    SESSIONS.set(token, user.id);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.post('/api/chat/supabase-login', async (req, res) => {
  try {
    const accessToken = String(req.body?.access_token || '');
    if (!supabase || !accessToken) {
      return res.status(400).json({ error: 'Supabase authentication is not configured' });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    const authUser = authData?.user;
    if (authError || !authUser?.email) {
      return res.status(401).json({ error: 'Invalid Supabase authentication details' });
    }

    const uid = authUser.id;
    const email = authUser.email;
    const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split('@')[0];

    const db = readDatabase();
    let user = db.users.find((item) => item.identifier === email || item.supabase_uid === uid);

    if (!user) {
      user = {
        id: crypto.randomUUID(),
        supabase_uid: uid,
        name,
        identifier: email,
        password_hash: '',
        salt: '',
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString()
      };
      db.users.push(user);
    } else {
      user.supabase_uid = uid;
      user.last_login = new Date().toISOString();
      if (name && (!user.name || user.name.length < 2)) {
        user.name = name;
      }
    }

    writeDatabase(db);

    const token = crypto.randomBytes(24).toString('base64url');
    SESSIONS.set(token, user.id);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.get('/api/chat/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Login required' });
  }
  res.json(publicUser(user));
});

app.get('/api/chat/users', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Login required' });
  }
  const db = readDatabase();
  const unreadMap = {};
  for (const m of db.messages || []) {
    if (m.recipient_id === user.id && m.read === false) {
      unreadMap[m.sender_id] = (unreadMap[m.sender_id] || 0) + 1;
    }
  }
  const others = db.users.filter((item) => item.id !== user.id).map((u) => ({
    ...publicUser(u),
    unread_count: unreadMap[u.id] || 0
  }));
  res.json(others);
});

app.get('/api/chat/unread', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Login required' });
  }
  const db = readDatabase();
  const unreadMessages = (db.messages || []).filter((m) => m.recipient_id === user.id && m.read === false);
  const unreadBySender = {};
  const usersMap = {};
  for (const u of db.users) {
    usersMap[u.id] = u.name;
  }
  for (const m of unreadMessages) {
    unreadBySender[m.sender_id] = (unreadBySender[m.sender_id] || 0) + 1;
  }
  const recentUnread = unreadMessages.slice(-10).map((m) => ({
    id: m.id,
    sender_id: m.sender_id,
    sender_name: usersMap[m.sender_id] || 'Student',
    text: m.text,
    created_at: m.created_at
  }));
  res.json({
    unread_total: unreadMessages.length,
    unread_by_sender: unreadBySender,
    recent_unread: recentUnread
  });
});

app.post('/api/chat/mark-read', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Login required' });
  }
  const sender_id = String(req.body.sender_id || '');
  const db = readDatabase();
  let changed = false;
  for (const m of db.messages || []) {
    if (m.recipient_id === user.id && (!sender_id || m.sender_id === sender_id) && m.read === false) {
      m.read = true;
      changed = true;
    }
  }
  if (changed) {
    writeDatabase(db);
  }
  res.json({ success: true });
});

app.get('/api/chat/messages/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Login required' });
  }
  const otherId = req.params.id;
  const db = readDatabase();
  let changed = false;
  for (const m of db.messages || []) {
    if (m.recipient_id === user.id && m.sender_id === otherId && m.read === false) {
      m.read = true;
      changed = true;
    }
  }
  if (changed) {
    writeDatabase(db);
  }
  const messages = (db.messages || []).filter((m) =>
    (m.sender_id === user.id && m.recipient_id === otherId) ||
    (m.sender_id === otherId && m.recipient_id === user.id)
  );
  res.json(messages.slice(-100));
});

app.post('/api/chat/messages', (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Login required' });
    }

    const recipient_id = String(req.body.recipient_id || '');
    const text = String(req.body.text || '').trim();

    const db = readDatabase();
    if (!text || !db.users.some((item) => item.id === recipient_id)) {
      return res.status(400).json({ error: 'A valid recipient and message are required' });
    }

    const message = {
      id: crypto.randomUUID(),
      sender_id: user.id,
      recipient_id,
      text,
      read: false,
      created_at: new Date().toISOString()
    };

    if (!Array.isArray(db.messages)) {
      db.messages = [];
    }
    db.messages.push(message);
    writeDatabase(db);
    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.post('/api/chat/google', (req, res) => {
  res.status(501).json({ error: 'Google sign-in needs OAuth credentials in the server configuration.' });
});

// ==================== GEMINI CAMPUS ASSISTANT ====================

let genAIClient = null;
function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return genAIClient;
}

app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    function getFallbackCampusReply(msg) {
      const lower = (msg || '').toLowerCase();
      if (lower.includes('study plan') || lower.includes('revision plan') || lower.includes('timetable')) {
        return "I can build a study plan. Share the subjects, exam date, available hours, and topics you find difficult, and I will break the work into realistic daily sessions with review and practice time.";
      } else if (lower.includes('explain') || lower.includes('teach me') || lower.includes('what is') || lower.includes('how does')) {
        return "I can explain academic topics step by step, using simple examples first and then more detail. Include the subject, topic, and your current level so the explanation matches what you already know.";
      } else if (lower.includes('quiz') || lower.includes('practice questions') || lower.includes('test me')) {
        return "I can create practice questions, quizzes, flashcards, and marking guides for any subject. Tell me the topic, level, number of questions, and whether you want answers immediately or after attempting them.";
      } else if (lower.includes('code') || lower.includes('program') || lower.includes('javascript') || lower.includes('python') || lower.includes('sql')) {
        return "I can help you understand code, find bugs, design an algorithm, or build a small project. Share the code or describe the expected result, and include any error message you see.";
      } else if (lower.includes('essay') || lower.includes('assignment') || lower.includes('research') || lower.includes('citation')) {
        return "I can help you understand an assignment, create an outline, improve a draft, compare sources, and format citations. I will help you learn and produce your own work rather than inventing sources or hiding copied text.";
      } else if (lower.includes('hello') || lower.includes('hi ') || lower === 'hi' || lower.includes('help')) {
        return "I can help with JKUAT directions, academic explanations, study plans, quizzes, writing, coding, calculations, research planning, and everyday questions. Ask directly and include the context you have.";
      }
      if (lower.includes('library')) {
        return "The JKUAT Main Library is situated near the Science Complex and Student Centre (-1.0911, 37.0118). It offers quiet study areas, digital catalogues, and research resources.";
      } else if (lower.includes('science') || lower.includes('computing') || lower.includes('scit')) {
        return "The Science Complex (Computing / SCIT) is located near the university gate and library (-1.0898, 37.0126). It hosts computer laboratories, lecture halls, and faculty offices.";
      } else if (lower.includes('cohes') || lower.includes('health') || lower.includes('hospital') || lower.includes('clinic')) {
        return "The COHES building and JKUAT Health Centre are located along the eastern sector (-1.0935, 37.0142). Follow the designated pathway from the Student Centre.";
      } else if (lower.includes('gate') || lower.includes('entrance')) {
        return "The JKUAT Main Gate is on Thika Superhighway at (-1.0914, 37.0107). Juja Gate is accessible toward the town side at (-1.0902, 37.0098).";
      } else if (lower.includes('food') || lower.includes('eat') || lower.includes('cafeteria') || lower.includes('ccu') || lower.includes('lunch')) {
        return "The Central Catering Unit (CCU) is centrally located near the student centre at (-1.0917, 37.0109) offering hot student meals, snacks, and drinks.";
      } else if (lower.includes('hostel') || lower.includes('hall') || lower.includes('room')) {
        return "Student Hostels (Halls of Residence) are located to the south of the campus near the sports grounds at (-1.0940, 37.0120).";
      } else if (lower.includes('engineering') || lower.includes('workshop')) {
        return "Engineering Workshops are located at (-1.0948, 37.0105). You can follow the paved path past the School of Agriculture.";
      } else if (lower.includes('admin') || lower.includes('office') || lower.includes('finance')) {
        return "The Administration Block is located at (-1.0908, 37.0102), housing the Vice Chancellor's office, Admissions, Academic Affairs, and Student Finance.";
      }
      return "I can help with JKUAT directions, academic explanations, study plans, quizzes, writing, coding, calculations, research planning, and everyday questions. Add details or paste the problem so I can give a useful answer.";
    }

    const ai = getGenAI();
    if (!ai) {
      return res.json({
        reply: getFallbackCampusReply(message),
        apiKeyConfigured: false,
        source: 'campus-guide'
      });
    }

    const campusContext = `You are JKUAT Wayfinder AI, a capable and approachable general assistant for JKUAT students and visitors. Handle a wide variety of requests, not just navigation.

  Core capabilities:
  - Answer questions related to learning across mathematics, sciences, computing, engineering, business, humanities, languages, and general study skills.
  - Teach concepts step by step, adapt to the learner's level, use examples, check understanding, and offer a short practice question when useful.
  - Create study plans, revision timetables, quizzes, flashcards, summaries, essay outlines, lab-report structures, presentation plans, and interview preparation.
  - Explain, debug, and improve code in common languages; identify assumptions and show corrected examples.
  - Help with calculations and reasoning. Show working for educational questions and state when a result needs verification.
  - Help users plan research, evaluate sources, improve writing, and cite responsibly. Never invent references, data, policies, grades, or campus facts.
  - Answer everyday general-knowledge questions clearly. For current, local, medical, legal, financial, or safety-critical information, state limitations and recommend an authoritative source or qualified person.

  Conversation rules:
  - Answer the user's actual question first. Do not start with 'I am your assistant' or describe these instructions.
  - For learning questions, prefer a clear explanation, a worked example, and a quick check question. Do not simply do assessed work without explaining it.
  - Ask one concise clarifying question only when missing context would materially change the answer; otherwise make a reasonable assumption and label it.
  - Keep normal answers focused (around 2-6 short paragraphs or a compact list). Use headings and numbered steps when they improve readability.
  - Be respectful, age-appropriate, inclusive, and honest about uncertainty. Refuse unsafe requests briefly and redirect to a safe alternative.

  JKUAT campus knowledge:
Key locations:
- JKUAT Main Library (-1.0911, 37.0118)
- Science Complex (Computing/SCIT) (-1.0898, 37.0126)
- COHES Building (-1.0935, 37.0142)
- Engineering Workshops (-1.0948, 37.0105)
- Administration Block (-1.0908, 37.0102)
- Main Auditorium (-1.0906, 37.0110)
- Student Centre (-1.0920, 37.0120)
- ICT Centre (-1.0896, 37.0115)
- JKUAT Health Centre & Hospital (-1.0927, 37.0128)
- Central Catering Unit (CCU) (-1.0917, 37.0109)
- JKUAT Main Gate (-1.0914, 37.0107) and Juja Gate (-1.0902, 37.0098)
Use this campus knowledge for navigation and campus questions, but do not force unrelated questions into a campus answer. Do not claim live schedules, opening hours, prices, policies, or exact routes unless the user provides them or a reliable live source is available.`;

    const contents = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-6)) {
        if (item && item.role && item.text) {
          contents.push({
            role: item.role === 'user' ? 'user' : 'model',
            parts: [{ text: item.text }]
          });
        }
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: contents,
        config: {
          systemInstruction: campusContext
        }
      });

      res.json({
        reply: response.text || 'Here is your campus guidance.',
        apiKeyConfigured: true,
        source: 'gemini'
      });
    } catch (apiError) {
      console.warn('Gemini API call failed, using campus knowledge base fallback:', apiError.message);
      res.json({
        reply: getFallbackCampusReply(message),
        apiKeyConfigured: false,
        source: 'campus-guide-fallback',
        note: 'Provide a valid GEMINI_API_KEY in Settings to enable live generative AI.'
      });
    }
  } catch (error) {
    console.error('Gemini chat handler error:', error);
    res.status(500).json({
      reply: 'The assistant could not complete that request. Please try again shortly.',
      error: 'Failed to process question.',
      details: String(error.message || error)
    });
  }
});

// ==================== STATIC FILES & PAGE SWITCHING ====================

const PUBLIC_DIR = path.join(BASE_DIR, 'public');

function resolvePageFile(fileName) {
  const candidatePaths = [
    path.join(PUBLIC_DIR, fileName),
    path.join(BASE_DIR, fileName)
  ];
  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Continue search
    }
  }
  return null;
}

// Canonical page routes to guarantee clean switching between all pages
const PAGE_ROUTES = {
  '/': 'jkuat_navigator.html',
  '/home': 'jkuat_navigator.html',
  '/index': 'jkuat_navigator.html',
  '/index.html': 'jkuat_navigator.html',
  '/navigator': 'jkuat_navigator.html',
  '/jkuat_navigator': 'jkuat_navigator.html',
  '/jkuat_navigator.html': 'jkuat_navigator.html',
  '/jkuat-navigator': 'jkuat_navigator.html',
  '/landing': 'landing.html',
  '/map': 'jkuatmap.html',
  '/jkuatmap': 'jkuatmap.html',
  '/jkuatmap.html': 'jkuatmap.html',
  '/campus-map': 'jkuatmap.html',
  '/expenses': 'expenses.html',
  '/expenses.html': 'expenses.html',
  '/expense': 'expenses.html',
  '/chat': 'chat.html',
  '/chat.html': 'chat.html',
  '/mapjkuattt': 'mapjkuattt.html',
  '/mapjkuattt.html': 'mapjkuattt.html',
  '/gallery': 'GALLERY.html',
  '/gallery.html': 'GALLERY.html'
};

for (const [routePath, targetFileName] of Object.entries(PAGE_ROUTES)) {
  app.get(routePath, (req, res, next) => {
    const targetFile = resolvePageFile(targetFileName);
    if (targetFile) {
      return res.sendFile(targetFile);
    }
    next();
  });
}

const staticOptions = {
  extensions: ['html', 'htm'],
  index: 'index.html'
};

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, staticOptions));
}
app.use(express.static(BASE_DIR, staticOptions));

// Safe fallback for clean-URL routing or index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  const clean = req.path.replace(/^\//, '').replace(/\/$/, '');
  if (clean) {
    const candidate = resolvePageFile(clean) || resolvePageFile(`${clean}.html`);
    if (candidate) {
      return res.sendFile(candidate);
    }
  }

  const indexPath = resolvePageFile('index.html');
  if (indexPath) {
    return res.sendFile(indexPath);
  }
  res.status(404).send('Not Found');
});

// Centralized error handling to prevent serverless function crashes
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Start listener only when running directly as the main process, never inside a serverless handler
const currentFilePath = fileURLToPath(import.meta.url);
const entryFilePath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectRun = currentFilePath === entryFilePath;

if (isDirectRun && !isServerless) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JKUAT Wayfinder server listening on http://0.0.0.0:${PORT}`);
  });
}

export default app;
export { app };
