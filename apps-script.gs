// BRCC Collaring — Google Sheet руу өгөгдөл, Google Drive руу зураг хүлээн авах скрипт.
// Заавар: README.md → "Google Sheet холбох". Энэ кодыг Google Sheet → Extensions → Apps Script дотор буулгаад
// Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) гэж байршуулна.
// Хуудсууд автоматаар үүснэ: Бодгаль, Судалгаа, Амин үзүүлэлт, Дээж, Хөөлтийн зам, Зураг.
const PHOTO_FOLDER = "BRCC Collaring зураг";

function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    (body.items || []).forEach(function (it) {
      if (it.kind === "survey") upsert(ss, "Судалгаа", it.row);
      else if (it.kind === "ind") upsert(ss, "Бодгаль", it.row);
      else if (it.kind === "track") saveTrack(ss, it);
      else if (it.kind === "photo") savePhoto(ss, it);
      else if (it.kind === "rows") saveRows(ss, it);
    });
    return ContentService.createTextOutput("ok");
  } finally { lock.releaseLock(); }
}

function upsert(ss, name, row) {
  let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
  let headers = sh.getLastRow() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  Object.keys(row).forEach(function (k) { if (headers.indexOf(k) < 0) { headers.push(k); sh.getRange(1, headers.length).setValue(k).setFontWeight("bold"); } });
  const idCol = headers.indexOf("id") + 1, last = sh.getLastRow();
  let target = 0;
  if (last > 1 && idCol > 0) {
    const ids = sh.getRange(2, idCol, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) if (ids[i][0] === row.id) { target = i + 2; break; }
  }
  const values = headers.map(function (h) { return row[h] === undefined || row[h] === null ? "" : row[h]; });
  if (target) sh.getRange(target, 1, 1, headers.length).setValues([values]); else sh.appendRow(values);
}

// Нэг бодгалийн хөөлтийн замыг дахин бичнэ (хуучин мөрүүдийг устгаад шинээр)
function saveTrack(ss, it) {
  let sh = ss.getSheetByName("Хөөлтийн зам");
  if (!sh) { sh = ss.insertSheet("Хөөлтийн зам"); sh.appendRow(["id", "Хүзүүвч / бодгаль", "Цаг", "N", "E"]); }
  const last = sh.getLastRow();
  if (last > 1) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) if (ids[i][0] === it.id) sh.deleteRow(i + 2);
  }
  const rows = (it.points || []).map(function (p) { return [it.id, it.name, p[2], p[0], p[1]]; });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
}

// Амин үзүүлэлт, Дээж: нэг бодгалийн мөрүүдийг устгаад шинээр бичнэ (эхний багана = бодгалийн id)
function saveRows(ss, it) {
  let sh = ss.getSheetByName(it.sheet);
  const header = ["Бодгалийн id"].concat(it.header || []);
  if (!sh && !(it.rows || []).length) return;
  if (!sh) { sh = ss.insertSheet(it.sheet); sh.appendRow(header); sh.getRange(1, 1, 1, header.length).setFontWeight("bold"); }
  const last = sh.getLastRow();
  if (last > 1) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) if (ids[i][0] === it.id) sh.deleteRow(i + 2);
  }
  const rows = (it.rows || []).map(function (r) { return [it.id].concat(r); });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
}

function savePhoto(ss, it) {
  const root = folder(DriveApp.getRootFolder(), PHOTO_FOLDER);
  const dir = it.survey ? folder(root, it.survey) : root;
  const existing = dir.getFilesByName(it.name);
  const file = existing.hasNext() ? existing.next() : dir.createFile(Utilities.newBlob(Utilities.base64Decode(String(it.data).split(",")[1]), "image/jpeg", it.name));
  upsert(ss, "Зураг", { id: it.id, "Бодгалийн id": it.ind, "Файл": it.name, "Тэмдэглэл": it.note || "", "Холбоос": file.getUrl() });
}
function folder(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }

function doGet() { return ContentService.createTextOutput("BRCC Collaring sync endpoint OK"); }
