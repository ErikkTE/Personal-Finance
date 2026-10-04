async function requestJson(path, options = {}) {
  const { headers: extraHeaders = {}, allowMissing = false, ...fetchOptions } = options;
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...fetchOptions,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (allowMissing && (response.status === 404 || contentType.includes("text/html"))) return null;
    throw new Error("เซิร์ฟเวอร์ส่งข้อมูลกลับมาไม่ถูกต้อง");
  }

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "คำขอไม่สำเร็จ");
  return result;
}

export async function checkSession() {
  return requestJson("/api/auth/session", { allowMissing: true });
}

export async function signIn(password) {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function signOut() {
  return requestJson("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function getGoogleStatus() {
  const result = await requestJson("/api/google/status");
  if (!result?.connected) throw new Error("ยังตรวจสอบการเชื่อมต่อ Google ไม่สำเร็จ");
  return result;
}

export async function listTransactions() {
  const result = await requestJson("/api/transactions");
  if (!Array.isArray(result?.transactions)) throw new Error("รูปแบบข้อมูลจาก Google Sheets ไม่ถูกต้อง");
  return result.transactions;
}

export async function getEvidencePreview(transactionId, signal) {
  const response = await fetch(`/api/evidence?id=${encodeURIComponent(transactionId)}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { Accept: "image/*, application/pdf" },
  });
  if (!response.ok) {
    let message = "เปิดภาพหลักฐานไม่สำเร็จ";
    try {
      const result = await response.json();
      message = result.error || message;
    } catch { /* Keep the short fallback message for non-JSON errors. */ }
    throw new Error(message);
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/") && blob.type !== "application/pdf") {
    throw new Error("ไฟล์นี้ไม่สามารถแสดงตัวอย่างได้");
  }
  return { url: URL.createObjectURL(blob), mimeType: blob.type };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์หลักฐานไม่สำเร็จ"));
    reader.onload = () => {
      const value = String(reader.result || "");
      const separator = value.indexOf(",");
      resolve(separator >= 0 ? value.slice(separator + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

export async function saveTransaction(transaction, file) {
  let evidence = null;
  if (file) {
    if (file.size > 3 * 1024 * 1024) throw new Error("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 3 MB");
    evidence = {
      fileName: file.name,
      mimeType: file.type,
      base64: await fileToBase64(file),
    };
  }

  const result = await requestJson("/api/transactions", {
    method: "POST",
    body: JSON.stringify({ transaction, evidence }),
  });
  if (!result?.transaction) throw new Error("Google Sheets ไม่ได้ยืนยันการบันทึกรายการ");
  return result.transaction;
}

export async function removeTransaction(id) {
  return requestJson("/api/transactions", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export async function restoreHiddenTransactions(budgetMonth) {
  const result = await requestJson("/api/transactions", {
    method: "PATCH",
    body: JSON.stringify({ budgetMonth }),
  });
  if (!Array.isArray(result?.transactions) || !Number.isInteger(result?.restoredCount)) {
    throw new Error("เซิร์ฟเวอร์ยืนยันการคืนรายการไม่สำเร็จ");
  }
  return result;
}

export async function listInstallments() {
  const result = await requestJson("/api/installments");
  if (!Array.isArray(result?.installments)) throw new Error("รูปแบบข้อมูลผ่อนชำระจาก Google Sheets ไม่ถูกต้อง");
  return result.installments;
}

export async function saveInstallment(plan) {
  const result = await requestJson("/api/installments", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
  if (!result?.installment) throw new Error("Google Sheets ไม่ได้ยืนยันการบันทึกแผนผ่อน");
  return result.installment;
}

export async function setInstallmentPayment({ id, installmentNumber, paid }) {
  const result = await requestJson("/api/installments", {
    method: "PATCH",
    body: JSON.stringify({ id, installmentNumber, paid }),
  });
  if (!result?.installment) throw new Error("Google Sheets ไม่ได้ยืนยันสถานะการชำระ");
  return result.installment;
}

export async function removeInstallment(id) {
  return requestJson("/api/installments", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export async function listSubscriptions() {
  const result = await requestJson("/api/subscriptions");
  if (!Array.isArray(result?.subscriptions)) throw new Error("รูปแบบข้อมูลสมัครบริการจาก Google Sheets ไม่ถูกต้อง");
  return result.subscriptions;
}

export async function saveSubscription(subscription) {
  const result = await requestJson("/api/subscriptions", {
    method: "POST",
    body: JSON.stringify({ subscription }),
  });
  if (!result?.subscription) throw new Error("Google Sheets ไม่ได้ยืนยันการบันทึกรายการสมัครบริการ");
  return result.subscription;
}

export async function removeSubscription(id) {
  return requestJson("/api/subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}
