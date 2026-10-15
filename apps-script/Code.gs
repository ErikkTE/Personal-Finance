const TAB_TRANSACTIONS = "Transactions";
const TAB_INSTALLMENTS = "Installments";
const TAB_INSTALLMENT_PAYMENTS = "Installment Payments";
const TAB_SUBSCRIPTIONS = "Subscriptions";
const TAB_RECURRING_EXPENSES = "Recurring Expenses";
const TAB_APP_CATEGORIES = "App Categories";
const TAB_DEBTS = "Debts";
const TAB_DEBT_PAYMENTS = "Debt Payments";
const APP_CATEGORY_HEADERS = ["ขอบเขต", "หมวดหมู่", "วันที่สร้าง"];
const INSTALLMENT_HEADERS = ["Installment ID", "รายการสินค้า", "ราคาสินค้า", "เงินดาวน์", "ดอกเบี้ยรวม (%)", "จำนวนเดือน", "ธนาคาร", "เดือนเริ่มชำระ", "ยอดรวม", "วันที่บันทึก", "ลบเมื่อ"];
const INSTALLMENT_PAYMENT_HEADERS = ["Installment ID", "งวดที่", "เดือนครบกำหนด", "จำนวนเงิน", "ชำระแล้ว", "วันที่ชำระ"];
const SUBSCRIPTION_HEADERS = ["Subscription ID", "ชื่อบริการ", "จำนวนเงิน", "รอบเรียกเก็บ", "วันเรียกเก็บครั้งถัดไป", "หมวดหมู่", "ช่องทางชำระ", "หมายเหตุ", "วันที่บันทึก", "ลบเมื่อ"];
const RECURRING_EXPENSE_HEADERS = ["Recurring Expense ID", "ชื่อรายการ", "จำนวนเงินต่อเดือน", "หมวดหมู่", "วันที่ชำระ", "เดือนเริ่ม", "เดือนสิ้นสุด", "หมายเหตุ", "วันที่บันทึก", "ลบเมื่อ"];
const DEBT_HEADERS = ["Debt ID", "ผู้ให้ยืม", "ผู้ยืม", "วันที่ยืม", "เงินต้น", "มีดอกเบี้ย", "ดอกเบี้ยรวม (%)", "จำนวนงวด", "ความสำคัญ", "หมายเหตุ", "รูปหลักฐานการยืม (JSON)", "ลายเซ็นผู้ยืม (JSON)", "วันที่บันทึก"];
const DEBT_PAYMENT_HEADERS = ["Debt ID", "งวดที่", "วันครบกำหนด", "จำนวนเงิน", "วันที่ชำระ", "รูปหลักฐานการชำระ (JSON)", "ลายเซ็นผู้รับเงิน (JSON)", "หมายเหตุ", "Request ID"];
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
      case "restoreTransaction":
        data = restoreTransaction_(request.id);
        break;
      case "saveTransaction":
        data = saveTransaction_(request.transaction, request.evidence);
        break;
      case "listInstallments":
        data = { installments: listInstallments_() };
        break;
      case "listDebts":
        data = { debts: listDebts_() };
        break;
      case "saveDebt":
        data = saveDebt_(request.debt);
        break;
      case "recordDebtPayment":
        data = recordDebtPayment_(request.payment, request.requestId);
        break;
      case "getDebtEvidence":
        data = getDebtEvidence_(request.debtId, request.kind, request.index, request.installmentNumber);
        break;
      case "saveInstallment":
        data = saveInstallment_(request.installment);
        break;
      case "setInstallmentPayment":
        data = setInstallmentPayment_(request.id, request.installmentNumber, request.paid);
        break;
      case "softDeleteInstallment":
        data = softDeleteInstallment_(request.id);
        break;
      case "restoreInstallment":
        data = restoreInstallment_(request.id);
        break;
      case "listSubscriptions":
        data = { subscriptions: listSubscriptions_() };
        break;
      case "saveSubscription":
        data = saveSubscription_(request.subscription);
        break;
      case "softDeleteSubscription":
        data = softDeleteSubscription_(request.id);
        break;
      case "restoreSubscription":
        data = restoreSubscription_(request.id);
        break;
      case "listRecurringExpenses":
        data = { recurringExpenses: listRecurringExpenses_() };
        break;
      case "listCategories":
        data = { categories: listAppCategories_() };
        break;
      case "saveCategory":
        data = saveAppCategory_(request.category);
        break;
      case "saveRecurringExpense":
        data = saveRecurringExpense_(request.recurringExpense);
        break;
      case "softDeleteRecurringExpense":
        data = softDeleteRecurringExpense_(request.id);
        break;
      case "restoreRecurringExpense":
        data = restoreRecurringExpense_(request.id);
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
      installmentId: String(request.installment && request.installment.id || request.id || ""),
      debtId: String(request.debt && request.debt.id || request.payment && request.payment.debtId || request.debtId || ""),
      recurringExpenseId: String(request.recurringExpense && request.recurringExpense.id || request.id || ""),
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

function listDebts_() {
  const sheets = ensureDebtSheets_();
  const debtSheet = sheets.debts;
  const paymentSheet = sheets.payments;
  const debtHeaders = debtSheet.getRange(1, 1, 1, debtSheet.getLastColumn()).getDisplayValues()[0];
  const debtColumns = columnIndexes_(debtHeaders, DEBT_HEADERS, "Debts");
  const paymentHeaders = paymentSheet.getRange(1, 1, 1, paymentSheet.getLastColumn()).getDisplayValues()[0];
  const paymentColumns = columnIndexes_(paymentHeaders, DEBT_PAYMENT_HEADERS, "Debt Payments");
  const paymentsByDebt = {};

  if (paymentSheet.getLastRow() > 1) {
    const paymentRows = paymentSheet.getRange(2, 1, paymentSheet.getLastRow() - 1, paymentHeaders.length).getValues();
    paymentRows.forEach(function (row) {
      const id = String(readCell_(row, paymentColumns, "Debt ID") || "");
      if (!id) return;
      if (!paymentsByDebt[id]) paymentsByDebt[id] = [];
      paymentsByDebt[id].push({
        installmentNumber: Number(readCell_(row, paymentColumns, "งวดที่") || 0),
        paidAt: dateToIso_(readCell_(row, paymentColumns, "วันที่ชำระ")),
        evidence: publicDebtEvidence_(parseDebtJson_(readCell_(row, paymentColumns, "รูปหลักฐานการชำระ (JSON)"), [])),
        signature: publicDebtEvidence_(parseDebtJson_(readCell_(row, paymentColumns, "ลายเซ็นผู้รับเงิน (JSON)"), null)),
        note: String(readCell_(row, paymentColumns, "หมายเหตุ") || ""),
      });
    });
  }

  if (debtSheet.getLastRow() < 2) return [];
  const debtRows = debtSheet.getRange(2, 1, debtSheet.getLastRow() - 1, debtHeaders.length).getValues();
  return debtRows.map(function (row) {
    return debtFromRow_(row, debtColumns, paymentsByDebt[String(readCell_(row, debtColumns, "Debt ID") || "")] || []);
  }).filter(function (debt) {
    return Boolean(debt.id);
  }).reverse();
}

