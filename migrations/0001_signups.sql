-- The waitlist. One row per address; only hashes of the tokens are kept, and no IP address, browser or tracking data.
CREATE TABLE signups (
  email TEXT PRIMARY KEY,
  editor TEXT NOT NULL DEFAULT '' CHECK (editor IN ('', 'screens', 'world', 'characters', 'feel', 'sound', 'story')),
  status TEXT NOT NULL CHECK (status IN ('waiting', 'joined')),
  confirm_hash TEXT UNIQUE,
  confirm_expires INTEGER,
  leave_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  joined_at INTEGER,
  last_sent_at INTEGER NOT NULL
);

-- Confirmation emails sent per day (YYYY-MM-DD, UTC), for the daily cap.
CREATE TABLE sends (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);
