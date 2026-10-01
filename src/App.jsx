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
  checkSession,
  getGoogleStatus,
  listTransactions,
  removeTransaction as removeGoogleTransaction,
  restoreHiddenTransactions as restoreGoogleHiddenTransactions,
  saveTransaction as saveGoogleTransaction,
  signIn,
  signOut,
} from "./api";

const navItems = [
  { key: "overview", label: "ภาพรวม", icon: "grid" },
  { key: "upload", label: "อัปโหลดสลิป", icon: "upload" },
  { key: "history", label: "ประวัติรายการ", icon: "list" },
  { key: "coach", label: "คำแนะนำ AI", icon: "sparkles" },
];

function loadSavedTransactions() {
  try {
    const saved = window.localStorage.getItem("personal-finance-transactions");
    return saved ? JSON.parse(saved) : initialTransactions;
  } catch {
    return initialTransactions;
  }
}

function App() {
  const [activeView, setActiveView] = useState("overview");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [transactions, setTransactions] = useState([]);
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
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const summary = useMemo(() => getSummary(transactions, selectedMonth), [transactions, selectedMonth]);
  const monthChoices = useMemo(
    () => getMonthOptions(transactions, draft?.budgetMonth ? [draft.budgetMonth] : []),
    [transactions, draft?.budgetMonth]
  );

  async function loadGoogleWorkspace() {
    setRuntime({ status: "syncing", mode: "google" });
    const [health, remoteTransactions] = await Promise.all([getGoogleStatus(), listTransactions()]);
    setTransactions(remoteTransactions.filter((item) => item.status !== "ลบแล้ว"));
    setHiddenTransactions(remoteTransactions.filter((item) => item.status === "ลบแล้ว"));
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

  function openUpload() {
    fileInputRef.current?.click();
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
    setDraft({ ...createDraftFromFile(file), sourceFile: file });
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
    const amount = Number(String(draft?.amount ?? "").replaceAll(",", ""));
    if (!draft || !Number.isFinite(amount) || amount <= 0 || !String(draft.name || "").trim()) {
      setToast("กรุณาตรวจสอบจำนวนเงินก่อนยืนยันรายการ");
      return;
    }

    const newTransaction = {
      id: globalThis.crypto?.randomUUID?.() || `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
              onSelectTransaction={(transaction) => {
                setDraft({ ...transaction, fileName: transaction.evidenceName, isExisting: true });
              }}
            />
          )}
          {activeView === "upload" && <UploadView onUpload={openUpload} transactions={transactions} onReview={(item) => setDraft({ ...item, isExisting: true })} />}
          {activeView === "history" && (
            <HistoryView
              transactions={transactions}
              selectedMonth={selectedMonth}
              onSelectTransaction={(transaction) => {
                setDraft({ ...transaction, fileName: transaction.evidenceName, isExisting: true });
              }}
              connection={connection}
              onRemove={removeTransaction}
              hiddenTransactions={hiddenTransactions.filter((item) => item.budgetMonth === selectedMonth)}
              onRestoreMonth={restoreHiddenForMonth}
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
        <ReviewModal draft={draft} monthChoices={monthChoices} saving={saving} onChange={updateDraft} onClose={closeDraft} onConfirm={confirmDraft} />
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
          <span>{item.key === "upload" ? "อัปโหลด" : item.label.replace("คำแนะนำ AI", "AI")}</span>
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
      <div className="month-control">
        <button className="icon-button small" aria-label="เดือนก่อนหน้า" disabled={monthIndex <= 0} onClick={() => onMonthChange(monthChoices[Math.max(0, monthIndex - 1)].value)}><Icon name="chevronLeft" size={18} /></button>
        <select value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)} aria-label="เลือกเดือนงบประมาณ">
          {monthChoices.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
        </select>
        <button className="icon-button small" aria-label="เดือนถัดไป" disabled={monthIndex >= monthChoices.length - 1} onClick={() => onMonthChange(monthChoices[Math.min(monthChoices.length - 1, monthIndex + 1)].value)}><Icon name="chevronRight" size={18} /></button>
      </div>
      <button className="top-upload" onClick={onUpload}><Icon name="upload" size={17} />อัปโหลดสลิป</button>
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

function CoachView({ summary, selectedMonth }) {
  const ratio = summary.debtRatio;
  const level = ratio >= 50 ? "ต้องเฝ้าระวัง" : ratio >= 35 ? "ควรวางแผนต่อเนื่อง" : "อยู่ในเกณฑ์ควบคุมได้";
  return (
    <div className="page-stack">
      <section className="page-intro"><div><h2>คำแนะนำ AI</h2><p>มุมมองเชิงปฏิบัติจากรายการของเดือน {getMonthLabel(selectedMonth)}</p></div><span className="beta-label"><Icon name="sparkles" size={15} />AI Coach</span></section>
      <section className="coach-hero"><div className="coach-orb"><Icon name="sparkles" size={28} /></div><div><span className="coach-kicker">สรุปสถานะการเงิน</span><h3>{level}</h3><p>ระบบเห็นว่าภาระบัตรเครดิตและหนี้สินอยู่ที่ {ratio}% ของรายรับในเดือนนี้</p></div><div className="coach-number"><strong>{ratio}%</strong><span>ภาระต่อรายรับ</span></div></section>
      <section className="coach-grid"><AdviceCard icon="wallet" title="รักษาเงินคงเหลือ" tone="green" text={`หลังหักภาระแล้ว คงเหลือ ฿ ${formatNumber(summary.balance)} ควรกันส่วนหนึ่งเป็นเงินสำรองก่อนเพิ่มค่าใช้จ่ายใหม่`} /><AdviceCard icon="card" title="รวมวันครบกำหนด" tone="blue" text="แนะนำให้บันทึกวันครบกำหนดของแต่ละเจ้าหนี้ เพื่อให้ระบบเตือนล่วงหน้าและเห็นยอดที่ต้องเตรียมได้แม่นขึ้น" /><AdviceCard icon="sparkles" title="สิ่งที่จะฉลาดขึ้น" tone="amber" text="เมื่อเชื่อม OCR และ AI จริง ระบบจะอ่านข้อความจากสลิป เสนอหมวดหมู่ และให้ยืนยันก่อนบันทึกอัตโนมัติ" /></section>
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

function ReviewModal({ draft, monthChoices, saving, onChange, onClose, onConfirm }) {
  const isExisting = draft.isExisting;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="modal-header"><div><span className="modal-kicker">{isExisting ? "รายละเอียดรายการ" : "ตรวจสอบข้อมูลจากสลิป"}</span><h2 id="review-title">{isExisting ? draft.name : "รายการใหม่จากหลักฐาน"}</h2></div><button className="icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><Icon name="close" size={21} /></button></div>
        <div className="review-body">
          <div className="receipt-preview">{draft.previewUrl ? <img src={draft.previewUrl} alt="ตัวอย่างหลักฐานที่อัปโหลด" /> : <div className="preview-empty"><Icon name="image" size={27} /><span>{draft.fileName || "ไม่มีภาพตัวอย่าง"}</span></div>}{draft.evidenceUrl && <a className="evidence-link" href={draft.evidenceUrl} target="_blank" rel="noreferrer">เปิดหลักฐานใน Google Drive</a>}<span className="preview-status"><Icon name={draft.isDemoDetected ? "check" : "info"} size={13} />{draft.isDemoDetected ? "ตรวจข้อมูลเบื้องต้นแล้ว" : "กรุณากรอกข้อมูลจากหลักฐาน"}</span></div>
          <div className="review-form">
            {!isExisting && <div className="review-note"><Icon name="info" size={16} /><span>{draft.isDemoDetected ? "ระบบจำลองตรวจพบข้อมูลจากรูปตัวอย่าง โปรดตรวจสอบความถูกต้องก่อนยืนยัน" : "ยังไม่ได้เชื่อม OCR/AI ระบบจะส่งไฟล์ไป Drive เมื่อยืนยันรายการในโหมด Google"}</span></div>}
            <label>วันที่เกิดรายการ<input type="date" value={draft.date || ""} onChange={(event) => onChange("date", event.target.value)} disabled={isExisting} /></label>
            <label>รายการ<input type="text" value={draft.name || ""} onChange={(event) => onChange("name", event.target.value)} disabled={isExisting} /></label>
            <label>จำนวนเงิน (บาท)<input type="number" min="0" step="0.01" value={draft.amount ?? ""} onChange={(event) => onChange("amount", event.target.value)} disabled={isExisting} /></label>
            <div className="form-two-col"><label>หมวดหมู่<select value={draft.category || "อื่นๆ"} onChange={(event) => onChange("category", event.target.value)} disabled={isExisting}>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label>ช่องทางจ่าย<select value={draft.channel || "อื่นๆ"} onChange={(event) => onChange("channel", event.target.value)} disabled={isExisting}>{channelOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            <label>เดือนงบประมาณ<select value={draft.budgetMonth || getCurrentMonthValue()} onChange={(event) => onChange("budgetMonth", event.target.value)} disabled={isExisting}>{monthChoices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label>หมายเหตุ<textarea rows="2" value={draft.note || ""} onChange={(event) => onChange("note", event.target.value)} disabled={isExisting} /></label>
          </div>
        </div>
        <div className="modal-footer"><button className="secondary-button" onClick={onClose} disabled={saving}>{isExisting ? "ปิด" : "ยกเลิก"}</button>{!isExisting && <button className="primary-button" onClick={onConfirm} disabled={saving}>{saving ? "กำลังบันทึก…" : <><Icon name="check" size={17} />ยืนยันรายการ</>}</button>}</div>
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
