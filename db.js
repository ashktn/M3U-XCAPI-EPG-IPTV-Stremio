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
            provider_key TEXT NOT NULL,
            imdb_id TEXT NOT NULL,
            tmdb_id INTEGER NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            PRIMARY KEY (provider_key, imdb_id)
        );
        
        CREATE TABLE IF NOT EXISTS tmdb_streams (
            provider_key TEXT NOT NULL,
            tmdb_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            PRIMARY KEY (provider_key, tmdb_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_imdb_tmdb_tmdb ON imdb_tmdb(tmdb_id);
        CREATE INDEX IF NOT EXISTS idx_tmdb_streams_type ON tmdb_streams(type);
    `);
    
    console.log('[SQLITE] Database initialized at', DB_PATH);
    return db;
}

function getIMDBtoTMDB(providerKey, imdbId) {
    const stmt = getDb().prepare('SELECT tmdb_id FROM imdb_tmdb WHERE provider_key = ? AND imdb_id = ?');
    const row = stmt.get(providerKey, imdbId);
    return row ? row.tmdb_id : null;
}

function setIMDBtoTMDB(providerKey, imdbId, tmdbId) {
    const stmt = getDb().prepare(`
        INSERT OR REPLACE INTO imdb_tmdb (provider_key, imdb_id, tmdb_id, created_at)
        VALUES (?, ?, ?, strftime('%s', 'now'))
    `);
    stmt.run(providerKey, imdbId, tmdbId);
}

function getTMDBStreams(providerKey, tmdbId) {
    const stmt = getDb().prepare('SELECT type, data FROM tmdb_streams WHERE provider_key = ? AND tmdb_id = ?');
    const row = stmt.get(providerKey, tmdbId);
    if (!row) return null;
    return {
        type: row.type,
        ...JSON.parse(row.data)
    };
}

function setTMDBStreams(providerKey, tmdbId, type, data) {
    const stmt = getDb().prepare(`
        INSERT OR REPLACE INTO tmdb_streams (provider_key, tmdb_id, type, data, updated_at)
        VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    `);
    stmt.run(providerKey, tmdbId, type, JSON.stringify(data));
}

function clearAllCache() {
    getDb().exec('DELETE FROM imdb_tmdb; DELETE FROM tmdb_streams;');
    console.log('[SQLITE] Cache cleared');
}

function getCacheStats(providerKey) {
    const db = getDb();
    let imdbCount, streamCount, movieCount, seriesCount;
    
    if (providerKey) {
        imdbCount = db.prepare('SELECT COUNT(*) as count FROM imdb_tmdb WHERE provider_key = ?').get(providerKey).count;
        streamCount = db.prepare('SELECT COUNT(*) as count FROM tmdb_streams WHERE provider_key = ?').get(providerKey).count;
        movieCount = db.prepare("SELECT COUNT(*) as count FROM tmdb_streams WHERE provider_key = ? AND type = 'movie'").get(providerKey).count;
        seriesCount = db.prepare("SELECT COUNT(*) as count FROM tmdb_streams WHERE provider_key = ? AND type = 'series'").get(providerKey).count;
    } else {
        imdbCount = db.prepare('SELECT COUNT(*) as count FROM imdb_tmdb').get().count;
        streamCount = db.prepare('SELECT COUNT(*) as count FROM tmdb_streams').get().count;
        movieCount = db.prepare("SELECT COUNT(*) as count FROM tmdb_streams WHERE type = 'movie'").get().count;
        seriesCount = db.prepare("SELECT COUNT(*) as count FROM tmdb_streams WHERE type = 'series'").get().count;
    }
    return { imdbCount, streamCount, movieCount, seriesCount };
}

function createProviderKey(config) {
    if (config.provider === 'xtream' && config.xtreamUrl && config.xtreamUsername && config.xtreamPassword) {
        return `${config.xtreamUrl}:${config.xtreamUsername}:${config.xtreamPassword}`;
    }
    if (config.m3uUrl) {
        return config.m3uUrl;
    }
    return config.provider || 'unknown';
}

module.exports = {
    getDb,
    getIMDBtoTMDB,
    setIMDBtoTMDB,
    getTMDBStreams,
    setTMDBStreams,
    clearAllCache,
    getCacheStats,
    createProviderKey
};
