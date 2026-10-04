Warning: truncated output (original token count: 21865)
Total output lines: 1297

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  categoryOptions,
  channelOptions,
  createDraftFromFile,
  deriveBudgetMonth,
  formatDate,
  formatNumber,
  getCurrentMonthValue,
  getMonthOptions,
  getMonthLabel,
  getSummary,
  initialTransactions,
} from "./data";
import {
  addMonths,
  calculateInstallmentAmounts,
  currentInstallmentMonth,
  installmentBanks,
  installmentMonthLabel,
  nextInstallmentMonth,
  prepareInstallmentPlan,
  summarizeInstallments,
} from "./installments";
import {
  checkSession,
  getGoogleStatus,
  listTransactions,
  removeTransaction as removeGoogleTransaction,
  restoreHiddenTransactions as restoreGoogleHiddenTransactions,
  getEvidencePreview,
  listInstallments as listGoogleInstallments,
  saveInstallment as saveGoogleInstallment,
  setInstallmentPayment as setGoogleInstallmentPayment,
  saveTransaction as saveGoogleTransaction,
  signIn,
  signOut,
} from "./api";
import { readReceipt } from "./receipt-ocr";

const navItems = [
  { key: "overview", label: "ภาพรวม", icon: "grid" },
  { key: "upload", label: "อัปโหลดสลิป", icon: "upload" },
  { key: "history", label: "ประวัติรายการ", icon: "list" },
  { key: "installments", label: "ผ่อนสินค้า", icon: "card" },
  { key: "coach", label: "คำแนะนำ AI", icon: "sparkles" },
];

function loadSavedInstallments() {
  try {
    const saved = window.localStorage.getItem("personal-finance-installments");
    return saved ? JSON.parse(saved).map(prepareInstallmentPlan) : [];
  } catch {
    return [];
  }
}

function loadSavedTransactions() {
  try {
    const saved = window.localStorage.getItem("personal-finance-transactions");
    return saved ? JSON.parse(saved) : initialTransactions;
  } catch {
    return initialTransactions;
  }
}

function ocrProgressLabel(status) {
  if (status === "loading tesseract core") return "กำลังเตรียมระบบอ่านข้อความ";
  if (status === "loading language traineddata") return "กำลังโหลดชุดภาษาไทยและอังกฤษ";
  if (status === "initializing api") return "กำลังเริ่มระบบ OCR";
  if (status === "preparing receipt image") return "กำลังปรับภาพในอุปกรณ์";
  if (status === "reading receipt QR") return "กำลังอ่าน QR ในอุปกรณ์";
  if (status === "recognizing date region") return "กำลังอ่านบริเวณวันที่";
  if (status === "recognizing amount region") return "กำลังอ่านบริเวณจำนวนเงิน";
  if (status === "recognizing text") return "กำลังอ่านข้อความจากรูป";
  return "กำลังเตรียมอ่านสลิป";
}