function saveDebt_(input) {
  const debt = validateDebt_(input);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheets = ensureDebtSheets_();
    const sheet = sheets.debts;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, DEBT_HEADERS, "Debts");
    const existingRow = findInstallmentRow_(sheet, columns["Debt ID"], debt.id);
    if (existingRow > 0) {
      return { debt: getDebtById_(debt.id) };
    }

    const rootFolder = getDriveFolder_();
    const debtFolder = getDebtFolder_(debt.id, rootFolder);
    const loanFolder = getOrCreateEvidenceFolder_(debtFolder, "01_ตอนยืม");
    const loanEvidence = debt.loanEvidence.map(function (item, index) {
      return saveDebtMedia_(item, loanFolder, debt.id, "loan-photo-" + (index + 1), index);
    });
    const lenderSignature = debt.lenderSignature
      ? saveDebtMedia_(debt.lenderSignature, loanFolder, debt.id, "loan-signature", 0)
      : null;

    const row = new Array(headers.length).fill("");
    putCell_(row, columns, "Debt ID", debt.id);
    putCell_(row, columns, "ผู้ให้ยืม", debt.lender);
    putCell_(row, columns, "ผู้ยืม", debt.borrower);
    putCell_(row, columns, "วันที่ยืม", debt.loanDate);
    putCell_(row, columns, "เงินต้น", debt.principal);
    putCell_(row, columns, "มีดอกเบี้ย", debt.hasInterest);
    putCell_(row, columns, "ดอกเบี้ยรวม (%)", debt.interestRate);
    putCell_(row, columns, "จำนวนงวด", debt.installments);
    putCell_(row, columns, "ความสำคัญ", debt.priority);
    putCell_(row, columns, "หมายเหตุ", debt.note);
    putCell_(row, columns, "รูปหลักฐานการยืม (JSON)", JSON.stringify(loanEvidence));
    putCell_(row, columns, "ลายเซ็นผู้ยืม (JSON)", lenderSignature ? JSON.stringify(lenderSignature) : "");
    putCell_(row, columns, "วันที่บันทึก", new Date());
    const rowNumber = Math.max(sheet.getLastRow() + 1, 2);
    ensureSheetRowCapacity_(sheet, rowNumber);
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return { debt: getDebtById_(debt.id) };
  } finally {
    lock.releaseLock();
  }
}

function recordDebtPayment_(input, requestId) {
  const payment = validateDebtPayment_(input);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheets = ensureDebtSheets_();
    const debtSheet = sheets.debts;
    const debtHeaders = debtSheet.getRange(1, 1, 1, debtSheet.getLastColumn()).getDisplayValues()[0];
    const debtColumns = columnIndexes_(debtHeaders, DEBT_HEADERS, "Debts");
    const debtRowNumber = findInstallmentRow_(debtSheet, debtColumns["Debt ID"], payment.debtId);
    if (debtRowNumber < 2) throw new Error("Debt was not found");
    const debtRow = debtSheet.getRange(debtRowNumber, 1, 1, debtHeaders.length).getValues()[0];
    const debt = debtFromRow_(debtRow, debtColumns, []);
    if (payment.paidAt < debt.loanDate) throw new Error("วันที่ชำระต้องไม่ก่อนวันที่ยืม");

    const paymentSheet = sheets.payments;
    const paymentHeaders = paymentSheet.getRange(1, 1, 1, paymentSheet.getLastColumn()).getDisplayValues()[0];
    const paymentColumns = columnIndexes_(paymentHeaders, DEBT_PAYMENT_HEADERS, "Debt Payments");
    const existingPaymentRow = findDebtPaymentRow_(paymentSheet, paymentColumns, payment.debtId, payment.installmentNumber);
    if (existingPaymentRow > 0) return { debt: getDebtById_(payment.debtId) };

    const schedule = buildDebtSchedule_(debt);
    const scheduledPayment = schedule[payment.installmentNumber - 1];
    if (!scheduledPayment) throw new Error("Debt installment was not found");
    if (schedule.every(function (item) { return item.paid; })) throw new Error("Debt was already fully paid");

    const rootFolder = getDriveFolder_();
    const debtFolder = getDebtFolder_(payment.debtId, rootFolder);
    const paymentFolder = getOrCreateEvidenceFolder_(debtFolder, "02_การชำระ");
    const installmentFolder = getOrCreateEvidenceFolder_(paymentFolder, "งวด-" + String(payment.installmentNumber).padStart(3, "0"));
    const evidence = payment.evidence.map(function (item, index) {
      return saveDebtMedia_(item, installmentFolder, payment.debtId, "payment-" + payment.installmentNumber + "-photo-" + (index + 1), index);
    });
    const signature = saveDebtMedia_(payment.signature, installmentFolder, payment.debtId, "payment-" + payment.installmentNumber + "-signature", 0);
    const row = new Array(paymentHeaders.length).fill("");
    putCell_(row, paymentColumns, "Debt ID", payment.debtId);
    putCell_(row, paymentColumns, "งวดที่", payment.installmentNumber);
    putCell_(row, paymentColumns, "วันครบกำหนด", scheduledPayment.dueDate);
    putCell_(row, paymentColumns, "จำนวนเงิน", scheduledPayment.amount);
    putCell_(row, paymentColumns, "วันที่ชำระ", payment.paidAt);
    putCell_(row, paymentColumns, "รูปหลักฐานการชำระ (JSON)", JSON.stringify(evidence));
    putCell_(row, paymentColumns, "ลายเซ็นผู้รับเงิน (JSON)", JSON.stringify(signature));
    putCell_(row, paymentColumns, "หมายเหตุ", payment.note);
    putCell_(row, paymentColumns, "Request ID", String(requestId || ""));
    const rowNumber = Math.max(paymentSheet.getLastRow() + 1, 2);
    ensureSheetRowCapacity_(paymentSheet, rowNumber);
    paymentSheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return { debt: getDebtById_(payment.debtId) };
  } finally {
    lock.releaseLock();
  }
}

