// Tiny SQLite storage layer.
// Each case is one JSON document; photos live in their own table because they are large.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Photo, SettlementCase } from "./types";

let database: Database.Database | null = null;

function getDb(): Database.Database {
  if (database) {
    return database;
  }

  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  database = new Database(path.join(dataDir, "scuff.db"));
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      party TEXT NOT NULL,
      kind TEXT NOT NULL,
      data_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS photos_by_case ON photos(case_id);
  `);
  return database;
}

export function insertCase(c: SettlementCase): void {
  getDb()
    .prepare("INSERT INTO cases (id, code, data, updated_at) VALUES (?, ?, ?, ?)")
    .run(c.id, c.code, JSON.stringify(c), c.updatedAt);
}

export function saveCase(c: SettlementCase): void {
  c.updatedAt = new Date().toISOString();
  getDb()
    .prepare("UPDATE cases SET data = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(c), c.updatedAt, c.id);
}

export function findCaseById(id: string): SettlementCase | null {
  const row = getDb().prepare("SELECT data FROM cases WHERE id = ?").get(id) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as SettlementCase) : null;
}

export function findCaseByCode(code: string): SettlementCase | null {
  const row = getDb().prepare("SELECT data FROM cases WHERE code = ?").get(code.toUpperCase()) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as SettlementCase) : null;
}

export function insertPhoto(p: Photo): void {
  getDb()
    .prepare(
      "INSERT INTO photos (id, case_id, party, kind, data_url, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(p.id, p.caseId, p.party, p.kind, p.dataUrl, p.createdAt);
}

export function deletePhoto(caseId: string, photoId: string): void {
  getDb().prepare("DELETE FROM photos WHERE case_id = ? AND id = ?").run(caseId, photoId);
}

interface PhotoRow {
  id: string;
  case_id: string;
  party: string;
  kind: string;
  data_url: string;
  created_at: string;
}

function rowToPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    caseId: row.case_id,
    party: row.party as Photo["party"],
    kind: row.kind as Photo["kind"],
    dataUrl: row.data_url,
    createdAt: row.created_at,
  };
}

export function listPhotos(caseId: string): Photo[] {
  const rows = getDb()
    .prepare("SELECT * FROM photos WHERE case_id = ? ORDER BY created_at")
    .all(caseId) as PhotoRow[];
  const photos: Photo[] = [];
  for (const row of rows) {
    photos.push(rowToPhoto(row));
  }
  return photos;
}

export function findPhoto(caseId: string, photoId: string): Photo | null {
  const row = getDb()
    .prepare("SELECT * FROM photos WHERE case_id = ? AND id = ?")
    .get(caseId, photoId) as PhotoRow | undefined;
  return row ? rowToPhoto(row) : null;
}
