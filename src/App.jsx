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
          connection={connection}
          onMonthChange={setSelectedMonth}
          onUpload={openUpload}
          onSettings={() => setShowSettings(true)}
        />
        <main className="content-area">
          {activeView === "overview" && (
            <Overview
              summary={summary}
              transactions={transactions}
              selectedMonth={selectedMonth}
              onUpload={openUpload}
              onNavigate={setActiveView}
              onSelectTransaction={openTransaction}
            />
          )}
          {activeView === "upload" && <UploadView onUpload={openUpload} transactions={transactions} onReview={openTransaction} />}
          {activeView === "history" && (
            <HistoryView
              transactions={transactions}
              selectedMonth={selectedMonth}
              onSelectTransaction={openTransaction}
              connection={connection}
              onRemove={removeTransaction}
              hiddenTransactions={hiddenTransactions.filter((item) => item.budgetMonth === selectedMonth)}
              onRestoreMonth={restoreHiddenForMonth}
            />
          )}
          {activeView === "installments" && (
            <InstallmentsView
              plans={installments}
              month={installmentMonth}
              onMonthChange={setInstallmentMonth}
              storageMode={runtime.mode}
              syncReady={installmentSync.ready}
              syncError={installmentSync.error}
              onRetrySync={retryInstallmentSync}
              saving={savingInstallment}
              updatingPayment={updatingPayment}
              onCreate={createInstallment}
              onTogglePayment={toggleInstallmentPayment}
              onSettings={() => setShowSettings(true)}
            />
          )}
          {activeView === "coach" && <CoachView summary={summary} selectedMonth={selectedMonth} />}
        </main>
      </div>
      <MobileNav activeView={activeView} onNavigate={setActiveView} />
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {draft && (
        <ReviewModal draft={draft} monthChoices={monthChoices} transactionNameOptions={transactionNameOptions} saving={saving} storageMode={runtime.mode} onChange={updateDraft} onAttachEvidence={attachPendingEvidence} onClose={closeDraft} onConfirm={confirmDraft} />
      )}
      {showSettings && <ConnectionDialog connection={connection} onClose={() => setShowSettings(false)} onLogout={handleLogout} onRetry={retryGoogleConnection} />}
      {toast && <div className="toast"><Icon name="check" size={17} />{toast}</div>}
    </div>
  );
}

function RuntimeScreen({ title, detail, actionLabel, onAction }) {
  return (
    <main className="runtime-screen">
      <div className="runtime-card">
        <div className="brand-mark"><Icon name="wallet" size={22} /></div>
        <h1>{title}</h1>
        <p>{detail}</p>
        {actionLabel && <button className="primary-button" onClick={onAction}>{actionLabel}</button>}
      </div>
    </main>
  );
}

function LoginScreen({ error, onSubmit }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    try { await onSubmit(password); } finally { setSubmitting(false); }
  }

  return (
    <main className="runtime-screen">
      <form className="runtime-card login-card" onSubmit={submit}>
        <div className="brand-mark"><Icon name="wallet" size={22} /></div>
        <h1>ระบบการเงินส่วนตัว</h1>
        <p>เข้าสู่ระบบเพื่อดูข้อมูลจาก Google Sheets และหลักฐานใน Drive</p>
        <label className="login-label" htmlFor="app-password">รหัสผ่านแอป</label>
        <input id="app-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <span className="login-error" role="alert">{error}</span>}
        <button className="primary-button" type="submit" disabled={submitting || !password}>{submitting ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
      </form>
    </main>
  );
}

