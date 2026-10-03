const TAB_TRANSACTIONS = "Transactions";
const PREVIOUS_STATUS_HEADER = "สถานะก่อนซ่อน";
const RESTORABLE_STATUSES = ["ยืนยันแล้ว", "รอตรวจสอบ"];
const REQUIRED_HEADERS = [
  "Transaction ID",
  "วันที่เกิดรายการ",
  "เดือนใช้งาน/งบประมาณ",
  "ประเภท",
  "หมวดหมู่",
  "รายการ",
  "จำนวนเงิน",
  "ช่องทางจ่าย",
  "ลักษณะรายการ",
  "สถานะ",
  "ลิงก์หลักฐาน Drive",
  "หมายเหตุ",
  "เดือนรับเงิน",
];

function doPost(event) {
  let request = {};
  try {
    request = JSON.parse(event && event.postData && event.postData.contents || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("API_SHARED_SECRET") || "";
    if (!expectedSecret || !constantTimeEquals_(String(request.secret || ""), expectedSecret)) {
      return jsonResponse_({ ok: false, error: "Unauthorized" });
    }

    let data;
    switch (request.action) {
      case "health":
        data = getHealth_();
        break;
      case "listTransactions":
        data = { transactions: listTransactions_() };
        break;
      case "getTransactionEvidence":
        data = getTransactionEvidence_(request.transactionId);
        break;
      case "restoreMonthTransactions":
        data = restoreMonthTransactions_(request.budgetMonth);
        break;
      case "saveTransaction":
        data = saveTransaction_(request.transaction, request.evidence);
        break;
      case "softDeleteTransaction":
        data = softDeleteTransaction_(request.id);
        break;
      default:
        throw new Error("Unsupported action");
    }

    return jsonResponse_({ ok: true, data: data });
  } catch (error) {
    const details = {
      action: String(request.action || "unknown"),
      requestId: String(request.requestId || "unknown"),
      transactionId: String(request.transaction && request.transaction.id || ""),
      message: String(error && error.message || "Request failed"),
      stack: String(error && error.stack || "").slice(0, 2000),
    };
    console.error(JSON.stringify(details));
    return jsonResponse_({
      ok: false,
      error: request.action === "saveTransaction" ? "Transaction save did not complete" : "Google Apps Script request failed",
      code: request.action === "saveTransaction" ? "TRANSACTION_SAVE_FAILED" : "APPS_SCRIPT_ERROR",
      requestId: String(request.requestId || ""),
    });
  }
}

function getHealth_() {
  const spreadsheet = getSpreadsheet_();
  const folder = getDriveFolder_();
  const sheet = spreadsheet.getSheetByName(TAB_TRANSACTIONS);
  if (!sheet) throw new Error("Transactions sheet was not found");
  validateHeaders_(sheet);

  return {
    spreadsheetTitle: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    driveFolderName: folder.getName(),
    driveFolderUrl: folder.getUrl(),
  };
}

function listTransactions_() {
  const sheet = getTransactionsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const columns = headerIndexes_(headers);
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row) {
    return transactionFromRow_(row, columns);
  }).filter(function (transaction) {
    return Boolean(transaction.id);
  }).reverse();
}

function getTransactionEvidence_(transactionId) {
  const id = String(transactionId || "").trim();
  if (!id || id.length > 80) throw new Error("Transaction ID is invalid");

  const sheet = getTransactionsSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const columns = headerIndexes_(headers);
  const rowNumber = findTransactionRow_(sheet, columns["Transaction ID"], id);
  if (rowNumber < 2) throw new Error("Transaction was not found");

  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const evidenceUrl = String(readCell_(row, columns, "ลิงก์หลักฐาน Drive") || "");
  const rootFolder = getDriveFolder_();
  const file = getEvidenceFileFromUrl_(evidenceUrl) || findEvidenceFileByTransactionId_(rootFolder, id);
  if (!file || !isEvidenceFileInEvidenceTree_(file, rootFolder)) throw new Error("Evidence file was not found in the configured Drive folder");
  if (file.getSize() > 3 * 1024 * 1024) throw new Error("Evidence file is too large to preview");

  const blob = file.getBlob();
  const bytes = blob.getBytes();
  if (bytes.length > 3 * 1024 * 1024) throw new Error("Evidence file is too large to preview");
  const mimeType = String(blob.getContentType() || file.getMimeType() || "application/octet-stream").toLowerCase();
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
  if (allowedTypes.indexOf(mimeType) < 0) throw new Error("Evidence file type cannot be previewed");

  return {
    mimeType: mimeType,
    fileName: file.getName(),
    base64: Utilities.base64Encode(bytes),
  };
}