function App() {
  const [activeView, setActiveView] = useState("overview");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [transactions, setTransactions] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [installmentMonth, setInstallmentMonth] = useState(currentInstallmentMonth);
  const [installmentSync, setInstallmentSync] = useState({ ready: false, error: "กำลังตรวจการเชื่อมต่อ" });
  const [savingInstallment, setSavingInstallment] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState("");
  const [hiddenTransactions, setHiddenTransactions] = useState([]);
  const [draft, setDraft] = useState(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [runtime, setRuntime] = useState({ status: "checking", mode: null });
  const [connection, setConnection] = useState({ mode: "local", state: "demo" });
  const [showSettings, setShowSettings] = useState(false);
  const [loginError, setLoginError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    const previewUrl = draft?.previewUrl;
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [draft?.previewUrl]);

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        const session = await checkSession();
        if (!active) return;

        if (!session) {
          enterDemoMode();
          return;
        }

        if (session.partiallyConfigured) {
          setRuntime({ status: "setup", mode: null });
          return;
        }

        if (!session.configured) {
          enterDemoMode();
          return;
        }

        if (!session.authenticated) {
          setRuntime({ status: "login", mode: "google" });
          return;
        }

        await loadGoogleWorkspace();
      } catch (error) {
        if (!active) return;
        setConnection({ mode: "google", state: "error", message: error.message });
        setRuntime({ status: "error", mode: "google" });
      }
    }

    function enterDemoMode() {
      setTransactions(loadSavedTransactions());
      setInstallments(loadSavedInstallments());
      setInstallmentSync({ ready: false, error: "โหมดทดลองบันทึกข้อมูลเฉพาะอุปกรณ์นี้" });
      setHiddenTransactions([]);
      setConnection({ mode: "local", state: "demo" });
      setRuntime({ status: "ready", mode: "local" });
    }

    start();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (runtime.status === "ready" && runtime.mode === "local") {
      try {
        window.localStorage.setItem("personal-finance-transactions", JSON.stringify(transactions));
      } catch {
        setToast("พื้นที่เก็บข้อมูลในเครื่องเต็ม หรือเบราว์เซอร์ไม่อนุญาตให้บันทึก");
      }
    }
  }, [transactions, runtime.status, runtime.mode]);

  useEffect(() => {
    if (runtime.status === "ready" && runtime.mode === "local") {
      try {
        window.localStorage.setItem("personal-finance-installments", JSON.stringify(installments));
      } catch {
        setToast("พื้นที่เก็บข้อมูลแผนผ่อนในอุปกรณ์นี้เต็ม");
      }
    }
  }, [installments, runtime.status, runtime.mode]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const summary = useMemo(() => getSummary(transactions, selectedMonth), [transactions, selectedMonth]);
  const monthChoices = useMemo(
    () => getMonthOptions(transactions, draft?.budgetMonth ? [draft.budgetMonth] : []),
    [transactions, draft?.budgetMonth]
  );
  const transactionNameOptions = useMemo(() => {
    const usage = new Map();
    for (const transaction of [...transactions, ...hiddenTransactions]) {
      const name = String(transaction.name || "").trim();
      if (!name) continue;
      const entry = usage.get(name) || { name, count: 0, latestDate: "" };
      entry.count += 1;
      if (transaction.date > entry.latestDate) entry.latestDate = transaction.date;
      usage.set(name, entry);
    }
    return [...usage.values()]
      .sort((left, right) => right.count - left.count || right.latestDate.localeCompare(left.latestDate) || left.name.localeCompare(right.name, "th"))
      .map((item) => item.name);
  }, [transactions, hiddenTransactions]);

  async function loadGoogleWorkspace() {
    setRuntime({ status: "syncing", mode: "google" });
    const [health, remoteTransactions] = await Promise.all([getGoogleStatus(), listTransactions()]);
    setTransactions(remoteTransactions.filter((item) => item.status !== "ลบแล้ว"));
    setHiddenTransactions(remoteTransactions.filter((item) => item.status === "ลบแล้ว"));
    try {
      const remoteInstallments = await listGoogleInstallments();
      setInstallments(remoteInstallments.map(prepareInstallmentPlan));
      setInstallmentSync({ ready: true, error: "" });
    } catch (error) {
      setInstallments([]);
      setInstallmentSync({ ready: false, error: error.message || "Apps Script ยังไม่รองรับข้อมูลผ่อนชำระ" });
    }
    setConnection({ mode: "google", state: "connected", ...health });
    setRuntime({ status: "ready", mode: "google" });
  }

  async function handleLogin(password) {
    setLoginError("");
    try {
      await signIn(password);
    } catch (error) {
      setLoginError(error.message || "เข้าสู่ระบบไม่สำเร็จ");
      setRuntime({ status: "login", mode: "google" });
      return;
    }
    try {
      await loadGoogleWorkspace();
    } catch (error) {
      setConnection({ mode: "google", state: "error", message: error.message });
      setRuntime({ status: "error", mode: "google" });
    }
  }

  async function handleLogout() {
    try { await signOut(); } catch { /* The local session still returns to the sign-in screen. */ }
    setTransactions([]);
    setHiddenTransactions([]);
    setInstallments([]);
    setInstallmentSync({ ready: false, error: "กรุณาเข้าสู่ระบบเพื่อโหลดข้อมูลผ่อนชำระ" });
    setShowSettings(false);
    setConnection({ mode: "google", state: "locked" });
    setRuntime({ status: "login", mode: "google" });
  }

  async function retryGoogleConnection() {
    try {
      await loadGoogleWorkspace();
    } catch (error) {
      setConnection({ mode: "google", state: "error", message: error.message });
      setRuntime({ status: "error", mode: "google" });
    }
  }

  async function retryInstallmentSync() {
    if (runtime.mode !== "google") return;
    setInstallmentSync({ ready: false, error: "กำลังโหลดจาก Google Sheets" });
    try {
      const remoteInstallments = await listGoogleInstallments();
      setInstallments(remoteInstallments.map(prepareInstallmentPlan));
      setInstallmentSync({ ready: true, error: "" });
    } catch (error) {
      setInstallmentSync({ ready: false, error: error.message || "Apps Script ยังไม่รองรับข้อมูลผ่อนชำระ" });
    }
  }

  async function createInstallment(input) {
    if (runtime.mode === "google" && !installmentSync.ready) {
      setToast("ยังบันทึกข้ามอุปกรณ์ไม่ได้ กรุณาอัปเดต Apps Script ให้รองรับข้อมูลผ่อนก่อน");
      return false;
    }
    const plan = prepareInstallmentPlan(input);
    setSavingInstallment(true);
    try {
      const saved = runtime.mode === "google" ? await saveGoogleInstallment(plan) : plan;
      const normalized = prepareInstallmentPlan(saved);
      setInstallments((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)]);
      setToast(runtime.mode === "google" ? "บันทึกแผนผ่อนและตารางงวดไป Google Sheets แล้ว" : "บันทึกแผนผ่อนไว้ในอุปกรณ์นี้แล้ว");
      return true;
    } catch (error) {
      setToast(error.message || "บันทึกแผนผ่อนไม่สำเร็จ");
      return false;
    } finally {
      setSavingInstallment(false);
    }
  }

  async function toggleInstallmentPayment(planId, installmentNumber, paid) {
    const key = `${planId}:${installmentNumber}`;
    if (updatingPayment) return;
    if (runtime.mode === "google" && !installmentSync.ready) {
      setToast("ยังเปลี่ยนสถานะชำระไม่ได้ กรุณาอัปเดต Apps Script ก่อน");
      return;
    }
    const originalPlans = installments;
    setUpdatingPayment(key);
    setInstallments((current) => current.map((plan) => plan.id !== planId ? plan : {
      ...plan,
      schedule: plan.schedule.map((payment) => payment.installmentNumber !== installmentNumber ? payment : {
        ...payment,
        paid,
        paidAt: paid ? new Date().toISOString() : "",
      }),
    }));
    try {
      if (runtime.mode === "google") {
        const saved = await setGoogleInstallmentPayment({ id: planId, installmentNumber, paid });
        setInstallments((current) => current.map((plan) => plan.id === planId ? prepareInstallmentPlan(saved) : plan));
      }
      setToast(paid ? "ทำเครื่องหมายว่าชำระงวดนี้แล้ว" : "ยกเลิกสถานะชำระของงวดนี้แล้ว");
    } catch (error) {
      setInstallments(originalPlans);
      setToast(error.message || "อัปเดตสถานะชำระไม่สำเร็จ");
    } finally {
      setUpdatingPayment("");
    }
  }

  function openUpload() {
    fileInputRef.current?.click();
  }

  function openTransaction(transaction) {
    const isPending = transaction.status === "รอตรวจสอบ";
    setDraft({
      ...transaction,
      fileName: transaction.evidenceName || transaction.fileName || "",
      transactionId: transaction.id,
      isPending,
      isExisting: !isPending,
    });
  }

  function handleFiles(fileList) {
    const selectedFile = fileList?.[0];
    if (!selectedFile) return;
    if (selectedFile.size > 3 * 1024 * 1024) {
      setToast("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 3 MB");
      return;
    }
    const fileMimeByExtension = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
      heic: "image/heic", heif: "image/heif", pdf: "application/pdf",
    };
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    const mimeType = fileMimeByExtension[extension] || selectedFile.type;
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"].includes(mimeType)) {
      setToast("รองรับเฉพาะ JPG, PNG, WebP, HEIC, HEIF และ PDF");
      return;
    }
    const file = selectedFile.type === mimeType ? selectedFile : new File([selectedFile], selectedFile.name, { type: mimeType, lastModified: selectedFile.lastModified });
    const nextDraft = {
      ...createDraftFromFile(file),
      sourceFile: file,
      ocrStatus: file.type.startsWith("image/") ? "reading" : "unsupported",
      ocrProgress: 0,
      ocrPhase: "",
      ocrText: "",
      ocrFieldsRead: 0,
      ocrMissingFields: [],
      ocrAmountCandidates: [],
      qrDetected: false,
      qrAmount: null,
      ocrQrAmountMismatch: false,
    };
    setDraft(nextDraft);
    if (!file.type.startsWith("image/")) return;

    readReceipt(file, ({ status, progress }) => {
      setDraft((current) => current?.sourceFile === file
        ? { ...current, ocrProgress: progress, ocrPhase: status }
        : current);
    }).then((result) => {
      setDraft((current) => {
        if (current?.sourceFile !== file) return current;
        const date = result.date || current.date;
        const category = result.category || current.category;
        const fieldsRead = result.fieldsRead || 0;
        return {
          ...current,
          date,
          budgetMonth: deriveBudgetMonth(date, category),
          name: result.name || current.name,
          amount: result.amount ? String(result.amount) : current.amount,
          category,
          channel: result.channel || current.channel,
          ocrStatus: result.text ? (fieldsRead ? "done" : "unrecognized") : "empty",
          ocrProgress: 100,
          ocrPhase: "recognizing text",
          ocrText: result.text,
          ocrFieldsRead: fieldsRead,
          ocrMissingFields: result.fieldsMissing || [],
          ocrAmountCandidates: result.ocrAmountCandidates || [],
          qrDetected: Boolean(result.qrDetected),
          qrAmount: result.qrAmount ?? null,
          ocrQrAmountMismatch: Boolean(result.qrAmountMismatch),
        };
      });
    }).catch(() => {
      setDraft((current) => current?.sourceFile === file
        ? { ...current, ocrStatus: "failed", ocrPhase: "", ocrProgress: 0 }
        : current);
    });
  }

  function attachPendingEvidence(selectedFile) {
    if (!selectedFile) return;
    if (selectedFile.size > 3 * 1024 * 1024) {
      setToast("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 3 MB");
      return;
    }
    const fileMimeByExtension = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
      heic: "image/heic", heif: "image/heif", pdf: "application/pdf",
    };
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    const mimeType = fileMimeByExtension[extension] || selectedFile.type;
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"].includes(mimeType)) {
      setToast("รองรับเฉพาะ JPG, PNG, WebP, HEIC, HEIF และ PDF");
      return;
    }
    const file = selectedFile.type === mimeType ? selectedFile : new File([selectedFile], selectedFile.name, { type: mimeType, lastModified: selectedFile.lastModified });
    setDraft((current) => current?.isPending ? {
      ...current,
      sourceFile: file,
      fileName: file.name,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    } : current);
  }

  function updateDraft(field, value) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if (field === "date" || field === "category") {
        next.budgetMonth = deriveBudgetMonth(next.date, next.category);
      }
      return next;
    });
  }

  function closeDraft() {
    setDraft(null);
  }

  async function confirmDraft() {
    if (draft?.ocrStatus === "reading") {
      setToast("รอให้ระบบอ่านข้อความจากสลิปก่อน แล้วตรวจข้อมูลอีกครั้งครับ");
      return;
    }
    const amount = Number(String(draft?.amount ?? "").replaceAll(",", ""));
    if (!draft?.date) {
      setToast("กรุณาระบุวันที่จากสลิปก่อนยืนยันรายการ");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || !String(draft.name || "").trim()) {
      setToast("กรุณาตรวจสอบจำนวนเงินและชื่อรายการก่อนยืนยัน");
      return;
    }

    const transactionId = draft.transactionId || globalThis.crypto?.randomUUID?.() || `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!draft.transactionId) {
      setDraft((current) => current ? { ...current, transactionId } : current);
    }

    const newTransaction = {
      id: transactionId,
      date: draft.date,
      budgetMonth: draft.budgetMonth,
      type: draft.type || "expense",
      category: draft.category,
      name: draft.name.trim(),
      amount,
      channel: draft.channel || "อื่นๆ",
      nature: draft.nature || "ครั้งเดียว",
      status: "ยืนยันแล้ว",
      evidenceName: draft.fileName || draft.evidenceName || "",
      evidenceUrl: draft.evidenceUrl || "",
      note: draft.note || "",
    };

    setSaving(true);
    try {
      const saved = runtime.mode === "google"
        ? await saveGoogleTransaction(newTransaction, draft.sourceFile)
        : newTransaction;
      setTransactions((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedMonth(saved.budgetMonth);
      closeDraft();
      setActiveView("overview");
      setToast(runtime.mode === "google" ? "บันทึกรายการและหลักฐานไปยัง Google แล้ว" : "บันทึกรายการทดลองไว้ในเครื่องแล้ว");
    } catch (error) {
      setToast(error.message || "บันทึกรายการไม่สำเร็จ ลองอีกครั้งได้ครับ");
    } finally {
      setSaving(false);
    }
  }

  async function removeTransaction(id) {
    try {
      if (runtime.mode === "google") await removeGoogleTransaction(id);
      const hiddenItem = transactions.find((item) => item.id === id);
      setTransactions((current) => current.filter((item) => item.id !== id));
      if (runtime.mode === "google" && hiddenItem) {
        setHiddenTransactions((current) => [
          { ...hiddenItem, status: "ลบแล้ว" },
          ...current.filter((item) => item.id !== id),
        ]);
      }
      setToast(runtime.mode === "google" ? "ซ่อนรายการจากแอปแล้ว โดยเก็บแถวไว้ในชีต" : "ลบรายการทดลองออกจากเครื่องแล้ว");
    } catch (error) {
      setToast(error.message || "ลบรายการไม่สำเร็จ");
    }
  }

  async function restoreHiddenForMonth(budgetMonth) {
    if (runtime.mode !== "google") {
      setToast("การคืนรายการที่ซ่อนใช้ได้เมื่อเชื่อมต่อ Google Sheets");
      return;
    }

    try {
      const result = await restoreGoogleHiddenTransactions(budgetMonth);
      const refreshedTransactions = result.transactions || [];
      setTransactions(refreshedTransactions.filter((item) => item.status !== "ลบแล้ว"));
      setHiddenTransactions(refreshedTransactions.filter((item) => item.status === "ลบแล้ว"));
      setToast(result.restoredCount
        ? `คืนรายการที่ซ่อน ${result.restoredCount} รายการแล้ว`
        : "เดือนนี้ไม่มีรายการที่ซ่อนอยู่");
    } catch (error) {
      setToast(error.message || "คืนรายการที่ซ่อนไม่สำเร็จ");
    }
  }

  if (runtime.status === "checking" || runtime.status === "syncing") {
    return <RuntimeScreen title="กำลังเตรียมแอป" detail={runtime.status === "syncing" ? "กำลังโหลดข้อมูลจาก Google Sheets" : "กำลังตรวจสถานะการเชื่อมต่อ"} />;
  }
  if (runtime.status === "setup") {
    return <RuntimeScreen title="ตั้งค่าการเชื่อมต่อยังไม่ครบ" detail="ตรวจค่า APP_PASSWORD, SESSION_SECRET และ Google Apps Script ใน Vercel Environment Variables แล้ว deploy ใหม่" />;
  }
  if (runtime.status === "login") {
    return <LoginScreen error={loginError} onSubmit={handleLogin} />;
  }
  if (runtime.status === "error") {
    return <RuntimeScreen title="เชื่อมต่อ Google ไม่สำเร็จ" detail="ตรวจการตั้งค่า Apps Script และ Vercel แล้วลองเชื่อมต่ออีกครั้ง" actionLabel="ลองอีกครั้ง" onAction={retryGoogleConnection} />;
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} connection={connection} onNavigate={setActiveView} onSettings={() => setShowSettings(true)} />
      <div className="main-area">
        <Topbar
          activeView={activeView}
          selectedMonth={selectedMonth}
          monthChoices={monthChoices}
          connect…9865 tokens truncated…)<input type="number" min="0.01" max="100000000" step="0.01" required placeholder="เช่น 25000" value={form.price} onChange={(event) => change("price", event.target.value)} /></label>
                <label>เงินดาวน์ (บาท)<input type="number" min="0" max={price > 0 ? Math.max(0, price - 0.01) : 0} step="0.01" required value={form.downPayment} onChange={(event) => change("downPayment", event.target.value)} /><small className="installment-field-hint">หักออกจากราคาก่อนคำนวณดอกเบี้ย</small></label>
              </div>
              <div className="form-two-col">
                <label>ดอกเบี้ยรวมตลอดแผน (%)<input type="number" min="0" max="100" step="0.01" required value={form.interestRate} onChange={(event) => change("interestRate", event.target.value)} /><small className="installment-field-hint">เริ่มต้น 0% · คิดจากยอดหลังหักเงินดาวน์</small></label>
                <label>จำนวนเดือน<input type="number" min="1" max="60" step="1" required value={form.months} onChange={(event) => change("months", event.target.value)} /></label>
              </div>
              <div className="installment-start-month" aria-live="polite"><span className="installment-start-icon"><Icon name="calendar" size={16} /></span><span><small>เริ่มชำระงวดแรก</small><strong>{installmentMonthLabel(form.startMonth)}</strong></span></div>
              <fieldset className="installment-bank-picker">
                <legend>ธนาคาร / สินเชื่อ</legend>
                <div>{installmentBanks.map((bank) => <button key={bank.value} className={`installment-bank-choice ${form.bank === bank.value ? "selected" : ""}`} type="button" aria-pressed={form.bank === bank.value} onClick={() => change("bank", bank.value)}><span className={`installment-bank-mark bank-${bank.tone}`}>{bank.short}</span><span>{bank.label}</span><span className="bank-choice-check"><Icon name="check" size={13} /></span></button>)}</div>
              </fieldset>
            </div>
            <aside className="installment-live-preview" aria-live="polite">
              <span className="installment-preview-icon"><Icon name="chart" size={19} /></span>
              <small>ประมาณการยอดผ่อน</small>
              <strong>฿ {formatNumber(regularPayment)}<em> / เดือน</em></strong>
              <div><span>เงินดาวน์ (ชำระวันนี้)</span><b>฿ {formatNumber(amounts.downPayment)}</b></div>
              <div><span>ยอดหลังหักเงินดาวน์</span><b>฿ {formatNumber(amounts.financedAmount)}</b></div>
              <div><span>ดอกเบี้ยรวม</span><b>฿ {formatNumber(amounts.interestAmount)}</b></div>
              <div><span>ยอดผ่อนรวม</span><b>฿ {formatNumber(amounts.installmentTotal)}</b></div>
              <div className="preview-total"><span>รวมจ่ายทั้งหมด</span><b>฿ {formatNumber(amounts.totalAmount)}</b></div>
              <p>คิดดอกเบี้ยจากยอดคงเหลือหลังหักเงินดาวน์ แบ่งจ่ายรายเดือนและปรับเศษสตางค์ในงวดสุดท้าย</p>
            </aside>
          </div>
          <footer className="modal-footer">
            <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button className="primary-button" type="submit" disabled={saving || !form.name.trim() || !(price > 0) || downPayment < 0 || downPayment >= price || !(months > 0)}><Icon name={saving ? "clock" : "check"} size={16} />{saving ? "กำลังบันทึก…" : "บันทึกแผนผ่อน"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function CoachView({ summary, selectedMonth }) {
  const ratio = summary.debtRatio;
  const level = ratio >= 50 ? "ต้องเฝ้าระวัง" : ratio >= 35 ? "ควรวางแผนต่อเนื่อง" : "อยู่ในเกณฑ์ควบคุมได้";
  return (
    <div className="page-stack">
      <section className="page-intro"><div><h2>คำแนะนำ AI</h2><p>มุมมองเชิงปฏิบัติจากรายการของเดือน {getMonthLabel(selectedMonth)}</p></div><span className="beta-label"><Icon name="sparkles" size={15} />AI Coach</span></section>
      <section className="coach-hero"><div className="coach-orb"><Icon name="sparkles" size={28} /></div><div><span className="coach-kicker">สรุปสถานะการเงิน</span><h3>{level}</h3><p>ระบบเห็นว่าภาระบัตรเครดิตและหนี้สินอยู่ที่ {ratio}% ของรายรับในเดือนนี้</p></div><div className="coach-number"><strong>{ratio}%</strong><span>ภาระต่อรายรับ</span></div></section>
      <section className="coach-grid"><AdviceCard icon="wallet" title="รักษาเงินคงเหลือ" tone="green" text={`หลังหักภาระแล้ว คงเหลือ ฿ ${formatNumber(summary.balance)} ควรกันส่วนหนึ่งเป็นเงินสำรองก่อนเพิ่มค่าใช้จ่ายใหม่`} /><AdviceCard icon="card" title="รวมวันครบกำหนด" tone="blue" text="แนะนำให้บันทึกวันครบกำหนดของแต่ละเจ้าหนี้ เพื่อให้ระบบเตือนล่วงหน้าและเห็นยอดที่ต้องเตรียมได้แม่นขึ้น" /><AdviceCard icon="sparkles" title="อ่านข้อความจากสลิป" tone="amber" text="OCR อ่านข้อความจากรูปบนอุปกรณ์และเติมข้อมูลเบื้องต้นให้ตรวจสอบก่อนบันทึก ส่วนการวิเคราะห์ด้วย AI ยังไม่ได้เชื่อมต่อ" /></section>
      <section className="panel rules-panel"><div className="panel-header"><div><h3>กติกาที่ระบบใช้ตอนนี้</h3><span>ทำให้การจัดเดือนงบประมาณสอดคล้องกับวิธีใช้เงินจริง</span></div></div><div className="rule-list"><RuleItem title="เงินเดือนปลายเดือน" detail="รายรับวันที่ 25 เป็นต้นไป สามารถจัดสรรเป็นงบเดือนถัดไป" /><RuleItem title="ชำระหนี้หลังเงินเดือน" detail="รายการบัตรเครดิตและหนี้สินวันที่ 25 เป็นต้นไป จะเสนอเดือนถัดไป" /><RuleItem title="ตรวจสอบก่อนบันทึก" detail="รูปใหม่จะอยู่สถานะรอตรวจสอบ จนกว่าจะยืนยันรายการ" /></div></section>
    </div>
  );
}

function AdviceCard({ icon, title, text, tone }) {
  return <article className={`advice-card tone-${tone}`}><div className="advice-icon"><Icon name={icon} size={19} /></div><h3>{title}</h3><p>{text}</p></article>;
}

function RuleItem({ title, detail }) {
  return <div className="rule-item"><span className="rule-check"><Icon name="check" size={15} /></span><span><strong>{title}</strong><small>{detail}</small></span></div>;
}

function getDriveThumbnailUrl(evidenceUrl) {
  try {
    const url = new URL(evidenceUrl);
    if (!['drive.google.com', 'docs.google.com'].includes(url.hostname)) return '';
    const fileId = url.pathname.match(/\/d\/([-A-Za-z0-9_]+)/)?.[1] || url.searchParams.get('id');
    return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200` : '';
  } catch {
    return '';
  }
}