function getDebtEvidence_(debtId, kind, index, installmentNumber) {
  const id = String(debtId || "").trim();
  const evidenceKind = String(kind || "");
  const evidenceIndex = Number(index || 0);
  const number = Number(installmentNumber || 0);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || ["loan-photo", "loan-signature", "payment-photo", "payment-signature"].indexOf(evidenceKind) < 0) {
    throw new Error("Debt evidence request is invalid");
  }
  const sheets = ensureDebtSheets_();
  const debtSheet = sheets.debts;
  const headers = debtSheet.getRange(1, 1, 1, debtSheet.getLastColumn()).getDisplayValues()[0];
  const columns = columnIndexes_(headers, DEBT_HEADERS, "Debts");
  const rowNumber = findInstallmentRow_(debtSheet, columns["Debt ID"], id);
  if (rowNumber < 2) throw new Error("Debt was not found");
  const row = debtSheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  let metadata = null;
  if (evidenceKind === "loan-photo") {
    metadata = parseDebtJson_(readCell_(row, columns, "รูปหลักฐานการยืม (JSON)"), [])[evidenceIndex] || null;
  } else if (evidenceKind === "loan-signature") {
    metadata = parseDebtJson_(readCell_(row, columns, "ลายเซ็นผู้ยืม (JSON)"), null);
  } else {
    if (!Number.isInteger(number) || number < 1 || number > 120 || !Number.isInteger(evidenceIndex) || evidenceIndex < 0 || evidenceIndex > 2) {
      throw new Error("Debt evidence request is invalid");
    }
    const paymentSheet = sheets.payments;
    const paymentHeaders = paymentSheet.getRange(1, 1, 1, paymentSheet.getLastColumn()).getDisplayValues()[0];
    const paymentColumns = columnIndexes_(paymentHeaders, DEBT_PAYMENT_HEADERS, "Debt Payments");
    const paymentRowNumber = findDebtPaymentRow_(paymentSheet, paymentColumns, id, number);
    if (paymentRowNumber < 2) throw new Error("Debt payment evidence was not found");
    const paymentRow = paymentSheet.getRange(paymentRowNumber, 1, 1, paymentHeaders.length).getValues()[0];
    metadata = evidenceKind === "payment-photo"
      ? parseDebtJson_(readCell_(paymentRow, paymentColumns, "รูปหลักฐานการชำระ (JSON)"), [])[evidenceIndex] || null
      : parseDebtJson_(readCell_(paymentRow, paymentColumns, "ลายเซ็นผู้รับเงิน (JSON)"), null);
  }
  if (!metadata || !metadata.fileId) throw new Error("Debt evidence was not found");

  const rootFolder = getDriveFolder_();
  let file;
  try { file = DriveApp.getFileById(String(metadata.fileId)); } catch (ignored) { file = null; }
  if (!file || !isDriveItemWithinFolderTree_(file, rootFolder)) throw new Error("Debt evidence is outside the configured Drive folder");
  if (file.getSize() > 480000) throw new Error("Debt evidence file is too large");
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  const mimeType = String(blob.getContentType() || file.getMimeType() || "").toLowerCase();
  if (bytes.length > 480000 || ["image/jpeg", "image/png", "image/webp"].indexOf(mimeType) < 0) {
    throw new Error("Debt evidence file type is not supported");
  }
  return { mimeType: mimeType, fileName: file.getName(), base64: Utilities.base64Encode(bytes) };
}

function validateDebt_(input) {
  if (!input || typeof input !== "object") throw new Error("Debt is required");
  const id = String(input.id || "").trim();
  const lender = String(input.lender || "").trim();
  const borrower = String(input.borrower || "").trim();
  const loanDate = String(input.loanDate || "");
  const principal = Number(input.principal);
  const hasInterest = input.hasInterest === true;
  const interestRate = hasInterest ? Number(input.interestRate) : 0;
  const installments = Number(input.installments);
  const priority = String(input.priority || "");
  const note = String(input.note || "").trim();
  const validDate = function (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split("-").map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
  };
  const today = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || !lender || lender.length > 100 || !borrower || borrower.length > 100) {
    throw new Error("Debt identity is invalid");
  }
  if (!validDate(loanDate) || loanDate > today || !Number.isFinite(principal) || principal <= 0 || principal > 100000000) {
    throw new Error("Debt date or principal is invalid");
  }
  if ((hasInterest && (!Number.isFinite(interestRate) || interestRate <= 0 || interestRate > 100)) ||
    !Number.isInteger(installments) || installments < 1 || installments > 120 ||
    ["high", "normal", "low"].indexOf(priority) < 0 || note.length > 500) {
    throw new Error("Debt terms are invalid");
  }
  const loanEvidence = Array.isArray(input.loanEvidence) ? input.loanEvidence : [];
  if (loanEvidence.length > 3) throw new Error("Debt accepts up to three photos");
  loanEvidence.forEach(validateDebtMedia_);
  const lenderSignature = input.lenderSignature ? validateDebtMedia_(input.lenderSignature, true) : null;
  return {
    id: id, lender: lender, borrower: borrower, loanDate: loanDate,
    principal: Math.round(principal * 100) / 100,
    hasInterest: hasInterest, interestRate: hasInterest ? interestRate : 0,
    installments: installments, priority: priority, note: note,
    loanEvidence: loanEvidence, lenderSignature: lenderSignature,
  };
}

function validateDebtPayment_(input) {
  if (!input || typeof input !== "object") throw new Error("Debt payment is required");
  const debtId = String(input.debtId || "").trim();
  const installmentNumber = Number(input.installmentNumber);
  const paidAt = String(input.paidAt || "");
  const note = String(input.note || "").trim();
  const validDate = function (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split("-").map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
  };
  const today = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(debtId) || !Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > 120) {
    throw new Error("Debt payment identity is invalid");
  }
  if (!validDate(paidAt) || paidAt > today || note.length > 300 || evidence.length < 1 || evidence.length > 3) {
    throw new Error("Debt payment data is invalid");
  }
  evidence.forEach(validateDebtMedia_);
  const signature = validateDebtMedia_(input.signature, true);
  return { debtId: debtId, installmentNumber: installmentNumber, paidAt: paidAt, note: note, evidence: evidence, signature: signature };
}

function validateDebtMedia_(media, signatureOnly) {
  if (!media || typeof media !== "object") throw new Error("Debt evidence is invalid");
  const mimeType = String(media.mimeType || "").toLowerCase();
  const base64 = String(media.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (["image/jpeg", "image/png", "image/webp"].indexOf(mimeType) < 0 || (signatureOnly && mimeType !== "image/png") ||
    !base64 || base64.length > 650000) {
    throw new Error("Debt evidence image is not supported");
  }
  const bytes = Utilities.base64Decode(base64);
  if (!bytes.length || bytes.length > 480000) throw new Error("Debt evidence must be 480 KB or smaller");
  return {
    fileName: String(media.fileName || "evidence-image").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 100),
    mimeType: mimeType,
    base64: base64,
    bytes: bytes,
  };
}

function saveDebtMedia_(media, folder, debtId, label, index) {
  const safeId = String(debtId).replace(/[^A-Za-z0-9_-]/g, "_");
  const originalName = String(media.fileName || "evidence-image").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 80);
  const fileName = "DEBT-" + safeId + "-" + label + "-" + (index + 1) + "__" + originalName;
  const matches = folder.getFilesByName(fileName);
  let file = matches.hasNext() ? matches.next() : null;
  if (!file) {
    const prepared = media.bytes ? media : validateDebtMedia_(media, String(label).indexOf("signature") >= 0);
    file = folder.createFile(Utilities.newBlob(prepared.bytes, prepared.mimeType, fileName));
  }
  return { fileId: file.getId(), fileName: file.getName(), mimeType: String(file.getMimeType()), index: index };
}

