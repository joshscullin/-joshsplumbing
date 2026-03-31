/*
  ================================================================
  JOSH'S PLUMBING — server.js
  ================================================================

  HOW TO START:
    npm install        (first time only)
    node server.js

  Then visit: http://localhost:3000
  Admin panel: http://localhost:3000/admin
*/

const express    = require('express');
const initSqlJs  = require('sql.js');
const fs         = require('fs');
const path       = require('path');

/*
  LEARNING: dotenv reads your .env file and loads every line into
  process.env — Node.js's built-in object that holds environment variables.

  process.env exists in every Node.js program. It's a plain object you
  can read from anywhere in your code:
    process.env.ADMIN_PASSWORD  →  'admin123'  (or whatever you set)

  The .config() call must happen before any code that reads process.env,
  so we do it right at the top of the file.

  If .env doesn't exist (e.g. on a production server), dotenv does nothing
  and process.env still works — production platforms like Heroku or Render
  let you set environment variables through their own dashboard instead of
  a file.
*/
require('dotenv').config();

const PORT           = 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
/*
  LEARNING: process.env.ADMIN_PASSWORD reads the ADMIN_PASSWORD variable
  that dotenv loaded from .env. If the variable isn't set, this will be
  undefined — which is why the startup check below is important.
*/
const DB_PATH        = path.join(__dirname, 'leads.db');

/*
  LEARNING: sql.js is a pure-JavaScript version of SQLite compiled to
  WebAssembly. Unlike better-sqlite3, it doesn't need any native
  compilation tools — it works on any machine with Node.js installed.

  The trade-off: sql.js keeps the entire database in memory while the
  server is running. To save data permanently we call db.export() which
  returns the database as a Uint8Array (raw bytes), then write that to
  disk with fs.writeFileSync. We do this after every INSERT.

  Because loading the WebAssembly binary is asynchronous, we wrap
  everything in an async function called startServer() and use
  'await' to wait for it before setting up our routes.
*/

/*
  LEARNING: Fail loudly at startup if a required variable is missing.
  It's much better to get a clear error message immediately ("ADMIN_PASSWORD
  is not set") than to have the server start but behave strangely later —
  e.g. accepting any password because undefined === undefined is true.
*/
if (!ADMIN_PASSWORD) {
  console.error('ERROR: ADMIN_PASSWORD is not set. Add it to your .env file.');
  process.exit(1);
  /*
    process.exit(1) shuts Node.js down immediately.
    The argument 1 is an "exit code" — 0 means success, anything else
    means something went wrong. Build tools and hosting platforms read
    this code to know whether a process crashed or ended normally.
  */
}

async function startServer() {

  /* ================================================================
     DATABASE SETUP
     ================================================================ */

  /*
    LEARNING: await pauses execution until the Promise resolves.
    initSqlJs() returns a Promise — a value that isn't ready yet.
    await gives us the resolved value (the SQL constructor) once
    the WebAssembly module has finished loading.
  */
  const SQL = await initSqlJs();

  /*
    If leads.db already exists on disk, load it into memory.
    If not, create a fresh empty database.
    Either way, 'db' is now a live in-memory database object.
  */
  let db;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('Database loaded: leads.db');
  } else {
    db = new SQL.Database();
    console.log('Database created: leads.db');
  }

  // Create the leads table if it doesn't already exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id           INTEGER  PRIMARY KEY AUTOINCREMENT,
      name         TEXT     NOT NULL,
      phone        TEXT     NOT NULL,
      email        TEXT     NOT NULL,
      service      TEXT     NOT NULL,
      message      TEXT     DEFAULT '',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Save the initial state to disk right away
  saveToDisk();

  /*
    saveToDisk() — call this after every write operation.
    db.export() serialises the in-memory database to a Uint8Array.
    Buffer.from() converts that to a Node.js Buffer so fs can write it.
  */
  function saveToDisk() {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }

  /*
    dbAll() — run a SELECT query and return all rows as an array of objects.

    LEARNING: sql.js uses a lower-level API than better-sqlite3.
    db.prepare() returns a Statement. We call stmt.step() to advance
    through each row one at a time, and stmt.getAsObject() to read the
    current row as a plain JS object { id: 1, name: 'Sarah', ... }.
    stmt.free() releases the memory when we're done.
  */
  function dbAll(sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }


  /* ================================================================
     EXPRESS APP
     ================================================================ */

  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname)));


  /* ----------------------------------------------------------------
     POST /api/contact
     Receives form data, validates it, saves it to the database.
     ---------------------------------------------------------------- */
  app.post('/api/contact', (req, res) => {
    const { name, phone, email, service, message } = req.body;

    // Server-side validation
    if (!name || !name.trim())  return res.status(400).json({ error: 'Name is required.' });
    if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone is required.' });
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
    if (!service)                return res.status(400).json({ error: 'Service is required.' });

    /*
      LEARNING: sql.js uses positional ? placeholders just like better-sqlite3.
      The values are passed as an array — the first ? gets params[0],
      the second ? gets params[1], and so on.
      This prevents SQL injection the same way.
    */
    db.run(
      `INSERT INTO leads (name, phone, email, service, message)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name.trim(),
        phone.trim(),
        email.trim(),
        service,
        (message || '').trim()
      ]
    );

    // Persist to disk immediately so no data is lost if the server restarts
    saveToDisk();

    res.json({ success: true });
  });


  /* ----------------------------------------------------------------
     GET /api/leads
     Returns all leads as JSON. Requires the admin password in a header.
     ---------------------------------------------------------------- */
  app.get('/api/leads', (req, res) => {
    const password = req.headers['x-admin-password'];

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorised.' });
    }

    const leads = dbAll('SELECT * FROM leads ORDER BY submitted_at DESC');
    res.json(leads);
  });


  /* ----------------------------------------------------------------
     GET /admin — serve the admin page
     ---------------------------------------------------------------- */
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
  });


  /* ================================================================
     START THE SERVER
     ================================================================ */
  app.listen(PORT, () => {
    console.log('');
    console.log("Josh's Plumbing server started.");
    console.log(`Landing page: http://localhost:${PORT}`);
    console.log(`Admin panel:  http://localhost:${PORT}/admin`);
    console.log('');
    console.log('Press Ctrl+C to stop the server.');
  });
}

// Kick everything off
startServer();
