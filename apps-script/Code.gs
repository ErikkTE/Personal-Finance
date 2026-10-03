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
  try {
    const request = JSON.parse(event && event.postData && event.postData.contents || "{}");
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
    return jsonResponse_({ ok: false, error: error && error.message ? error.message : "Request failed" });
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

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let uploadedFile = null;
  try {
    const sheet = getTransactionsSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = headerIndexes_(headers);
    const id = String(input.id || Utilities.getUuid());
    const existingRow = findTransactionRow_(sheet, columns["Transaction ID"], id);
    if (existingRow > 0) {
      const existing = transactionFromRow_(sheet.getRange(existingRow, 1, 1, headers.length).getValues()[0], columns);
      return { transaction: existing, duplicate: true };
    }

    let evidenceUrl = "";
    let evidenceName = "";
    if (evidence) {
      uploadedFile = saveEvidence_(evidence);
      evidenceUrl = uploadedFile.getUrl();
      evidenceName = uploadedFile.getName();
    }

    const row = new Array(headers.length).fill("");
    putCell_(row, columns, "Transaction ID", id);
    putCell_(row, columns, "วันที่เกิดรายการ", Utilities.parseDate(date, "Asia/Bangkok", "yyyy-MM-dd"));
    putCell_(row, columns, "เดือนใช้งาน/งบประมาณ", budgetMonth);
    putCell_(row, columns, "ประเภท", input.type === "income" ? "รายรับ" : "รายจ่าย");
    putCell_(row, columns, "หมวดหมู่", category);
    putCell_(row, columns, "รายการ", name);
    putCell_(row, columns, "จำนวนเงิน", amount);
    putCell_(row, columns, "ช่องทางจ่าย", String(input.channel || "อื่นๆ"));
    putCell_(row, columns, "ลักษณะรายการ", String(input.nature || "ครั้งเดียว"));
    putCell_(row, columns, "สถานะ", "ยืนยันแล้ว");
    putCell_(row, columns, "ลิงก์หลักฐาน Drive", evidenceUrl);
    putCell_(row, columns, "หมายเหตุ", String(input.note || ""));
    putCell_(row, columns, "เดือนรับเงิน", String(input.incomeMonth || ""));

    const newRowNumber = sheet.getLastRow() + 1;
    sheet.getRange(newRowNumber, 1, 1, row.length).setValues([row]);
    sheet.getRange(newRowNumber, columns["วันที่เกิดรายการ"] + 1).setNumberFormat("yyyy-mm-dd");
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
        status: "ยืนยันแล้ว",
        evidenceName: evidenceName,
        evidenceUrl: evidenceUrl,
        note: String(input.note || ""),
        incomeMonth: String(input.incomeMonth || ""),
      },
    };
  } catch (error) {
    if (uploadedFile) {
      try { uploadedFile.setTrashed(true); } catch (ignored) {}
    }
    throw error;
  } finally {
    lock.releaseLock();
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

function saveEvidence_(evidence) {
  const mimeType = String(evidence.mimeType || "");
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
  const base64 = String(evidence.base64 || "").replace(/^data:[^;]+;base64,/, "");
  const fileName = String(evidence.fileName || "หลักฐาน").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 160);
  if (allowedTypes.indexOf(mimeType) < 0 || !base64 || base64.length > 4250000) {
    throw new Error("Evidence file is not supported or is too large");
  }

  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > 3 * 1024 * 1024) throw new Error("Evidence must be 3 MB or smaller");
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  return getDriveFolder_().createFile(blob);
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