function getDebtFolder_(debtId, rootFolder) {
  const parent = getOrCreateEvidenceFolder_(rootFolder, "04_ทวงหนี้");
  return getOrCreateEvidenceFolder_(parent, "DEBT-" + String(debtId).replace(/[^A-Za-z0-9_-]/g, "_"));
}

function ensureDebtSheets_() {
  const spreadsheet = getSpreadsheet_();
  let debts = spreadsheet.getSheetByName(TAB_DEBTS);
  let payments = spreadsheet.getSheetByName(TAB_DEBT_PAYMENTS);
  if (!debts) debts = spreadsheet.insertSheet(TAB_DEBTS);
  if (!payments) payments = spreadsheet.insertSheet(TAB_DEBT_PAYMENTS);
  ensureTableHeaders_(debts, DEBT_HEADERS, "Debts");
  ensureTableHeaders_(payments, DEBT_PAYMENT_HEADERS, "Debt Payments");
  return { debts: debts, payments: payments };
}

function debtFromRow_(row, columns, payments) {
  const debt = {
    id: String(readCell_(row, columns, "Debt ID") || ""),
    lender: String(readCell_(row, columns, "ผู้ให้ยืม") || ""),
    borrower: String(readCell_(row, columns, "ผู้ยืม") || ""),
    loanDate: dateToIso_(readCell_(row, columns, "วันที่ยืม")),
    principal: Number(readCell_(row, columns, "เงินต้น") || 0),
    hasInterest: readCell_(row, columns, "มีดอกเบี้ย") === true || String(readCell_(row, columns, "มีดอกเบี้ย")).toLowerCase() === "true",
    interestRate: Number(readCell_(row, columns, "ดอกเบี้ยรวม (%)") || 0),
    installments: Number(readCell_(row, columns, "จำนวนงวด") || 0),
    priority: String(readCell_(row, columns, "ความสำคัญ") || "normal"),
    note: String(readCell_(row, columns, "หมายเหตุ") || ""),
    loanEvidence: publicDebtEvidence_(parseDebtJson_(readCell_(row, columns, "รูปหลักฐานการยืม (JSON)"), [])),
    lenderSignature: publicDebtEvidence_(parseDebtJson_(readCell_(row, columns, "ลายเซ็นผู้ยืม (JSON)"), null)),
    createdAt: dateToIso_(readCell_(row, columns, "วันที่บันทึก")),
    payments: payments || [],
  };
  const schedule = buildDebtSchedule_(debt);
  const totalAmount = debtAmount_(debt);
  const paidAmount = Math.round(schedule.filter(function (item) { return item.paid; }).reduce(function (sum, item) { return sum + item.amount; }, 0) * 100) / 100;
  debt.schedule = schedule;
  debt.totalAmount = totalAmount;
  debt.paidAmount = paidAmount;
  debt.remainingAmount = Math.round((totalAmount - paidAmount) * 100) / 100;
  debt.paidCount = schedule.filter(function (item) { return item.paid; }).length;
  debt.complete = schedule.length > 0 && debt.paidCount === schedule.length;
  return debt;
}

function buildDebtSchedule_(debt) {
  const months = Number(debt.installments);
  if (!months || months < 1 || months > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(String(debt.loanDate || ""))) return [];
  const totalCents = Math.round(debtAmount_(debt) * 100);
  const regularCents = Math.floor(totalCents / months);
  let remainingCents = totalCents;
  const paidByNumber = {};
  (debt.payments || []).forEach(function (payment) { paidByNumber[Number(payment.installmentNumber)] = payment; });
  return Array.from({ length: months }, function (ignored, index) {
    const installmentNumber = index + 1;
    const amountCents = index === months - 1 ? remainingCents : regularCents;
    remainingCents -= amountCents;
    const parts = String(debt.loanDate).split("-").map(Number);
    const dueFirst = new Date(Date.UTC(parts[0], parts[1] - 1 + installmentNumber, 1));
    const dueYear = dueFirst.getUTCFullYear();
    const dueMonth = dueFirst.getUTCMonth();
    const dueDay = Math.min(parts[2], new Date(Date.UTC(dueYear, dueMonth + 1, 0)).getUTCDate());
    const monthText = String(dueMonth + 1).padStart(2, "0");
    const dueDate = String(dueYear) + "-" + monthText + "-" + String(dueDay).padStart(2, "0");
    const payment = paidByNumber[installmentNumber];
    return {
      installmentNumber: installmentNumber,
      month: String(dueYear) + "-" + monthText,
      dueDate: dueDate,
      amount: amountCents / 100,
      paid: Boolean(payment),
      paidAt: payment ? payment.paidAt : "",
      evidence: payment ? payment.evidence : [],
      signature: payment ? payment.signature : null,
      note: payment ? payment.note : "",
    };
  });
}

function debtAmount_(debt) {
  const principal = Number(debt.principal || 0);
  const interestRate = debt.hasInterest ? Number(debt.interestRate || 0) : 0;
  return Math.round((principal + principal * interestRate / 100) * 100) / 100;
}

function getDebtById_(id) {
  const debt = listDebts_().filter(function (item) { return item.id === id; })[0];
  if (!debt) throw new Error("Debt was not found after saving");
  return debt;
}

function findDebtPaymentRow_(sheet, columns, debtId, installmentNumber) {
  if (sheet.getLastRow() < 2) return -1;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (let index = 0; index < rows.length; index += 1) {
    if (String(readCell_(rows[index], columns, "Debt ID") || "") === debtId &&
      Number(readCell_(rows[index], columns, "งวดที่") || 0) === Number(installmentNumber)) return index + 2;
  }
  return -1;
}

function parseDebtJson_(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  try { return JSON.parse(String(value)); } catch (ignored) { return fallback; }
}

function publicDebtEvidence_(value) {
  if (!value) return null;
  const publicItem = function (item) {
    return item ? { fileName: String(item.fileName || ""), mimeType: String(item.mimeType || ""), index: Number(item.index || 0) } : null;
  };
  return Array.isArray(value) ? value.map(publicItem).filter(Boolean) : publicItem(value);
}

function isDriveItemWithinFolderTree_(item, rootFolder) {
  const pending = [item];
  const seen = {};
  let depth = 0;
  while (pending.length && depth < 12) {
    const current = pending.shift();
    if (!current || seen[current.getId()]) continue;
    seen[current.getId()] = true;
    if (current.getId() === rootFolder.getId()) return true;
    const parents = current.getParents();
    while (parents.hasNext()) pending.push(parents.next());
    depth += 1;
  }
  return false;
}