function saveTransaction_(input, evidence) {
  if (!input || typeof input !== "object") throw new Error("Transaction is required");
  const amount = Number(input.amount);
  const date = String(input.date || "");
  const budgetMonth = String(input.budgetMonth || "");
  const name = String(input.name || "").trim();
  const category = String(input.category || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(budgetMonth)) {
    throw new Error("Date or budget month is invalid");
  }
  if (!Number.isFinite(amount) || amount <= 0 || !name || !category) {
    throw new Error("Transaction data is invalid");
  }
  const preparedEvidence = evidence ? prepareEvidence_(evidence) : null;

  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    lock.waitLock(15000);
    lockAcquired = true;

    const sheet = getTransactionsSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = headerIndexes_(headers);
    const id = String(input.id || Utilities.getUuid());
    const existingRow = findTransactionRow_(sheet, columns["Transaction ID"], id);
    let existing = null;
    if (existingRow > 0) {
      existing = transactionFromRow_(sheet.getRange(existingRow, 1, 1, headers.length).getValues()[0], columns);
      if (existing.status === "ลบแล้ว") return { transaction: existing, duplicate: true };
      if (existing.status !== "รอตรวจสอบ" && (!evidence || existing.evidenceUrl)) {
        return { transaction: existing, duplicate: true };
      }
    }

    const rowNumber = existingRow > 0 ? existingRow : Math.max(sheet.getLastRow() + 1, 2);
    ensureSheetRowCapacity_(sheet, rowNumber);
    const row = existingRow > 0
      ? sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0]
      : new Array(headers.length).fill("");
    let evidenceUrl = existing ? existing.evidenceUrl : "";
    const shouldSyncEvidence = Boolean(evidence) || Boolean(existing && existing.status === "รอตรวจสอบ");

    putCell_(row, columns, "Transaction ID", id);
    putCell_(row, columns, "วันที่เกิดรายการ", Utilities.parseDate(date, "Asia/Bangkok", "yyyy-MM-dd"));
    putCell_(row, columns, "เดือนใช้งาน/งบประมาณ", budgetMonth);
    putCell_(row, columns, "ประเภท", input.type === "income" ? "รายรับ" : "รายจ่าย");
    putCell_(row, columns, "หมวดหมู่", category);
    putCell_(row, columns, "รายการ", name);
    putCell_(row, columns, "จำนวนเงิน", amount);
    putCell_(row, columns, "ช่องทางจ่าย", String(input.channel || "อื่นๆ"));
    putCell_(row, columns, "ลักษณะรายการ", String(input.nature || "ครั้งเดียว"));
    putCell_(row, columns, "สถานะ", shouldSyncEvidence ? "รอตรวจสอบ" : "ยืนยันแล้ว");
    putCell_(row, columns, "ลิงก์หลักฐาน Drive", evidenceUrl);
    putCell_(row, columns, "หมายเหตุ", String(input.note || ""));
    putCell_(row, columns, "เดือนรับเงิน", String(input.incomeMonth || ""));

    // Write a recoverable row before creating the Drive file. A failed upload
    // will leave a visible pending row instead of an unlinked receipt.
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    sheet.getRange(rowNumber, columns["วันที่เกิดรายการ"] + 1).setNumberFormat("yyyy-mm-dd");

    if (shouldSyncEvidence) {
      const rootFolder = getDriveFolder_();
      const destinationFolder = getEvidenceDestinationFolder_(rootFolder, input);
      const uploadedFile = preparedEvidence
        ? saveEvidence_(preparedEvidence, id, rootFolder)
        : getEvidenceFileFromUrl_(evidenceUrl) || findEvidenceFileByTransactionId_(rootFolder, id);
      if (!uploadedFile) throw new Error("Pending receipt file was not found");

      evidenceUrl = uploadedFile.getUrl();
      putCell_(row, columns, "ลิงก์หลักฐาน Drive", evidenceUrl);
      putCell_(row, columns, "สถานะ", "รอตรวจสอบ");
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);

      if (!isEvidenceFileInFolder_(uploadedFile, destinationFolder)) uploadedFile.moveTo(destinationFolder);
      putCell_(row, columns, "สถานะ", "ยืนยันแล้ว");
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    }

    const savedRow = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    return {
      transaction: {
        id: id,
        date: date,
        budgetMonth: budgetMonth,
        type: input.type === "income" ? "income" : "expense",
        category: category,
        name: name,
        amount: amount,
        channel: String(input.channel || "อื่นๆ"),
        nature: String(input.nature || "ครั้งเดียว"),
        status: String(readCell_(savedRow, columns, "สถานะ") || "ยืนยันแล้ว"),
        evidenceName: evidenceUrl ? "หลักฐานใน Drive" : "",
        evidenceUrl: evidenceUrl,
        note: String(input.note || ""),
        incomeMonth: String(input.incomeMonth || ""),
      },
    };
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}