function Sidebar({ activeView, connection, onNavigate, onSettings }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark"><Icon name="wallet" size={22} /></div>
        <div>
          <strong>ระบบการเงินส่วนตัว</strong>
          <span>Personal Finance</span>
        </div>
      </div>
      <nav className="side-nav" aria-label="เมนูหลัก">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activeView === item.key ? "active" : ""}`}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-current={activeView === item.key ? "page" : undefined}
            onClick={() => onNavigate(item.key)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className="sync-card" type="button" onClick={onSettings} aria-label="ดูสถานะการเชื่อมต่อ">
          <span className={`sync-icon ${connection.mode === "google" && connection.state === "connected" ? "connected" : ""}`}><Icon name={connection.mode === "google" && connection.state === "connected" ? "check" : "info"} size={17} /></span>
          <span className="sync-copy">
            <strong>{connection.mode === "google" ? "Google Sheets + Drive" : "โหมดทดลอง"}</strong>
            <span>{connection.mode === "google" ? "เชื่อมต่อแล้ว" : "ข้อมูลเก็บในเครื่องนี้"}</span>
          </span>
        </button>
        <button className="nav-item muted" type="button" title="ตั้งค่าและการเชื่อมต่อ" aria-label="ตั้งค่าและการเชื่อมต่อ" onClick={onSettings}><Icon name="settings" size={19} /><span>ตั้งค่าและการเชื่อมต่อ</span></button>
      </div>
    </aside>
  );
}

function MobileNav({ activeView, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="เมนูมือถือ">
      {navItems.map((item) => (
        <button key={item.key} className={activeView === item.key ? "active" : ""} onClick={() => onNavigate(item.key)} aria-label={item.label} aria-current={activeView === item.key ? "page" : undefined}>
          <Icon name={item.icon} size={20} />
          <span>{({ overview: "ภาพรวม", upload: "อัปโหลด", history: "ประวัติ", installments: "ผ่อนสินค้า", coach: "AI" })[item.key]}</span>
        </button>
      ))}
    </nav>
  );
}

function Topbar({ activeView, selectedMonth, monthChoices, connection, onMonthChange, onUpload, onSettings }) {
  const title = navItems.find((item) => item.key === activeView)?.label || "ภาพรวม";
  const monthIndex = monthChoices.findIndex((item) => item.value === selectedMonth);
  const connected = connection.mode === "google" && connection.state === "connected";
  return (
    <header className="topbar">
      <div className="mobile-brand"><div className="brand-mark"><Icon name="wallet" size={18} /></div><strong>การเงินส่วนตัว</strong></div>
      <div className="topbar-title"><h1>{title}</h1><span>อัปเดตล่าสุดเมื่อสักครู่</span></div>
      <div className="topbar-actions">
        <button className={`connection-chip ${connected ? "connected" : "demo"}`} type="button" onClick={onSettings} aria-label={connected ? "เชื่อมต่อ Google Sheets และ Drive แล้ว เปิดตั้งค่าการเชื่อมต่อ" : "โหมดทดลอง เปิดตั้งค่าการเชื่อมต่อ"}>
          <span className="connection-dot"><Icon name={connected ? "check" : "info"} size={14} /></span>
          <span className="connection-label">{connected ? "Google เชื่อมต่อแล้ว" : "โหมดทดลอง"}</span>
        </button>
        <button className="icon-button settings-button" type="button" aria-label="ตั้งค่าและการเชื่อมต่อ" onClick={onSettings}><Icon name="settings" size={19} /></button>
      </div>
      {activeView !== "installments" && (
        <>
          <div className="month-control">
            <button className="icon-button small" aria-label="เดือนก่อนหน้า" disabled={monthIndex <= 0} onClick={() => onMonthChange(monthChoices[Math.max(0, monthIndex - 1)].value)}><Icon name="chevronLeft" size={18} /></button>
            <select value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)} aria-label="เลือกเดือนงบประมาณ">
              {monthChoices.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
            </select>
            <button className="icon-button small" aria-label="เดือนถัดไป" disabled={monthIndex >= monthChoices.length - 1} onClick={() => onMonthChange(monthChoices[Math.min(monthChoices.length - 1, monthIndex + 1)].value)}><Icon name="chevronRight" size={18} /></button>
          </div>
          <button className="top-upload" onClick={onUpload}><Icon name="upload" size={17} />อัปโหลดสลิป</button>
        </>
      )}
    </header>
  );
}

function Overview({ summary, transactions, selectedMonth, onUpload, onNavigate, onSelectTransaction }) {
  const monthTransactions = summary.monthTransactions;
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>ภาพรวมการเงิน</h2>
          <p>ติดตามรายรับ ภาระที่ต้องจ่าย และรายการที่ยังรอตรวจสอบในเดือน {getMonthLabel(selectedMonth)}</p>
        </div>
        <button className="secondary-button" onClick={() => onNavigate("history")}><Icon name="list" size={17} />ดูประวัติทั้งหมด</button>
      </section>

      <section className="metric-grid" aria-label="สรุปยอดเดือน">
        <MetricCard label="ยอดคงเหลือ" value={`฿ ${formatNumber(summary.balance)}`} detail="หลังหักภาระที่ต้องจ่าย" icon="wallet" tone="green" />
        <MetricCard label="รายรับ" value={`฿ ${formatNumber(summary.income)}`} detail="รายรับที่จัดสรรในเดือนนี้" icon="arrowUp" tone="blue" />
        <MetricCard label="ภาระที่ต้องจ่าย" value={`฿ ${formatNumber(summary.expenses)}`} detail={`${summary.monthTransactions.filter((item) => item.type === "expense").length} รายการที่บันทึกแล้ว`} icon="card" tone="coral" />
        <MetricCard label="สัดส่วนภาระต่อรายรับ" value={`${summary.debtRatio}%`} detail="บัตรเครดิตและหนี้สิน/ผ่อนชำระ" icon="chart" tone="amber" progress={summary.debtRatio} />
      </section>

      <section className="upload-banner" onClick={onUpload} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onUpload()}>
        <div className="upload-banner-icon"><Icon name="upload" size={24} /></div>
        <div className="upload-banner-copy"><strong>อัปโหลดสลิปหรือใบเสร็จ</strong><span>เพิ่มหลักฐาน แล้วตรวจสอบข้อมูลก่อนบันทึกเข้าระบบ</span></div>
        <span className="banner-action">เลือกไฟล์ <Icon name="chevronRight" size={19} /></span>
      </section>

      <section className="dashboard-lower">
        <div className="panel transaction-panel">
          <div className="panel-header"><div><h3>รายการทั้งหมดในเดือน {getMonthLabel(selectedMonth)}</h3><span>{monthTransactions.length} รายการ</span></div><button className="text-button" onClick={() => onNavigate("history")}>ค้นหาและกรอง <Icon name="chevronRight" size={16} /></button></div>
          <TransactionTable transactions={monthTransactions} onSelect={onSelectTransaction} />
        </div>
        <AiSummary summary={summary} onOpen={() => onNavigate("coach")} />
      </section>
      {transactions.some((item) => item.status === "รอตรวจสอบ") && <PendingNotice count={transactions.filter((item) => item.status === "รอตรวจสอบ").length} onOpen={() => onNavigate("upload")} />}
    </div>
  );
}

function MetricCard({ label, value, detail, icon, tone, progress }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-top"><div className="metric-icon"><Icon name={icon} size={19} /></div><span>{label}</span></div>
      <strong className="metric-value">{value}</strong>
      {progress !== undefined ? <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} /></div> : null}
      <small>{detail}</small>
    </article>
  );
}

function TransactionTable({ transactions, onSelect }) {
  if (!transactions.length) return <div className="empty-state"><Icon name="list" size={22} /><strong>ยังไม่มีรายการในเดือนนี้</strong><span>ลองอัปโหลดหลักฐานรายการแรกได้เลย</span></div>;
  return (
    <div className="transaction-table">
      <div className="table-row table-head"><span>วันที่</span><span>รายการ</span><span>จำนวนเงิน</span><span>หมวดหมู่</span><span>สถานะ</span></div>
      {transactions.map((transaction) => (
        <button className="table-row table-body" key={transaction.id} onClick={() => onSelect(transaction)}>
          <span className="date-cell" data-label="วันที่">{formatDate(transaction.date)}</span>
          <span className="name-cell" data-label="รายการ"><span className={`row-icon ${transaction.type === "income" ? "income" : "expense"}`}><Icon name={transaction.type === "income" ? "arrowUp" : transaction.category === "บัตรเครดิต" ? "card" : "wallet"} size={16} /></span><span>{transaction.name}</span></span>
          <span className={transaction.type === "income" ? "amount income-text" : "amount"} data-label="จำนวนเงิน">{transaction.type === "income" ? "+" : "-"}฿ {formatNumber(transaction.amount)}</span>
          <span data-label="หมวดหมู่"><span className="category-text">{transaction.category}</span></span>
          <span data-label="สถานะ"><Status status={transaction.status} /></span>
        </button>
      ))}
    </div>
  );
}

function Status({ status }) {
  const isConfirmed = status === "ยืนยันแล้ว";
  return <span className={`status ${isConfirmed ? "confirmed" : "pending"}`}><Icon name={isConfirmed ? "check" : "clock"} size={13} />{status}</span>;
}

function AiSummary({ summary, onOpen }) {
  const ratioText = summary.debtRatio > 45 ? "สูงกว่าช่วงที่ควรเฝ้าดู" : "ยังอยู่ในระดับที่ติดตามได้";
  return (
    <aside className="ai-summary panel">
      <div className="ai-heading"><div className="ai-symbol"><Icon name="sparkles" size={19} /></div><div><h3>คำแนะนำ AI</h3><span>สรุปจากข้อมูลเดือนนี้</span></div></div>
      <div className="ai-message"><strong>{ratioText}</strong><p>ภาระบัตรเครดิตและหนี้สินรวม <b>฿ {formatNumber(summary.debt)}</b> หรือ {summary.debtRatio}% ของรายรับ</p></div>
      <div className="ai-divider" />
      <div className="ai-next"><Icon name="lightbulb" size={18} /><span>หลังหักภาระแล้ว มีเงินคงเหลือ <b>฿ {formatNumber(summary.balance)}</b> สำหรับค่าใช้จ่ายอื่นและเงินสำรอง</span></div>
      <button className="text-button" onClick={onOpen}>ดูคำแนะนำทั้งหมด <Icon name="chevronRight" size={16} /></button>
    </aside>
  );
}

function PendingNotice({ count, onOpen }) {
  return <button className="pending-notice" onClick={onOpen}><span className="pending-dot"><Icon name="clock" size={16} /></span><span><strong>มี {count} รายการรอตรวจสอบ</strong><small>ตรวจข้อมูลจากรูปก่อนบันทึกจริง</small></span><Icon name="chevronRight" size={18} /></button>;
}

function UploadView({ onUpload, transactions, onReview }) {
  const pending = transactions.filter((item) => item.status === "รอตรวจสอบ");
  return (
    <div className="page-stack">
      <section className="page-intro"><div><h2>อัปโหลดหลักฐาน</h2><p>นำรูปสลิปหรือใบเสร็จเข้ามาตรวจสอบ แล้วค่อยยืนยันเข้าระบบ</p></div></section>
      <section className="upload-layout">
        <button className="dropzone" onClick={onUpload}>
          <div className="dropzone-icon"><Icon name="upload" size={28} /></div>
          <strong>เลือกไฟล์เพื่อเริ่มต้น</strong>
          <span>รองรับ JPG, PNG, WebP, HEIC, HEIF และ PDF (ไม่เกิน 3 MB)</span>
          <small>ไฟล์จะยังไม่ถูกบันทึกเข้าข้อมูลหลัก จนกว่าจะกดยืนยัน</small>
        </button>
        <div className="process-card panel"><h3>ขั้นตอนของรายการ</h3><ProcessStep number="01" title="อัปโหลดหลักฐาน" detail="รูปสลิปหรือใบเสร็จ" active /><ProcessStep number="02" title="ตรวจสอบข้อมูล" detail="วันที่ จำนวนเงิน หมวดหมู่ และเดือนงบประมาณ" /><ProcessStep number="03" title="ยืนยันรายการ" detail="พร้อมส่งต่อไป Google Sheets/Drive" /></div>
      </section>
      <section className="panel pending-panel"><div className="panel-header"><div><h3>รายการรอตรวจสอบ</h3><span>รายการเหล่านี้ยังไม่กระทบยอดรวม</span></div><span className="count-label">{pending.length} รายการ</span></div>{pending.length ? pending.map((item) => <button className="pending-row" key={item.id} onClick={() => onReview(item)}><span className="row-icon pending"><Icon name="image" size={16} /></span><span className="pending-name"><strong>{item.name}</strong><small>{item.fileName || "หลักฐานที่อัปโหลด"}</small></span><span className="pending-amount">{item.amount ? `฿ ${formatNumber(item.amount)}` : "รอกรอกจำนวนเงิน"}</span><Status status="รอตรวจสอบ" /><Icon name="chevronRight" size={17} /></button>) : <div className="empty-state"><Icon name="check" size={22} /><strong>ไม่มีรายการค้างอยู่</strong><span>รายการใหม่จะมาอยู่ตรงนี้ก่อนยืนยัน</span></div>}</section>
    </div>
  );
}

function ProcessStep({ number, title, detail, active }) {
  return <div className={`process-step ${active ? "active" : ""}`}><span className="step-number">{number}</span><span><strong>{title}</strong><small>{detail}</small></span>{active && <span className="step-current">ตอนนี้</span>}</div>;
}

function HistoryView({ transactions, selectedMonth, connection, onSelectTransaction, onRemove, hiddenTransactions, onRestoreMonth }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");
  const [restoring, setRestoring] = useState(false);
  const categories = ["ทั้งหมด", ...categoryOptions];
  const filtered = transactions.filter((item) => {
    const matchesMonth = item.budgetMonth === selectedMonth;
    const matchesCategory = category === "ทั้งหมด" || item.category === category;
    const haystack = `${item.name} ${item.channel} ${item.category}`.toLowerCase();
    return matchesMonth && matchesCategory && haystack.includes(query.toLowerCase());
  });

  async function restoreAllHidden() {
    if (!hiddenTransactions.length || restoring) return;
    const shouldRestore = window.confirm(
      `คืนรายการที่ซ่อนทั้งหมด ${hiddenTransactions.length} รายการของเดือน ${getMonthLabel(selectedMonth)} กลับมาแสดงในแอปหรือไม่? รายการเหล่านี้จะกลับไปรวมในยอดสรุปของเดือนนี้ด้วย`
    );
    if (!shouldRestore) return;

    setRestoring(true);
    try {
      await onRestoreMonth(selectedMonth);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-intro"><div><h2>ประวัติรายการ</h2><p>ตรวจสอบรายการทั้งหมดที่ถูกจัดเข้าเดือน {getMonthLabel(selectedMonth)}</p></div><button className="secondary-button"><Icon name="download" size={17} />ส่งออกภายหลัง</button></section>
      <section className="filter-bar panel"><div className="search-field"><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหารายการหรือช่องทางจ่าย" /></div><div className="select-field"><Icon name="filter" size={17} /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="กรองตามหมวดหมู่">{categories.map((item) => <option key={item}>{item}</option>)}</select></div></section>
      <section className="panel history-panel">
        <div className="panel-header history-panel-header">
          <div><h3>รายการในเดือน {getMonthLabel(selectedMonth)}</h3><span>{filtered.length} จาก {transactions.filter((item) => item.budgetMonth === selectedMonth).length} รายการ</span></div>
          {connection.mode === "google" && (
            <button className="secondary-button restore-button" type="button" disabled={!hiddenTransactions.length || restoring} onClick={restoreAllHidden}>
              <Icon name="restore" size={16} />
              {restoring ? "กำลังคืนรายการ…" : `คืนรายการที่ซ่อนทั้งหมด (${hiddenTransactions.length})`}
            </button>
          )}
        </div>
        <TransactionTable transactions={filtered} onSelect={onSelectTransaction} />
      </section>
      <div className="history-footnote"><Icon name="info" size={16} /><span>{connection.mode === "google" ? "ข้อมูลนี้โหลดจาก Google Sheets รายการที่ซ่อนจากแอปยังคงอยู่ในชีต" : "ข้อมูลทดลองบันทึกไว้ในอุปกรณ์นี้เท่านั้น ยังไม่ได้ส่งไป Google Sheets/Drive"}</span>{filtered.length > 0 && <button className="danger-link" onClick={() => window.confirm(connection.mode === "google" ? "ซ่อนรายการล่าสุดจากแอปหรือไม่? แถวข้อมูลจะยังคงอยู่ใน Google Sheets" : "ลบรายการทดลองล่าสุดออกจากอุปกรณ์นี้หรือไม่?") && onRemove(filtered[0].id)}>{connection.mode === "google" ? "ซ่อนรายการล่าสุด" : "ลบรายการล่าสุด"}</button>}</div>
    </div>
  );
}

function InstallmentsView({ plans, month, onMonthChange, storageMode, syncReady, syncError, onRetrySync, saving, updatingPayment, onCreate, onTogglePayment, onSettings }) {
  const [formOpen, setFormOpen] = useState(false);
  const summary = summarizeInstallments(plans, month);
  const canSave = storageMode !== "google" || syncReady;

  return (
    <div className="page-stack installment-page">
      <section className="page-intro">
        <div>
          <span className="installment-kicker"><Icon name="card" size={15} />จัดการแผนชำระ</span>
          <h2>ผ่อนสินค้าด้วยบัตรเครดิต</h2>
          <p>ดูยอดที่ต้องจ่ายแต่ละเดือน และทำเครื่องหมายเมื่อชำระแล้ว</p>
        </div>
        <button className="primary-button installment-add-button" type="button" onClick={() => setFormOpen(true)} disabled={!canSave} title={!canSave ? "อัปเดตการเชื่อมต่อก่อนบันทึกแผนผ่อน" : undefined}>
          <Icon name="plus" size={18} />เพิ่มรายการผ่อน
        </button>
      </section>

      {storageMode === "google" && !syncReady && (
        <section className="installment-sync-notice" role="status">
          <span className="installment-sync-icon"><Icon name="info" size={18} /></span>
          <div><strong>ยังซิงก์ข้อมูลผ่อนไม่ได้</strong><span>{syncError || "ตรวจสอบ Apps Script แล้วลองโหลดใหม่"}</span></div>
          <button className="secondary-button" type="button" onClick={onRetrySync}>ลองเชื่อมต่ออีกครั้ง</button>
        </section>
      )}
      {storageMode !== "google" && (
        <section className="installment-sync-notice local" role="status">
          <span className="installment-sync-icon"><Icon name="info" size={18} /></span>
          <div><strong>ข้อมูลทดลองในอุปกรณ์นี้</strong><span>ลงชื่อเข้าใช้ Google เพื่อซิงก์แผนผ่อนและสถานะชำระกับอุปกรณ์อื่น</span></div>
          <button className="secondary-button" type="button" onClick={onSettings}>การเชื่อมต่อ</button>
        </section>
      )}

      <section className="installment-month-panel panel" aria-label="เลือกเดือนสรุป">
        <div className="installment-month-heading">
          <span className="installment-month-icon"><Icon name="calendar" size={19} /></span>
          <div><small>สรุปงวดประจำเดือน</small><strong>{installmentMonthLabel(month)}</strong></div>
        </div>
        <div className="installment-month-controls">
          <button className="icon-button" type="button" aria-label="ดูเดือนก่อนหน้า" onClick={() => onMonthChange(addMonths(month, -1))}><Icon name="chevronLeft" size={18} /></button>
          <button className="icon-button" type="button" aria-label="ดูเดือนถัดไป" onClick={() => onMonthChange(addMonths(month, 1))}><Icon name="chevronRight" size={18} /></button>
        </div>
      </section>

      <section className="metric-grid installment-metrics" aria-label="สรุปแผนผ่อน">
        <MetricCard label="ต้องจ่ายเดือนนี้" value={`฿ ${formatNumber(summary.dueAmount)}`} detail={`${summary.dueCount} งวดใน ${installmentMonthLabel(month, { short: true })}`} icon="calendar" tone="blue" />
        <MetricCard label="ชำระแล้วเดือนนี้" value={`${summary.paidThisMonth} / ${summary.dueCount} งวด`} detail={summary.dueCount ? "แตะสถานะในตารางเพื่อเปลี่ยน" : "ไม่มีงวดในเดือนนี้"} icon="check" tone="green" />
        <MetricCard label="ยอดคงเหลือทั้งหมด" value={`฿ ${formatNumber(summary.outstandingAmount)}`} detail={`ยังไม่ชำระ ${summary.paymentCount - summary.paidCount} จาก ${summary.paymentCount} งวด`} icon="wallet" tone="amber" />
      </section>

      {plans.length ? (
        <section className="installment-plan-list" aria-label="รายการผ่อนสินค้า">
          {plans.map((plan, index) => (
            <InstallmentPlanCard
              key={plan.id}
              plan={plan}
              index={index}
              updatingPayment={updatingPayment}
              onTogglePayment={onTogglePayment}
            />
          ))}
        </section>
      ) : (
        <section className="installment-empty panel">
          <div className="installment-empty-icon"><Icon name="card" size={25} /></div>
          <strong>ยังไม่มีรายการผ่อน</strong>
          <span>เพิ่มสินค้าใบแรก แล้วระบบจะสร้างตารางยอดชำระรายเดือนให้</span>
          <button className="secondary-button" type="button" onClick={() => setFormOpen(true)} disabled={!canSave}><Icon name="plus" size={16} />เพิ่มรายการผ่อน</button>
        </section>
      )}

      {formOpen && <InstallmentFormModal saving={saving} onClose={() => setFormOpen(false)} onSave={async (form) => {
        const saved = await onCreate(form);
        if (saved) setFormOpen(false);
      }} />}
    </div>
  );
}

function InstallmentPlanCard({ plan, index, updatingPayment, onTogglePayment }) {
  const [expanded, setExpanded] = useState(index === 0);
  const bank = installmentBanks.find((item) => item.value === plan.bank) || installmentBanks[0];
  const paidCount = plan.schedule.filter((payment) => payment.paid).length;
  const progress = plan.schedule.length ? Math.round((paidCount / plan.schedule.length) * 100) : 0;
  const monthlyAmount = plan.schedule[0]?.amount || 0;

  return (
    <article className="installment-plan-card panel" style={{ "--plan-index": index }}>
      <div className="installment-plan-head">
        <div className={`installment-bank-mark bank-${bank.tone}`} aria-label={bank.label}>{bank.short}</div>
        <div className="installment-plan-title">
          <span className="installment-plan-bank">{bank.label} · {plan.months} เดือน · เริ่ม {installmentMonthLabel(plan.startMonth, { short: true })}</span>
          <h3>{plan.name}</h3>
          <span className="installment-plan-price">ราคาสินค้า ฿ {formatNumber(plan.price)} · ดาวน์ ฿ {formatNumber(plan.downPayment)}{plan.interestRate ? ` · ดอกเบี้ย ${plan.interestRate}%` : " · ดอกเบี้ย 0%"}</span>
        </div>
        <div className="installment-plan-amount"><strong>฿ {formatNumber(monthlyAmount)}</strong><span>ค่างวดต่อเดือน</span></div>
        <button className={`icon-button installment-expand ${expanded ? "is-expanded" : ""}`} type="button" aria-label={expanded ? "ซ่อนตารางงวด" : "แสดงตารางงวด"} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><Icon name="chevronRight" size={18} /></button>
      </div>
      <div className="installment-progress-row">
        <div className="installment-progress-track"><span style={{ width: `${progress}%` }} /></div>
        <span>{paidCount} / {plan.schedule.length} งวด ({progress}%)</span>
        <strong>ยอดรวม ฿ {formatNumber(plan.totalAmount)}</strong>
      </div>
      {expanded && (
        <div className="installment-schedule-wrap">
          <div className="installment-schedule-title"><div><h4>ตารางชำระรายเดือน</h4><span>ค่างวดคำนวณหลังหักเงินดาวน์ และปรับสตางค์ในงวดสุดท้าย</span></div></div>
          <div className="installment-schedule-table" role="table" aria-label={`ตารางผ่อน ${plan.name}`}>
            <div className="installment-schedule-row installment-schedule-head" role="row"><span role="columnheader">งวด</span><span role="columnheader">เดือน</span><span role="columnheader">จำนวนเงิน</span><span role="columnheader">สถานะ</span></div>
            {plan.schedule.map((payment) => {
              const key = `${plan.id}:${payment.installmentNumber}`;
              const isUpdating = updatingPayment === key;
              return (
                <div className={`installment-schedule-row ${payment.paid ? "paid" : ""}`} role="row" key={payment.installmentNumber}>
                  <span data-label="งวด" role="cell">งวดที่ {payment.installmentNumber}</span>
                  <span data-label="เดือน" role="cell">{installmentMonthLabel(payment.month)}</span>
                  <strong data-label="จำนวนเงิน" role="cell">฿ {formatNumber(payment.amount)}</strong>
                  <span data-label="สถานะ" role="cell">
                    <button className={`payment-toggle ${payment.paid ? "is-paid" : ""}`} type="button" disabled={Boolean(updatingPayment)} aria-pressed={payment.paid} onClick={() => onTogglePayment(plan.id, payment.installmentNumber, !payment.paid)}>
                      <span className="payment-check"><Icon name={payment.paid ? "check" : "clock"} size={13} /></span>
                      {isUpdating ? "กำลังบันทึก…" : payment.paid ? "ชำระแล้ว" : "ทำเครื่องหมายว่าจ่ายแล้ว"}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

function InstallmentFormModal({ saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    id: "",
    name: "",
    price: "",
    downPayment: "0",
    interestRate: "0",
    months: "10",
    bank: "กสิกรไทย",
    startMonth: currentInstallmentMonth(),
  }));
  const price = Number(form.price);
  const downPayment = Number(form.downPayment || 0);
  const rate = Number(form.interestRate);
  const months = Number(form.months);
  const amounts = calculateInstallmentAmounts({ price: price || 0, downPayment, interestRate: rate });
  const regularPayment = months > 0 ? Math.floor((amounts.installmentTotal / months) * 100) / 100 : 0;

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const id = form.id || globalThis.crypto?.randomUUID?.() || `INS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setForm((current) => ({ ...current, id }));
    await onSave({ ...form, id, price, downPayment, interestRate: rate, months });
  }

  return (
    <div className="modal-backdrop installment-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="installment-form-modal" role="dialog" aria-modal="true" aria-labelledby="installment-form-title">
        <header className="modal-header">
          <div><span className="modal-kicker">แผนผ่อนสินค้า</span><h2 id="installment-form-title">เพิ่มรายการผ่อน</h2></div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose} disabled={saving}><Icon name="close" size={19} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="installment-form-body">
            <div className="review-form installment-fields">
              <label>ชื่อรายการสินค้า<input autoFocus maxLength={120} required placeholder="เช่น iPad Air, โทรศัพท์" value={form.name} onChange={(event) => change("name", event.target.value)} /></label>
              <div className="form-two-col">
                <label>ราคาสินค้า (บาท)<input type="number" min="0.01" max="100000000" step="0.01" required placeholder="เช่น 25000" value={form.price} onChange={(event) => change("price", event.target.value)} /></label>
                <label>เงินดาวน์ (บาท)<input type="number" min="0" max={price > 0 ? Math.max(0, price - 0.01) : 0} step="0.01" required value={form.downPayment} onChange={(event) => change("downPayment", event.target.value)} /><small className="installment-field-hint">หักออกจากราคาก่อนคำนวณดอกเบี้ย</small></label>
              </div>
              <div className="form-two-col">
                <label>ดอกเบี้ยรวมตลอดแผน (%)<input type="number" min="0" max="100" step="0.01" required value={form.interestRate} onChange={(event) => change("interestRate", event.target.value)} /><small className="installment-field-hint">เริ่มต้น 0% · คิดจากยอดหลังหักเงินดาวน์</small></label>
                <label>จำนวนเดือน<input type="number" min="1" max="60" step="1" required value={form.months} onChange={(event) => change("months", event.target.value)} /></label>
              </div>
              <label>เริ่มชำระเดือน<input type="month" required value={form.startMonth} onChange={(event) => change("startMonth", event.target.value)} /></label>
              <fieldset className="installment-bank-picker">
                <legend>ธนาคารเจ้าของบัตร</legend>
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