function listInstallments_() {
  const spreadsheet = getSpreadsheet_();
  const installmentSheet = spreadsheet.getSheetByName(TAB_INSTALLMENTS);
  const paymentSheet = spreadsheet.getSheetByName(TAB_INSTALLMENT_PAYMENTS);
  if (!installmentSheet && !paymentSheet) return [];
  if (!installmentSheet || !paymentSheet) throw new Error("Installment sheets are incomplete");
  ensureTableHeaders_(installmentSheet, INSTALLMENT_HEADERS, "Installments");
  validateTableHeaders_(paymentSheet, INSTALLMENT_PAYMENT_HEADERS, "Installment Payments");

  const plansLastRow = installmentSheet.getLastRow();
  if (plansLastRow < 2) return [];
  const planHeaders = installmentSheet.getRange(1, 1, 1, installmentSheet.getLastColumn()).getDisplayValues()[0];
  const planColumns = columnIndexes_(planHeaders, INSTALLMENT_HEADERS, "Installments");
  const planRows = installmentSheet.getRange(2, 1, plansLastRow - 1, planHeaders.length).getValues();

  const paymentsByPlan = {};
  const paymentsLastRow = paymentSheet.getLastRow();
  if (paymentsLastRow > 1) {
    const paymentHeaders = paymentSheet.getRange(1, 1, 1, paymentSheet.getLastColumn()).getDisplayValues()[0];
    const paymentColumns = columnIndexes_(paymentHeaders, INSTALLMENT_PAYMENT_HEADERS, "Installment Payments");
    const paymentRows = paymentSheet.getRange(2, 1, paymentsLastRow - 1, paymentHeaders.length).getValues();
    paymentRows.forEach(function (row) {
      const id = String(readCell_(row, paymentColumns, "Installment ID") || "");
      if (!id) return;
      if (!paymentsByPlan[id]) paymentsByPlan[id] = [];
      const paidValue = readCell_(row, paymentColumns, "ชำระแล้ว");
      paymentsByPlan[id].push({
        installmentNumber: Number(readCell_(row, paymentColumns, "งวดที่") || 0),
        month: monthToIso_(readCell_(row, paymentColumns, "เดือนครบกำหนด")),
        amount: Number(readCell_(row, paymentColumns, "จำนวนเงิน") || 0),
        paid: paidValue === true || String(paidValue).toLowerCase() === "true" || String(paidValue) === "ชำระแล้ว",
        paidAt: dateToIso_(readCell_(row, paymentColumns, "วันที่ชำระ")),
      });
    });
  }

  return planRows.map(function (row) {
    const id = String(readCell_(row, planColumns, "Installment ID") || "");
    return installmentFromRow_(row, planColumns, paymentsByPlan[id] || []);
  }).filter(function (plan) {
    return Boolean(plan.id) && !plan.deletedAt;
  }).reverse();
}

function softDeleteInstallment_(id) {
  const planId = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(planId)) throw new Error("Installment ID is invalid");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheets = ensureInstallmentSheets_();
    const sheet = sheets.master;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, INSTALLMENT_HEADERS, "Installments");
    const rowNumber = findInstallmentRow_(sheet, columns["Installment ID"], planId);
    if (rowNumber < 2) throw new Error("Installment was not found");
    sheet.getRange(rowNumber, columns["ลบเมื่อ"] + 1).setValue(new Date());
    return { ok: true, id: planId, deleted: true };
  } finally {
    lock.releaseLock();
  }
}

function restoreInstallment_(id) {
  const planId = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(planId)) throw new Error("Installment ID is invalid");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheets = ensureInstallmentSheets_();
    const sheet = sheets.master;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, INSTALLMENT_HEADERS, "Installments");
    const rowNumber = findInstallmentRow_(sheet, columns["Installment ID"], planId);
    if (rowNumber < 2) throw new Error("Installment was not found");
    sheet.getRange(rowNumber, columns["ลบเมื่อ"] + 1).clearContent();
    return { ok: true, id: planId, restored: true };
  } finally {
    lock.releaseLock();
  }
}

function listSubscriptions_() {
  const sheet = ensureSubscriptionsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const columns = columnIndexes_(headers, SUBSCRIPTION_HEADERS, "Subscriptions");
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function (row) {
    return subscriptionFromRow_(row, columns);
  }).filter(function (item) {
    return Boolean(item.id) && !item.deletedAt;
  }).reverse();
}

function saveSubscription_(input) {
  if (!input || typeof input !== "object") throw new Error("Subscription is required");
  const id = String(input.id || "").trim();
  const name = String(input.name || "").trim().slice(0, 120);
  const amount = Number(input.amount);
  const cycle = String(input.cycle || "");
  const nextBillingDate = String(input.nextBillingDate || "");
  const category = String(input.category || "อื่นๆ").trim().slice(0, 60);
  const paymentMethod = String(input.paymentMethod || "").trim().slice(0, 80);
  const note = String(input.note || "").trim().slice(0, 500);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || !name || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    throw new Error("Subscription data is invalid");
  }
  if (["monthly", "yearly"].indexOf(cycle) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(nextBillingDate) || !paymentMethod) {
    throw new Error("Subscription cycle, billing date or payment method is invalid");
  }
  const [year, month, day] = nextBillingDate.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) {
    throw new Error("Subscription billing date is invalid");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureSubscriptionsSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, SUBSCRIPTION_HEADERS, "Subscriptions");
    const existingRow = findInstallmentRow_(sheet, columns["Subscription ID"], id);
    const rowNumber = existingRow > 0 ? existingRow : Math.max(sheet.getLastRow() + 1, 2);
    ensureSheetRowCapacity_(sheet, rowNumber);
    const row = existingRow > 0
      ? sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0]
      : new Array(headers.length).fill("");
    putCell_(row, columns, "Subscription ID", id);
    putCell_(row, columns, "ชื่อบริการ", name);
    putCell_(row, columns, "จำนวนเงิน", amount);
    putCell_(row, columns, "รอบเรียกเก็บ", cycle);
    putCell_(row, columns, "วันเรียกเก็บครั้งถัดไป", Utilities.parseDate(nextBillingDate, "Asia/Bangkok", "yyyy-MM-dd"));
    putCell_(row, columns, "หมวดหมู่", category);
    putCell_(row, columns, "ช่องทางชำระ", paymentMethod);
    putCell_(row, columns, "หมายเหตุ", note);
    if (!existingRow) putCell_(row, columns, "วันที่บันทึก", new Date());
    putCell_(row, columns, "ลบเมื่อ", "");
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    sheet.getRange(rowNumber, columns["วันเรียกเก็บครั้งถัดไป"] + 1).setNumberFormat("yyyy-mm-dd");
    const saved = listSubscriptions_().filter(function (item) { return item.id === id; })[0];
    if (!saved) throw new Error("Subscription was not found after saving");
    return { subscription: saved };
  } finally {
    lock.releaseLock();
  }
}

