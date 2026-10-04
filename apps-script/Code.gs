const TAB_TRANSACTIONS = "Transactions";
const TAB_INSTALLMENTS = "Installments";
const TAB_INSTALLMENT_PAYMENTS = "Installment Payments";
const TAB_SUBSCRIPTIONS = "Subscriptions";
const INSTALLMENT_HEADERS = ["Installment ID", "รายการสินค้า", "ราคาสินค้า", "เงินดาวน์", "ดอกเบี้ยรวม (%)", "จำนวนเดือน", "ธนาคาร", "เดือนเริ่มชำระ", "ยอดรวม", "วันที่บันทึก", "ลบเมื่อ"];
const INSTALLMENT_PAYMENT_HEADERS = ["Installment ID", "งวดที่", "เดือนครบกำหนด", "จำนวนเงิน", "ชำระแล้ว", "วันที่ชำระ"];
const SUBSCRIPTION_HEADERS = ["Subscription ID", "ชื่อบริการ", "จำนวนเงิน", "รอบเรียกเก็บ", "วันเรียกเก็บครั้งถัดไป", "หมวดหมู่", "ช่องทางชำระ", "หมายเหตุ", "วันที่บันทึก", "ลบเมื่อ"];
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
      case "listInstallments":
        data = { installments: listInstallments_() };
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
      case "listSubscriptions":
        data = { subscriptions: listSubscriptions_() };
        break;
      case "saveSubscription":
        data = saveSubscription_(request.subscription);
        break;
      case "softDeleteSubscription":
        data = softDeleteSubscription_(request.id);
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