function softDeleteTransaction_(id) {
  const transactionId = String(id || "").trim();
  if (!transactionId) throw new Error("Transaction ID is required");

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getTransactionsSheet_();
    const previousStatusColumn = ensurePreviousStatusColumn_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = headerIndexes_(headers);
    const rowNumber = findTransactionRow_(sheet, columns["Transaction ID"], transactionId);
    if (rowNumber < 2) throw new Error("Transaction was not found");
    const statusCell = sheet.getRange(rowNumber, columns["สถานะ"] + 1);
    const currentStatus = String(statusCell.getValue() || "").trim();
    if (currentStatus !== "ลบแล้ว") {
      sheet.getRange(rowNumber, previousStatusColumn + 1).setValue(
        RESTORABLE_STATUSES.indexOf(currentStatus) >= 0 ? currentStatus : "ยืนยันแล้ว"
      );
      statusCell.setValue("ลบแล้ว");
    }
    return { ok: true, id: transactionId, status: "ลบแล้ว" };
  } finally {
    lock.releaseLock();
  }
}

function restoreMonthTransactions_(budgetMonth) {
  const month = String(budgetMonth || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Budget month is invalid");

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getTransactionsSheet_();
    const previousStatusColumn = ensurePreviousStatusColumn_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = headerIndexes_(headers);
    const lastRow = sheet.getLastRow();
    let restoredCount = 0;

    if (lastRow > 1) {
      const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      values.forEach(function (row, index) {
        const statusIndex = columns["สถานะ"];
        const status = String(row[statusIndex] || "").trim();
        const rowMonth = monthToIso_(row[columns["เดือนใช้งาน/งบประมาณ"]]);
        if (status !== "ลบแล้ว" || rowMonth !== month) return;

        const savedStatus = String(row[previousStatusColumn] || "").trim();
        const restoredStatus = RESTORABLE_STATUSES.indexOf(savedStatus) >= 0 ? savedStatus : "ยืนยันแล้ว";
        const rowNumber = index + 2;
        sheet.getRange(rowNumber, statusIndex + 1).setValue(restoredStatus);
        sheet.getRange(rowNumber, previousStatusColumn + 1).clearContent();
        restoredCount += 1;
      });
    }

    return {
      budgetMonth: month,
      restoredCount: restoredCount,
      transactions: listTransactions_(),
    };
  } finally {
    lock.releaseLock();
  }
}

function ensurePreviousStatusColumn_(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const existingIndex = headers.indexOf(PREVIOUS_STATUS_HEADER);
  if (existingIndex >= 0) return existingIndex;

  sheet.getRange(1, lastColumn + 1).setValue(PREVIOUS_STATUS_HEADER);
  return lastColumn;
}