function softDeleteSubscription_(id) {
  const subscriptionId = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(subscriptionId)) throw new Error("Subscription ID is invalid");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureSubscriptionsSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, SUBSCRIPTION_HEADERS, "Subscriptions");
    const rowNumber = findInstallmentRow_(sheet, columns["Subscription ID"], subscriptionId);
    if (rowNumber < 2) throw new Error("Subscription was not found");
    sheet.getRange(rowNumber, columns["ลบเมื่อ"] + 1).setValue(new Date());
    return { ok: true, id: subscriptionId, deleted: true };
  } finally {
    lock.releaseLock();
  }
}

function restoreSubscription_(id) {
  const subscriptionId = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(subscriptionId)) throw new Error("Subscription ID is invalid");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureSubscriptionsSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, SUBSCRIPTION_HEADERS, "Subscriptions");
    const rowNumber = findInstallmentRow_(sheet, columns["Subscription ID"], subscriptionId);
    if (rowNumber < 2) throw new Error("Subscription was not found");
    sheet.getRange(rowNumber, columns["ลบเมื่อ"] + 1).clearContent();
    return { ok: true, id: subscriptionId, restored: true };
  } finally {
    lock.releaseLock();
  }
}

function subscriptionFromRow_(row, columns) {
  return {
    id: String(readCell_(row, columns, "Subscription ID") || ""),
    name: String(readCell_(row, columns, "ชื่อบริการ") || ""),
    amount: Number(readCell_(row, columns, "จำนวนเงิน") || 0),
    cycle: String(readCell_(row, columns, "รอบเรียกเก็บ") || "monthly"),
    nextBillingDate: dateToIso_(readCell_(row, columns, "วันเรียกเก็บครั้งถัดไป")),
    category: String(readCell_(row, columns, "หมวดหมู่") || "อื่นๆ"),
    paymentMethod: String(readCell_(row, columns, "ช่องทางชำระ") || ""),
    note: String(readCell_(row, columns, "หมายเหตุ") || ""),
    createdAt: dateToIso_(readCell_(row, columns, "วันที่บันทึก")),
    deletedAt: dateToIso_(readCell_(row, columns, "ลบเมื่อ")),
  };
}

function ensureSubscriptionsSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(TAB_SUBSCRIPTIONS);
  if (!sheet) sheet = spreadsheet.insertSheet(TAB_SUBSCRIPTIONS);
  ensureTableHeaders_(sheet, SUBSCRIPTION_HEADERS, "Subscriptions");
  return sheet;
}

function listRecurringExpenses_() {
  const sheet = ensureRecurringExpensesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const columns = columnIndexes_(headers, RECURRING_EXPENSE_HEADERS, "Recurring Expenses");
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function (row) {
    return recurringExpenseFromRow_(row, columns);
  }).filter(function (item) {
    return Boolean(item.id) && !item.deletedAt;
  }).reverse();
}

function saveRecurringExpense_(input) {
  if (!input || typeof input !== "object") throw new Error("Recurring expense is required");
  const id = String(input.id || "").trim();
  const name = String(input.name || "").trim().slice(0, 120);
  const amount = Number(input.amount);
  const category = String(input.category || "อื่นๆ").trim();
  const dueDay = Number(input.dueDay);
  const startMonth = String(input.startMonth || "");
  const endMonth = String(input.endMonth || "");
  const note = String(input.note || "").trim().slice(0, 500);
  const validMonth = function (value) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); };
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || !name || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    throw new Error("Recurring expense data is invalid");
  }
  if (!category || category.length > 40 || /^[=+\-@]/.test(category) || /[\u0000-\u001f\u007f]/.test(category) || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error("Recurring expense category or due day is invalid");
  }
  if (!validMonth(startMonth) || (endMonth && (!validMonth(endMonth) || endMonth < startMonth))) {
    throw new Error("Recurring expense month range is invalid");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureRecurringExpensesSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, RECURRING_EXPENSE_HEADERS, "Recurring Expenses");
    const existingRow = findInstallmentRow_(sheet, columns["Recurring Expense ID"], id);
    const rowNumber = existingRow > 0 ? existingRow : Math.max(sheet.getLastRow() + 1, 2);
    ensureSheetRowCapacity_(sheet, rowNumber);
    const row = existingRow > 0
      ? sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0]
      : new Array(headers.length).fill("");
    putCell_(row, columns, "Recurring Expense ID", id);
    putCell_(row, columns, "ชื่อรายการ", name);
    putCell_(row, columns, "จำนวนเงินต่อเดือน", amount);
    putCell_(row, columns, "หมวดหมู่", category);
    putCell_(row, columns, "วันที่ชำระ", dueDay);
    putCell_(row, columns, "เดือนเริ่ม", startMonth);
    putCell_(row, columns, "เดือนสิ้นสุด", endMonth);
    putCell_(row, columns, "หมายเหตุ", note);
    if (!existingRow) putCell_(row, columns, "วันที่บันทึก", new Date());
    putCell_(row, columns, "ลบเมื่อ", "");
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    const saved = listRecurringExpenses_().filter(function (item) { return item.id === id; })[0];
    if (!saved) throw new Error("Recurring expense was not found after saving");
    return { recurringExpense: saved };
  } finally {
    lock.releaseLock();
  }
}

function softDeleteRecurringExpense_(id) {
  const expenseId = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(expenseId)) throw new Error("Recurring expense ID is invalid");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureRecurringExpensesSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, RECURRING_EXPENSE_HEADERS, "Recurring Expenses");
    const rowNumber = findInstallmentRow_(sheet, columns["Recurring Expense ID"], expenseId);
    if (rowNumber < 2) throw new Error("Recurring expense was not found");
    sheet.getRange(rowNumber, columns["ลบเมื่อ"] + 1).setValue(new Date());
    return { ok: true, id: expenseId, deleted: true };
  } finally {
    lock.releaseLock();
  }
}

function restoreRecurringExpense_(id) {
  const expenseId = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(expenseId)) throw new Error("Recurring expense ID is invalid");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureRecurringExpensesSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, RECURRING_EXPENSE_HEADERS, "Recurring Expenses");
    const rowNumber = findInstallmentRow_(sheet, columns["Recurring Expense ID"], expenseId);
    if (rowNumber < 2) throw new Error("Recurring expense was not found");
    sheet.getRange(rowNumber, columns["ลบเมื่อ"] + 1).clearContent();
    return { ok: true, id: expenseId, restored: true };
  } finally {
    lock.releaseLock();
  }
}

function recurringExpenseFromRow_(row, columns) {
  return {
    id: String(readCell_(row, columns, "Recurring Expense ID") || ""),
    name: String(readCell_(row, columns, "ชื่อรายการ") || ""),
    amount: Number(readCell_(row, columns, "จำนวนเงินต่อเดือน") || 0),
    category: String(readCell_(row, columns, "หมวดหมู่") || "อื่นๆ"),
    dueDay: Number(readCell_(row, columns, "วันที่ชำระ") || 1),
    // Google Sheets may coerce an ISO month such as "2026-10" into a date
    // serial. Normalize both strings and Date values back to yyyy-MM so the
    // client can include the expense in its monthly summary.
    startMonth: monthToIso_(readCell_(row, columns, "เดือนเริ่ม")),
    endMonth: monthToIso_(readCell_(row, columns, "เดือนสิ้นสุด")),
    note: String(readCell_(row, columns, "หมายเหตุ") || ""),
    createdAt: dateToIso_(readCell_(row, columns, "วันที่บันทึก")),
    deletedAt: dateToIso_(readCell_(row, columns, "ลบเมื่อ")),
  };
}

function ensureRecurringExpensesSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(TAB_RECURRING_EXPENSES);
  if (!sheet) sheet = spreadsheet.insertSheet(TAB_RECURRING_EXPENSES);
  ensureTableHeaders_(sheet, RECURRING_EXPENSE_HEADERS, "Recurring Expenses");
  return sheet;
}

function listAppCategories_() {
  const sheet = ensureAppCategoriesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const columns = columnIndexes_(headers, APP_CATEGORY_HEADERS, "App Categories");
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function (row) {
    return {
      scope: String(readCell_(row, columns, "ขอบเขต") || ""),
      name: String(readCell_(row, columns, "หมวดหมู่") || ""),
      createdAt: dateToIso_(readCell_(row, columns, "วันที่สร้าง")),
    };
  }).filter(function (category) {
    return Boolean(category.scope && category.name);
  });
}

function saveAppCategory_(input) {
  if (!input || typeof input !== "object") throw new Error("Category is required");
  const scope = String(input.scope || "");
  const name = String(input.name || "").trim();
  const allowedScopes = ["transactions", "recurringExpenses", "subscriptions"];
  if (allowedScopes.indexOf(scope) < 0 || !name || name.length > 40 || /^[=+\-@]/.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("Category data is invalid");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureAppCategoriesSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, APP_CATEGORY_HEADERS, "App Categories");
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const savedScope = String(readCell_(row, columns, "ขอบเขต") || "");
        const savedName = String(readCell_(row, columns, "หมวดหมู่") || "");
        if (savedScope === scope && savedName.toLocaleLowerCase() === name.toLocaleLowerCase()) {
          return {
            category: {
              scope: savedScope,
              name: savedName,
              createdAt: dateToIso_(readCell_(row, columns, "วันที่สร้าง")),
            },
          };
        }
      }
    }

    const row = new Array(headers.length).fill("");
    putCell_(row, columns, "ขอบเขต", scope);
    putCell_(row, columns, "หมวดหมู่", name);
    putCell_(row, columns, "วันที่สร้าง", new Date());
    const rowNumber = Math.max(sheet.getLastRow() + 1, 2);
    ensureSheetRowCapacity_(sheet, rowNumber);
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return { category: { scope: scope, name: name, createdAt: new Date().toISOString() } };
  } finally {
    lock.releaseLock();
  }
}

function ensureAppCategoriesSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(TAB_APP_CATEGORIES);
  if (!sheet) sheet = spreadsheet.insertSheet(TAB_APP_CATEGORIES);
  ensureTableHeaders_(sheet, APP_CATEGORY_HEADERS, "App Categories");
  return sheet;
}

function saveInstallment_(input) {
  if (!input || typeof input !== "object") throw new Error("Installment is required");
  const id = String(input.id || "").trim();
  const name = String(input.name || "").trim().slice(0, 120);
  const price = Number(input.price);
  const downPayment = Number(input.downPayment || 0);
  const interestRate = Number(input.interestRate || 0);
  const months = Number(input.months);
  const bank = String(input.bank || "");
  const startMonth = String(input.startMonth || "");
  const schedule = Array.isArray(input.schedule) ? input.schedule : [];
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || !name || !Number.isFinite(price) || price <= 0 || price > 100000000) {
    throw new Error("Installment data is invalid");
  }
  if (!Number.isFinite(downPayment) || downPayment < 0 || downPayment >= price) {
    throw new Error("Installment down payment is invalid");
  }
  if (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100 || !Number.isInteger(months) || months < 1 || months > 60) {
    throw new Error("Installment interest or term is invalid");
  }
  if (["กสิกรไทย", "SCB", "UOB", "สินเชื่อ"].indexOf(bank) < 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) || schedule.length !== months) {
    throw new Error("Installment bank, month or schedule is invalid");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheets = ensureInstallmentSheets_();
    const master = sheets.master;
    const payments = sheets.payments;
    const masterHeaders = master.getRange(1, 1, 1, master.getLastColumn()).getDisplayValues()[0];
    const masterColumns = columnIndexes_(masterHeaders, INSTALLMENT_HEADERS, "Installments");
    const existingRow = findInstallmentRow_(master, masterColumns["Installment ID"], id);
    const rowNumber = existingRow > 0 ? existingRow : Math.max(master.getLastRow() + 1, 2);
    ensureSheetRowCapacity_(master, rowNumber);
    const masterRow = existingRow > 0
      ? master.getRange(rowNumber, 1, 1, masterHeaders.length).getValues()[0]
      : new Array(masterHeaders.length).fill("");
    putCell_(masterRow, masterColumns, "Installment ID", id);
    putCell_(masterRow, masterColumns, "รายการสินค้า", name);
    putCell_(masterRow, masterColumns, "ราคาสินค้า", price);
    putCell_(masterRow, masterColumns, "เงินดาวน์", downPayment);
    putCell_(masterRow, masterColumns, "ดอกเบี้ยรวม (%)", interestRate);
    putCell_(masterRow, masterColumns, "จำนวนเดือน", months);
    putCell_(masterRow, masterColumns, "ธนาคาร", bank);
    putCell_(masterRow, masterColumns, "เดือนเริ่มชำระ", startMonth);
    const financedAmount = price - downPayment;
    putCell_(masterRow, masterColumns, "ยอดรวม", Number(input.totalAmount || (downPayment + financedAmount * (1 + interestRate / 100))));
    if (!existingRow) putCell_(masterRow, masterColumns, "วันที่บันทึก", new Date());
    master.getRange(rowNumber, 1, 1, masterRow.length).setValues([masterRow]);

    const paymentHeaders = payments.getRange(1, 1, 1, payments.getLastColumn()).getDisplayValues()[0];
    const paymentColumns = columnIndexes_(paymentHeaders, INSTALLMENT_PAYMENT_HEADERS, "Installment Payments");
    const existingPayments = readInstallmentPaymentRows_(payments, paymentColumns, id);
    schedule.forEach(function (payment, index) {
      const installmentNumber = Number(payment.installmentNumber || index + 1);
      const oldPayment = existingPayments[installmentNumber];
      const targetRow = oldPayment ? oldPayment.rowNumber : Math.max(payments.getLastRow() + 1, 2);
      ensureSheetRowCapacity_(payments, targetRow);
      const paymentRow = oldPayment
        ? payments.getRange(targetRow, 1, 1, paymentHeaders.length).getValues()[0]
        : new Array(paymentHeaders.length).fill("");
      const dueMonth = String(payment.month || "");
      const amount = Number(payment.amount);
      if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > months || !/^\d{4}-(0[1-9]|1[0-2])$/.test(dueMonth) || !Number.isFinite(amount) || amount < 0) {
        throw new Error("Installment payment row is invalid");
      }
      putCell_(paymentRow, paymentColumns, "Installment ID", id);
      putCell_(paymentRow, paymentColumns, "งวดที่", installmentNumber);
      putCell_(paymentRow, paymentColumns, "เดือนครบกำหนด", dueMonth);
      putCell_(paymentRow, paymentColumns, "จำนวนเงิน", amount);
      if (!oldPayment) {
        putCell_(paymentRow, paymentColumns, "ชำระแล้ว", false);
        putCell_(paymentRow, paymentColumns, "วันที่ชำระ", "");
      }
      payments.getRange(targetRow, 1, 1, paymentRow.length).setValues([paymentRow]);
    });
    const savedPlan = getInstallmentById_(id);
    return { installment: savedPlan };
  } finally {
    lock.releaseLock();
  }
}

