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

-- Well-formed form posts per day (YYYY-MM-DD, UTC), for the site's daily limit.
CREATE TABLE sends (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);

-- Well-formed form posts per sender per day. `key` is an HMAC, under a secret and the day, of the sender's IPv4 address
-- or IPv6 /64, so it cannot be turned back into the address and does not link one day to the next. Deleted the next day.
CREATE TABLE senders (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, key)
);
