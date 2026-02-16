const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, 'cache.db');

let db = null;

function getDb() {
    if (db) return db;
    
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS imdb_tmdb (
            imdb_id TEXT PRIMARY KEY,
            tmdb_id INTEGER NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        
        CREATE TABLE IF NOT EXISTS tmdb_streams (
            tmdb_id INTEGER PRIMARY KEY,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_imdb_tmdb_tmdb ON imdb_tmdb(tmdb_id);
        CREATE INDEX IF NOT EXISTS idx_tmdb_streams_type ON tmdb_streams(type);
    `);
    
    console.log('[SQLITE] Database initialized at', DB_PATH);
    return db;
}

function getIMDBtoTMDB(imdbId) {
    const stmt = getDb().prepare('SELECT tmdb_id FROM imdb_tmdb WHERE imdb_id = ?');
    const row = stmt.get(imdbId);
    return row ? row.tmdb_id : null;
}

function setIMDBtoTMDB(imdbId, tmdbId) {
    const stmt = getDb().prepare(`
        INSERT OR REPLACE INTO imdb_tmdb (imdb_id, tmdb_id, created_at)
        VALUES (?, ?, strftime('%s', 'now'))
    `);
    stmt.run(imdbId, tmdbId);
}

function getTMDBStreams(tmdbId) {
    const stmt = getDb().prepare('SELECT type, data FROM tmdb_streams WHERE tmdb_id = ?');
    const row = stmt.get(tmdbId);
    if (!row) return null;
    return {
        type: row.type,
        ...JSON.parse(row.data)
    };
}

function setTMDBStreams(tmdbId, type, data) {
    const stmt = getDb().prepare(`
        INSERT OR REPLACE INTO tmdb_streams (tmdb_id, type, data, updated_at)
        VALUES (?, ?, ?, strftime('%s', 'now'))
    `);
    stmt.run(tmdbId, type, JSON.stringify(data));
}

function clearAllCache() {
    getDb().exec('DELETE FROM imdb_tmdb; DELETE FROM tmdb_streams;');
    console.log('[SQLITE] Cache cleared');
}

function getCacheStats() {
    const db = getDb();
    const imdbCount = db.prepare('SELECT COUNT(*) as count FROM imdb_tmdb').get().count;
    const streamCount = db.prepare('SELECT COUNT(*) as count FROM tmdb_streams').get().count;
    const movieCount = db.prepare("SELECT COUNT(*) as count FROM tmdb_streams WHERE type = 'movie'").get().count;
    const seriesCount = db.prepare("SELECT COUNT(*) as count FROM tmdb_streams WHERE type = 'series'").get().count;
    return { imdbCount, streamCount, movieCount, seriesCount };
}

module.exports = {
    getDb,
    getIMDBtoTMDB,
    setIMDBtoTMDB,
    getTMDBStreams,
    setTMDBStreams,
    clearAllCache,
    getCacheStats
};
