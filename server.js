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

const express     = require('express');
const initSqlJs   = require('sql.js');
const fs          = require('fs');
const path        = require('path');
const https       = require('https');       // Built-in Node.js — used to call Twilio's REST API
const querystring = require('querystring'); // Built-in Node.js — converts JS objects to form-encoded strings

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
const DB_PATH             = path.join(__dirname, 'leads.db');

// Twilio credentials — loaded from .env
const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER; // Josh's Twilio number (receives calls)
const JOSH_PHONE_NUMBER   = process.env.JOSH_PHONE_NUMBER;   // Josh's real personal number (calls forwarded here)

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

// Same pattern — crash immediately with a clear message if Twilio config is missing
if (!TWILIO_ACCOUNT_SID)  { console.error('ERROR: TWILIO_ACCOUNT_SID is not set. Add it to your .env file.');  process.exit(1); }
if (!TWILIO_AUTH_TOKEN)   { console.error('ERROR: TWILIO_AUTH_TOKEN is not set. Add it to your .env file.');    process.exit(1); }
if (!TWILIO_PHONE_NUMBER) { console.error('ERROR: TWILIO_PHONE_NUMBER is not set. Add it to your .env file.');  process.exit(1); }
if (!JOSH_PHONE_NUMBER)   { console.error('ERROR: JOSH_PHONE_NUMBER is not set. Add it to your .env file.');    process.exit(1); }

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

  /*
    LEARNING: SQLite doesn't support "ALTER TABLE ... ADD COLUMN IF NOT EXISTS".
    The safest workaround for a beginner project is to just try adding the column
    and catch the error if it already exists — SQLite throws "duplicate column name"
    in that case. This means the server can restart safely without crashing.
  */
  try { db.exec(`ALTER TABLE leads ADD COLUMN status TEXT DEFAULT 'new-lead'`); } catch (e) { /* column already exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN notes  TEXT DEFAULT ''`);         } catch (e) { /* column already exists */ }

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


  /*
    sendTwilioSMS() — sends an SMS via Twilio's REST API.

    LEARNING: We're not using the Twilio npm package here. Instead we
    use Node's built-in 'https' module to make a raw HTTP POST request
    directly to Twilio's API — exactly what the package does internally,
    but with no extra dependency to install.

    Twilio's REST API for sending messages:
      POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json

    Authentication is HTTP Basic Auth — a standard where you send
    "username:password" encoded in base64 inside an Authorization header.
    For Twilio: username = Account SID, password = Auth Token.

    The function returns a Promise so callers can use 'await' on it.
  */
  function sendTwilioSMS(to, body) {
    return new Promise((resolve, reject) => {
      // querystring.stringify converts { To: '+1...', Body: 'Hi!' }
      // into the string "To=%2B1...&Body=Hi%21" that Twilio's API expects
      const postData = querystring.stringify({
        To:   to,
        From: TWILIO_PHONE_NUMBER,
        Body: body
      });

      // HTTP Basic Auth: base64-encode "accountSid:authToken"
      const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

      const options = {
        hostname: 'api.twilio.com',
        port:     443,
        path:     `/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        method:   'POST',
        headers: {
          'Authorization':  `Basic ${auth}`,
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 201) {
            console.log(`SMS sent to ${to}`);
            resolve(data);
          } else {
            console.error(`Twilio SMS failed (${res.statusCode}): ${data}`);
            reject(new Error(`Twilio API error: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err) => {
        console.error('SMS request error:', err.message);
        reject(err);
      });

      req.write(postData);
      req.end();
    });
  }


  /* ================================================================
     EXPRESS APP
     ================================================================ */

  const app = express();

  app.use(express.json());
  /*
    LEARNING: Twilio sends webhook POST bodies as application/x-www-form-urlencoded
    (the same format regular HTML form submissions use). Without this middleware,
    req.body would be empty when Twilio hits our webhook routes.
    express.urlencoded() parses that format and populates req.body for us.
  */
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname)));


  /* ----------------------------------------------------------------
     POST /webhook/incoming-call
     Twilio calls this URL the moment someone dials Josh's Twilio number.

     LEARNING: TwiML (Twilio Markup Language) is XML that tells Twilio
     what to do with a phone call. We return it as a plain string and
     set the Content-Type to text/xml so Twilio knows to read it as XML.

     What this TwiML does:
     - <Dial action="/webhook/call-status" timeout="20"> tries to
       connect the incoming caller to JOSH_PHONE_NUMBER.
     - timeout="20" means Twilio waits 20 seconds for Josh to pick up.
     - action="/webhook/call-status" is a relative URL — Twilio will
       POST the call result to that path on whichever domain it used
       to reach this route (your ngrok URL). This means you don't have
       to hardcode the ngrok URL anywhere in the code.
     - If Josh picks up: normal conversation happens.
     - If Josh doesn't pick up: Twilio hits /webhook/call-status next.
     ---------------------------------------------------------------- */
  app.post('/webhook/incoming-call', (req, res) => {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial action="/webhook/call-status" timeout="20">
    <Number>${JOSH_PHONE_NUMBER}</Number>
  </Dial>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  });


  /* ----------------------------------------------------------------
     POST /webhook/call-status
     Twilio hits this URL after the <Dial> attempt in /webhook/incoming-call
     finishes — regardless of whether Josh answered or not.

     Twilio includes these fields in the POST body:
       DialCallStatus — what happened: completed, no-answer, busy, failed, canceled
       From           — the original caller's phone number (e.g. +15551234567)

     We only act when it's a missed-call status. If DialCallStatus is
     'completed', Josh answered and we do nothing.
     ---------------------------------------------------------------- */
  app.post('/webhook/call-status', async (req, res) => {
    const dialStatus  = req.body.DialCallStatus;
    const callerPhone = req.body.From;

    console.log(`Call status webhook — DialCallStatus: ${dialStatus}, From: ${callerPhone}`);

    // These four statuses all mean Josh did not pick up
    const MISSED_STATUSES = ['no-answer', 'busy', 'failed', 'canceled'];

    if (MISSED_STATUSES.includes(dialStatus)) {

      // 1. Save the caller as a new lead in the database.
      //    We don't know their name or email from a phone call alone,
      //    so we use placeholder values. Josh can edit notes in the admin panel.
      db.run(
        `INSERT INTO leads (name, phone, email, service, message, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'Unknown Caller',          // name — unknown from a call
          callerPhone,               // phone — provided by Twilio in E.164 format (+15551234567)
          '',                        // email — unknown from a call (empty string satisfies NOT NULL)
          'other',                   // service — closest valid type for an unknown inquiry
          'Missed call via Twilio',  // message — explains how this lead was created
          'new-lead'                 // status — start at the beginning of the pipeline
        ]
      );
      saveToDisk();
      console.log(`New lead saved from missed call: ${callerPhone}`);

      // 2. Send an SMS back to the caller so they know Josh will follow up
      const smsBody =
        `Hi! We missed your call at Josh's Plumbing. We'll be in touch shortly. ` +
        `Call us back at ${TWILIO_PHONE_NUMBER} if it's urgent.`;

      try {
        await sendTwilioSMS(callerPhone, smsBody);
      } catch (err) {
        // The lead is already saved — a failed SMS shouldn't stop the response.
        // We log it so Josh can see it in the terminal, but we don't crash.
        console.error('Failed to send SMS:', err.message);
      }
    }

    // Twilio requires a valid TwiML response from every webhook, even status callbacks.
    // An empty <Response> is fine — it just tells Twilio "nothing more to do."
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  });


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

    const leads = dbAll('SELECT id, name, phone, email, service, message, status, notes, submitted_at FROM leads ORDER BY submitted_at DESC');
    res.json(leads);
  });


  /* ----------------------------------------------------------------
     PATCH /api/leads/:id
     Updates the status and/or notes on a single lead.
     Requires the admin password header, just like GET /api/leads.
     ---------------------------------------------------------------- */
  app.patch('/api/leads/:id', (req, res) => {
    const password = req.headers['x-admin-password'];
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorised.' });
    }

    /*
      LEARNING: req.params.id is the :id part of the URL — e.g. for a request
      to PATCH /api/leads/7, req.params.id is the string "7".
      We parse it to an integer with parseInt() before using it in SQL.
    */
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid lead ID.' });
    }

    const { status, notes } = req.body;

    // Validate status if provided — only allow the five known pipeline stages
    const VALID_STATUSES = ['new-lead', 'contacted', 'quoted', 'won', 'lost'];
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    /*
      Build the UPDATE query dynamically so we only touch the fields
      that were actually sent. If only notes is sent, we don't overwrite status,
      and vice versa.
    */
    const fields = [];
    const values = [];

    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (notes  !== undefined) { fields.push('notes = ?');  values.push(notes);  }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    values.push(id); // for the WHERE clause

    db.run(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`, values);
    saveToDisk();

    res.json({ success: true });
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