function prepareEvidence_(evidence) {
  const mimeType = String(evidence.mimeType || "");
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
  const base64 = String(evidence.base64 || "").replace(/^data:[^;]+;base64,/, "");
  const originalName = String(evidence.fileName || "หลักฐาน").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 140);
  if (allowedTypes.indexOf(mimeType) < 0 || !base64 || base64.length > 4250000) {
    throw new Error("Evidence file is not supported or is too large");
  }

  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > 3 * 1024 * 1024) throw new Error("Evidence must be 3 MB or smaller");
  return { mimeType: mimeType, originalName: originalName, bytes: bytes };
}

function saveEvidence_(evidence, transactionId, rootFolder) {
  const safeId = String(transactionId || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  const fileName = "TX-" + safeId + "__" + evidence.originalName;
  const existingFile = findEvidenceFile_(rootFolder, fileName) || findEvidenceFileByTransactionId_(rootFolder, safeId);
  if (existingFile) return existingFile;

  const blob = Utilities.newBlob(evidence.bytes, evidence.mimeType, fileName);
  return getOrCreateEvidenceFolder_(rootFolder, "99_รอตรวจสอบ").createFile(blob);
}

function getEvidenceDestinationFolder_(rootFolder, transaction) {
  if (transaction.type === "income") {
    return getOrCreateEvidenceFolder_(rootFolder, "01_รายรับ");
  }
  if (String(transaction.nature || "").indexOf("ประจำ") >= 0) {
    return getOrCreateEvidenceFolder_(rootFolder, "02_รายจ่ายประจำ");
  }
  if (transaction.type === "expense" && String(transaction.nature || "").indexOf("ครั้งเดียว") >= 0) {
    return getOrCreateEvidenceFolder_(rootFolder, "03_รายจ่ายผันแปร");
  }
  return getOrCreateEvidenceFolder_(rootFolder, "99_รอตรวจสอบ");
}

function getOrCreateEvidenceFolder_(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

function findEvidenceFile_(rootFolder, fileName) {
  const rootFiles = rootFolder.getFilesByName(fileName);
  if (rootFiles.hasNext()) return rootFiles.next();

  const folderNames = ["01_รายรับ", "02_รายจ่ายประจำ", "03_รายจ่ายผันแปร", "99_รอตรวจสอบ"];
  for (let index = 0; index < folderNames.length; index += 1) {
    const folders = rootFolder.getFoldersByName(folderNames[index]);
    if (!folders.hasNext()) continue;
    const files = folders.next().getFilesByName(fileName);
    if (files.hasNext()) return files.next();
  }
  return null;
}

function findEvidenceFileByTransactionId_(rootFolder, transactionId) {
  const safeId = String(transactionId || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  if (!safeId) return null;
  const prefix = "TX-" + safeId + "__";
  const folderNames = ["", "01_รายรับ", "02_รายจ่ายประจำ", "03_รายจ่ายผันแปร", "99_รอตรวจสอบ"];

  for (let index = 0; index < folderNames.length; index += 1) {
    const folderName = folderNames[index];
    let folder = rootFolder;
    if (folderName) {
      const folders = rootFolder.getFoldersByName(folderName);
      if (!folders.hasNext()) continue;
      folder = folders.next();
    }
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName().indexOf(prefix) === 0) return file;
    }
  }
  return null;
}

function getEvidenceFileFromUrl_(url) {
  const value = String(url || "");
  const match = value.match(/\/d\/([-A-Za-z0-9_]{20,})/) || value.match(/[?&]id=([-A-Za-z0-9_]{20,})/);
  if (!match) return null;
  try {
    return DriveApp.getFileById(match[1]);
  } catch (ignored) {
    return null;
  }
}

function isEvidenceFileInFolder_(file, folder) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folder.getId()) return true;
  }
  return false;
}