function setInstallmentPayment_(id, installmentNumber, paid) {
  const planId = String(id || "").trim();
  const number = Number(installmentNumber);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(planId) || !Number.isInteger(number) || number < 1 || typeof paid !== "boolean") {
    throw new Error("Installment payment request is invalid");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const spreadsheet = getSpreadsheet_();
    const paymentSheet = spreadsheet.getSheetByName(TAB_INSTALLMENT_PAYMENTS);
    if (!paymentSheet) throw new Error("Installment payment sheet was not found");
    validateTableHeaders_(paymentSheet, INSTALLMENT_PAYMENT_HEADERS, "Installment Payments");
    const headers = paymentSheet.getRange(1, 1, 1, paymentSheet.getLastColumn()).getDisplayValues()[0];
    const columns = columnIndexes_(headers, INSTALLMENT_PAYMENT_HEADERS, "Installment Payments");
    const payment = readInstallmentPaymentRows_(paymentSheet, columns, planId)[number];
    if (!payment) throw new Error("Installment payment was not found");
    paymentSheet.getRange(payment.rowNumber, columns["ชำระแล้ว"] + 1).setValue(paid);
    paymentSheet.getRange(payment.rowNumber, columns["วันที่ชำระ"] + 1).setValue(paid ? new Date() : "");
    return { installment: getInstallmentById_(planId) };
  } finally {
    lock.releaseLock();
  }
}

function getInstallmentById_(id) {
  const plans = listInstallments_();
  const plan = plans.filter(function (item) { return item.id === id; })[0];
  if (!plan) throw new Error("Installment was not found after saving");
  return plan;
}

function installmentFromRow_(row, columns, schedule) {
  const price = Number(readCell_(row, columns, "ราคาสินค้า") || 0);
  const downPayment = Number(readCell_(row, columns, "เงินดาวน์") || 0);
  const financedAmount = Math.max(0, price - downPayment);
  const interestRate = Number(readCell_(row, columns, "ดอกเบี้ยรวม (%)") || 0);
  const months = Number(readCell_(row, columns, "จำนวนเดือน") || 0);
  const installmentTotal = Math.round(financedAmount * (1 + interestRate / 100) * 100) / 100;
  const totalAmount = downPayment + installmentTotal;
  return {
    id: String(readCell_(row, columns, "Installment ID") || ""),
    name: String(readCell_(row, columns, "รายการสินค้า") || ""),
    price: price,
    downPayment: downPayment,
    financedAmount: financedAmount,
    interestRate: interestRate,
    interestAmount: Math.round((installmentTotal - financedAmount) * 100) / 100,
    installmentTotal: installmentTotal,
    months: months,
    bank: String(readCell_(row, columns, "ธนาคาร") || ""),
    startMonth: monthToIso_(readCell_(row, columns, "เดือนเริ่มชำระ")),
    totalAmount: Number(readCell_(row, columns, "ยอดรวม") || totalAmount),
    createdAt: dateToIso_(readCell_(row, columns, "วันที่บันทึก")),
    deletedAt: dateToIso_(readCell_(row, columns, "ลบเมื่อ")),
    schedule: schedule.sort(function (left, right) { return left.installmentNumber - right.installmentNumber; }),
  };
}

function ensureInstallmentSheets_() {
  const spreadsheet = getSpreadsheet_();
  let master = spreadsheet.getSheetByName(TAB_INSTALLMENTS);
  let payments = spreadsheet.getSheetByName(TAB_INSTALLMENT_PAYMENTS);
  if (!master) master = spreadsheet.insertSheet(TAB_INSTALLMENTS);
  if (!payments) payments = spreadsheet.insertSheet(TAB_INSTALLMENT_PAYMENTS);
  ensureTableHeaders_(master, INSTALLMENT_HEADERS, "Installments");
  ensureTableHeaders_(payments, INSTALLMENT_PAYMENT_HEADERS, "Installment Payments");
  return { master: master, payments: payments };
}

function ensureTableHeaders_(sheet, expectedHeaders, label) {
  if (sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    sheet.setFrozenRows(1);
    return;
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const missing = expectedHeaders.filter(function (header) { return headers.indexOf(header) < 0; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    sheet.setFrozenRows(1);
  }
}

function validateTableHeaders_(sheet, expectedHeaders, label) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const missing = expectedHeaders.filter(function (header) { return headers.indexOf(header) < 0; });
  if (missing.length) throw new Error(label + " headers do not match the expected schema");
}

function columnIndexes_(headers, expectedHeaders, label) {
  const columns = {};
  expectedHeaders.forEach(function (header) {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error(label + " headers do not match the expected schema");
    columns[header] = index;
  });
  return columns;
}

function findInstallmentRow_(sheet, idColumn, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, idColumn + 1, lastRow - 1, 1).getDisplayValues();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0]) === id) return index + 2;
  }
  return -1;
}

function readInstallmentPaymentRows_(sheet, columns, id) {
  const found = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return found;
  const width = sheet.getLastColumn();
  const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  rows.forEach(function (row, index) {
    if (String(readCell_(row, columns, "Installment ID") || "") !== id) return;
    const number = Number(readCell_(row, columns, "งวดที่") || 0);
    if (number > 0) found[number] = { rowNumber: index + 2, row: row };
  });
  return found;
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

function restoreTransaction_(id) {
  const transactionId = String(id || "").trim();
  if (!transactionId || transactionId.length > 80) throw new Error("Transaction ID is invalid");
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
    if (String(statusCell.getValue() || "").trim() === "ลบแล้ว") {
      const savedStatus = String(sheet.getRange(rowNumber, previousStatusColumn + 1).getValue() || "").trim();
      statusCell.setValue(RESTORABLE_STATUSES.indexOf(savedStatus) >= 0 ? savedStatus : "ยืนยันแล้ว");
      sheet.getRange(rowNumber, previousStatusColumn + 1).clearContent();
    }
    return { ok: true, id: transactionId, restored: true };
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