function SavedEvidencePreview({ transactionId, evidenceUrl }) {
  const [preview, setPreview] = useState({ state: "loading", url: "", mimeType: "" });

  useEffect(() => {
    const controller = new AbortController();
    let previewUrl = "";
    setPreview({ state: "loading", url: "", mimeType: "" });
    getEvidencePreview(transactionId, controller.signal)
      .then((result) => {
        previewUrl = result.url;
        setPreview({ state: "ready", url: result.url, mimeType: result.mimeType });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const thumbnailUrl = getDriveThumbnailUrl(evidenceUrl);
        setPreview(thumbnailUrl
          ? { state: "fallback", url: thumbnailUrl, mimeType: "image/*" }
          : { state: "failed", url: "", mimeType: "" });
      });

    return () => {
      controller.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [transactionId, evidenceUrl]);

  if (preview.state === "loading") {
    return <div className="preview-empty"><Icon name="image" size={27} /><span>กำลังโหลดภาพหลักฐานจาก Drive…</span></div>;
  }
  if (preview.state === "failed") {
    return <div className="preview-empty"><Icon name="image" size={27} /><span>แสดงภาพหลักฐานไม่ได้<br />กดเปิดไฟล์ใน Drive เพื่อตรวจสอบ</span></div>;
  }
  if (preview.mimeType === "application/pdf") {
    return <iframe className="evidence-pdf-preview" src={preview.url} title="หลักฐาน PDF ใน Google Drive" />;
  }
  return <img src={preview.url} alt="หลักฐานรายการจาก Google Drive" onError={() => setPreview((current) => ({ ...current, state: "failed", url: "" }))} />;
}

function ReviewModal({ draft, monthChoices, transactionNameOptions, saving, storageMode, onChange, onAttachEvidence, onClose, onConfirm }) {
  const isPending = Boolean(draft.isPending);
  const isExisting = Boolean(draft.isExisting) && !isPending;
  const isOcrProcessing = draft.ocrStatus === "reading";
  const fieldsDisabled = isExisting || isOcrProcessing;
  const imageSaveMessage = storageMode === "google"
    ? "รูปจะส่งไป Drive เมื่อกดยืนยันเท่านั้น"
    : "โหมดทดลองจะบันทึกเฉพาะข้อมูลในอุปกรณ์และไม่ส่งภาพไป Drive";
  const reviewMessage = draft.isDemoDetected
    ? "ระบบจำลองตรวจพบข้อมูลจากรูปตัวอย่าง โปรดตรวจสอบความถูกต้องก่อนยืนยัน"
    : draft.ocrStatus === "reading"
      ? `${ocrProgressLabel(draft.ocrPhase)}${draft.ocrProgress > 0 ? ` ${draft.ocrProgress}%` : "…"} ประมวลผลบนอุปกรณ์นี้ ${imageSaveMessage}`
      : draft.ocrStatus === "done"
        ? `OCR อ่านข้อมูลได้ ${draft.ocrFieldsRead} ช่อง${draft.ocrMissingFields?.length ? ` · อ่านไม่ชัดหรือผลไม่ตรงกัน: ${draft.ocrMissingFields.join(", ")}` : ""} ผล OCR ยังไม่ใช่การยืนยันจากธนาคาร โปรดตรวจสอบก่อนบันทึก ${imageSaveMessage}`
        : draft.ocrStatus === "empty" || draft.ocrStatus === "unrecognized"
          ? "อ่านข้อความได้ไม่พอสำหรับเติมข้อมูล ช่องที่อ่านไม่ได้กรุณากรอกเอง แล้วตรวจสอบก่อนบันทึก"
          : draft.ocrStatus === "unsupported"
            ? "OCR รองรับเฉพาะไฟล์รูปภาพในตอนนี้ ไฟล์ PDF กรุณากรอกข้อมูลเอง"
            : draft.ocrStatus === "failed"
              ? "OCR อ่านรูปนี้ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วกรอกข้อมูลเองได้เลย"
            : "เลือกรูปสลิปเพื่อให้ OCR อ่านข้อมูลเบื้องต้น";
  const qrReviewMessage = !draft.qrDetected
    ? ""
    : draft.ocrQrAmountMismatch
      ? `ยอด OCR (${(draft.ocrAmountCandidates || []).map((amount) => formatNumber(amount)).join(" / ")} บาท) ไม่ตรงกับยอดใน QR (${formatNumber(draft.qrAmount)} บาท) ระบบเว้นยอดไว้ให้ตรวจสอบเอง · QR นี้ยังไม่ได้ยืนยันกับธนาคาร`
      : draft.qrAmount != null
        ? `อ่าน QR ในอุปกรณ์ได้ พบยอด ${formatNumber(draft.qrAmount)} บาทในข้อมูล QR · ใช้ประกอบการตรวจเท่านั้น ยังไม่ได้ยืนยันกับธนาคาร`
        : "อ่านพบ QR ในอุปกรณ์แล้ว แต่ไม่ได้ตรวจสอบธุรกรรมกับธนาคาร";
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="modal-header"><div><span className="modal-kicker">{isPending ? "ดำเนินการบันทึกต่อ" : isExisting ? "รายละเอียดรายการ" : "ตรวจสอบข้อมูลจากสลิป"}</span><h2 id="review-title">{isExisting || isPending ? draft.name : "รายการใหม่จากหลักฐาน"}</h2></div><button className="icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><Icon name="close" size={21} /></button></div>
        <div className="review-body">
          <div className="receipt-preview">{draft.previewUrl ? <img src={draft.previewUrl} alt="ตัวอย่างหลักฐานที่อัปโหลด" /> : draft.evidenceUrl && draft.transactionId && storageMode === "google" ? <SavedEvidencePreview transactionId={draft.transactionId} evidenceUrl={draft.evidenceUrl} /> : <div className="preview-empty"><Icon name="image" size={27} /><span>{draft.fileName || "ไม่มีภาพตัวอย่าง"}</span></div>}{draft.evidenceUrl && <a className="evidence-link" href={draft.evidenceUrl} target="_blank" rel="noreferrer">เปิดหลักฐานใน Google Drive</a>}<span className="preview-status" aria-live="polite"><Icon name={draft.ocrStatus === "done" ? "check" : "info"} size={13} />{isExisting ? "หลักฐานของรายการนี้" : isOcrProcessing ? `${ocrProgressLabel(draft.ocrPhase)}${draft.ocrProgress > 0 ? ` ${draft.ocrProgress}%` : "…"}` : draft.ocrStatus === "done" ? "อ่านข้อความแล้ว · กรุณาตรวจสอบ" : draft.ocrStatus === "unsupported" ? "ไฟล์นี้ยังอ่านอัตโนมัติไม่ได้" : draft.ocrStatus === "failed" || draft.ocrStatus === "empty" || draft.ocrStatus === "unrecognized" ? "กรุณาตรวจหรือกรอกข้อมูลเอง" : "รอตรวจสอบข้อมูล"}</span></div>
          <div className="review-form">
            {!isExisting && <div className={`review-note review-note-${draft.ocrStatus || "idle"}`} data-state={draft.ocrStatus || "idle"} role="status" aria-live="polite"><Icon name={draft.ocrStatus === "done" ? "check" : "info"} size={16} /><span>{reviewMessage}{isOcrProcessing && <span className="ocr-progress" role="progressbar" aria-label="ความคืบหน้าการอ่านข้อความ" aria-valuemin="0" aria-valuemax="100" aria-valuenow={draft.ocrProgress}><span style={{ width: `${draft.ocrProgress}%` }} /></span>}</span></div>}
            {!isExisting && qrReviewMessage && <div className={`qr-review-note${draft.ocrQrAmountMismatch ? " qr-review-note-warning" : ""}`} role="status"><Icon name={draft.ocrQrAmountMismatch ? "info" : "check"} size={15} /><span>{qrReviewMessage}</span></div>}
            {isPending && <label>แนบไฟล์ใหม่ หากระบบหารูปเดิมใน Drive ไม่พบ<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" onChange={(event) => { onAttachEvidence(event.target.files?.[0]); event.target.value = ""; }} /></label>}
            <label>วันที่เกิดรายการ<input type="date" value={draft.date || ""} onChange={(event) => onChange("date", event.target.value)} disabled={fieldsDisabled} /></label>
            <label>รายการ
              <select value={draft.name && transactionNameOptions.includes(draft.name) ? draft.name : "__custom__"} onChange={(event) => onChange("name", event.target.value === "__custom__" ? "" : event.target.value)} disabled={fieldsDisabled}>
                <option value="__custom__">พิมพ์รายการใหม่…</option>
                {transactionNameOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              {(!draft.name || !transactionNameOptions.includes(draft.name)) && <input type="text" value={draft.name || ""} onChange={(event) => onChange("name", event.target.value)} placeholder="พิมพ์ชื่อรายการ" disabled={fieldsDisabled} />}
            </label>
            <label>จำนวนเงิน (บาท)<input type="number" min="0" step="0.01" value={draft.amount ?? ""} onChange={(event) => onChange("amount", event.target.value)} disabled={fieldsDisabled} /></label>
            <div className="form-two-col"><label>หมวดหมู่<select value={draft.category || "อื่นๆ"} onChange={(event) => onChange("category", event.target.value)} disabled={fieldsDisabled}>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label>ช่องทางจ่าย<select value={draft.channel || "อื่นๆ"} onChange={(event) => onChange("channel", event.target.value)} disabled={fieldsDisabled}>{channelOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            <label>เดือนงบประมาณ<select value={draft.budgetMonth || getCurrentMonthValue()} onChange={(event) => onChange("budgetMonth", event.target.value)} disabled={fieldsDisabled}>{monthChoices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label>หมายเหตุ<textarea rows="2" value={draft.note || ""} onChange={(event) => onChange("note", event.target.value)} disabled={fieldsDisabled} /></label>
            {draft.ocrText && <details className="ocr-text-details"><summary>ดูข้อความที่ OCR อ่านได้</summary><pre>{draft.ocrText}</pre></details>}
          </div>
        </div>
        <div className="modal-footer"><button className="secondary-button" onClick={onClose} disabled={saving}>{isExisting ? "ปิด" : "ยกเลิก"}</button>{!isExisting && <button className="primary-button" onClick={onConfirm} disabled={saving || isOcrProcessing}>{saving ? "กำลังบันทึก…" : isOcrProcessing ? "กำลังอ่านสลิป…" : <><Icon name="check" size={17} />{isPending ? "บันทึกต่อ" : "ยืนยันรายการ"}</>}</button>}</div>
      </section>
    </div>
  );
}

function ConnectionDialog({ connection, onClose, onLogout, onRetry }) {
  const connected = connection.mode === "google" && connection.state === "connected";
  return (
    <div className="modal-backdrop connection-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-title">
        <div className="modal-header"><div><span className="modal-kicker">ตั้งค่าระบบ</span><h2 id="connection-title">การเชื่อมต่อ</h2></div><button className="icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><Icon name="close" size={21} /></button></div>
        <div className="connection-dialog-body">
          <div className={`connection-status-card ${connected ? "is-connected" : "is-demo"}`}>
            <span className="connection-status-icon"><Icon name={connected ? "check" : "info"} size={19} /></span>
            <div><strong>{connected ? "เชื่อมต่อ Google แล้ว" : "กำลังใช้โหมดทดลอง"}</strong><span>{connected ? "รายการใหม่จะบันทึกลงชีตและหลักฐานลง Drive" : "รายการที่เพิ่มตอนนี้เก็บไว้ในอุปกรณ์นี้ ไม่ได้ส่งไป Google"}</span></div>
          </div>
          {connected ? (
            <div className="google-links">
              {connection.spreadsheetUrl && <a href={connection.spreadsheetUrl} target="_blank" rel="noreferrer"><Icon name="list" size={17} /><span><strong>{connection.spreadsheetTitle || "Google Sheets"}</strong><small>เปิดชีตข้อมูลรายการ</small></span><Icon name="chevronRight" size={17} /></a>}
              {connection.driveFolderUrl && <a href={connection.driveFolderUrl} target="_blank" rel="noreferrer"><Icon name="image" size={17} /><span><strong>{connection.driveFolderName || "Google Drive"}</strong><small>เปิดโฟลเดอร์หลักฐาน</small></span><Icon name="chevronRight" size={17} /></a>}
            </div>
          ) : (
            <div className="connection-steps"><strong>เพื่อเปิดการซิงก์</strong><ol><li>เพิ่ม API และ Apps Script ที่อยู่ในโฟลเดอร์โครงการนี้</li><li>ตั้งค่า Environment Variables ใน Vercel</li><li>Deploy Apps Script และ Vercel แล้วตรวจสถานะอีกครั้ง</li></ol><small>ระหว่างนี้ข้อมูลโหมดทดลองไม่ซิงก์ระหว่างอุปกรณ์</small></div>
          )}
        </div>
        <div className="modal-footer connection-footer">
          {connected && <button className="secondary-button logout-button" onClick={onLogout}>ออกจากระบบ</button>}
          <button className="secondary-button" onClick={onClose}>ปิด</button>
          {connected && <button className="primary-button" onClick={onRetry}><Icon name="check" size={17} />ตรวจการเชื่อมต่อ</button>}
        </div>
      </section>
    </div>
  );
}

export default App;