function isEvidenceFileInEvidenceTree_(file, rootFolder) {
  const allowedParentIds = [rootFolder.getId()];
  const folderNames = ["01_รายรับ", "02_รายจ่ายประจำ", "03_รายจ่ายผันแปร", "99_รอตรวจสอบ"];
  folderNames.forEach(function (folderName) {
    const folders = rootFolder.getFoldersByName(folderName);
    if (folders.hasNext()) allowedParentIds.push(folders.next().getId());
  });

  const parents = file.getParents();
  while (parents.hasNext()) {
    if (allowedParentIds.indexOf(parents.next().getId()) >= 0) return true;
  }
  return false;
}

function transactionFromRow_(row, columns) {
  const typeValue = String(readCell_(row, columns, "ประเภท") || "");
  const evidenceUrl = String(readCell_(row, columns, "ลิงก์หลักฐาน Drive") || "");
  return {
    id: String(readCell_(row, columns, "Transaction ID") || ""),
    date: dateToIso_(readCell_(row, columns, "วันที่เกิดรายการ")),
    budgetMonth: monthToIso_(readCell_(row, columns, "เดือนใช้งาน/งบประมาณ")),
    type: typeValue === "รายรับ" || typeValue === "income" ? "income" : "expense",
    category: String(readCell_(row, columns, "หมวดหมู่") || "อื่นๆ"),
    name: String(readCell_(row, columns, "รายการ") || ""),
    amount: Number(readCell_(row, columns, "จำนวนเงิน") || 0),
    channel: String(readCell_(row, columns, "ช่องทางจ่าย") || "อื่นๆ"),
    nature: String(readCell_(row, columns, "ลักษณะรายการ") || "ครั้งเดียว"),
    status: String(readCell_(row, columns, "สถานะ") || "ยืนยันแล้ว"),
    evidenceName: evidenceUrl ? "หลักฐานใน Drive" : "",
    evidenceUrl: evidenceUrl,
    note: String(readCell_(row, columns, "หมายเหตุ") || ""),
    incomeMonth: monthToIso_(readCell_(row, columns, "เดือนรับเงิน")),
  };
}

function getTransactionsSheet_() {
  const sheet = getSpreadsheet_().getSheetByName(TAB_TRANSACTIONS);
  if (!sheet) throw new Error("Transactions sheet was not found");
  validateHeaders_(sheet);
  return sheet;
}

function ensureSheetRowCapacity_(sheet, requiredRow) {
  const maxRows = sheet.getMaxRows();
  if (requiredRow > maxRows) {
    sheet.insertRowsAfter(maxRows, requiredRow - maxRows);
  }
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw new Error("SPREADSHEET_ID is not configured");
  return SpreadsheetApp.openById(id);
}

function getDriveFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
  if (!id) throw new Error("DRIVE_FOLDER_ID is not configured");
  return DriveApp.getFolderById(id);
}

function validateHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const missing = REQUIRED_HEADERS.filter(function (header) { return headers.indexOf(header) < 0; });
  if (missing.length) throw new Error("Transactions headers do not match the expected schema");
}

function headerIndexes_(headers) {
  const indexes = {};
  REQUIRED_HEADERS.forEach(function (header) {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error("Transactions headers do not match the expected schema");
    indexes[header] = index;
  });
  return indexes;
}

function findTransactionRow_(sheet, idColumn, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, idColumn + 1, lastRow - 1, 1).getDisplayValues();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0]) === id) return index + 2;
  }
  return -1;
}

function putCell_(row, columns, header, value) {
  const column = columns[header];
  if (column === undefined) throw new Error("Required column was not found");
  row[column] = typeof value === "string" ? safeTextCell_(value) : value;
}

function readCell_(row, columns, header) {
  const column = columns[header];
  return column === undefined ? "" : row[column];
}

function safeTextCell_(value) {
  const text = String(value);
  return /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
}

function dateToIso_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Bangkok", "yyyy-MM-dd");
  }
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : text;
}

function monthToIso_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Bangkok", "yyyy-MM");
  }
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})/);
  return match ? match[0] : text;
}

function constantTimeEquals_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
