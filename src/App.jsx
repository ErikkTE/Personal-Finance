import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  categoryOptions,
  channelOptions,
  createDraftFromFile,
  debtCategories,
  deriveBudgetMonth,
  formatDate,
  formatNumber,
  getMonthLabel,
  getSummary,
  initialTransactions,
  monthOptions,
} from "./data";

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
  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const [transactions, setTransactions] = useState(loadSavedTransactions);
  const [draft, setDraft] = useState(null);
  const [toast, setToast] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem("personal-finance-transactions", JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const summary = useMemo(() => getSummary(transactions, selectedMonth), [transactions, selectedMonth]);

  function openUpload() {
    fileInputRef.current?.click();
  }

  function handleFiles(fileList) {
    const file = fileList?.[0];
    if (!file) return;
    setDraft(createDraftFromFile(file));
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
    if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    setDraft(null);
  }

  function confirmDraft() {
    const amount = Number(String(draft?.amount ?? "").replaceAll(",", ""));
    if (!draft || !amount || amount < 0) {
      setToast("กรุณาตรวจสอบจำนวนเงินก่อนยืนยันรายการ");
      return;
    }

    const newTransaction = {
      ...draft,
      id: `TX-${String(transactions.length + 1).padStart(4, "0")}`,
      amount,
      status: "ยืนยันแล้ว",
      evidenceName: draft.fileName,
      fileName: undefined,
      fileType: undefined,
      previewUrl: undefined,
      isDemoDetected: undefined,
    };

    setTransactions((current) => [newTransaction, ...current]);
    setSelectedMonth(newTransaction.budgetMonth);
    closeDraft();
    setActiveView("overview");
    setToast("บันทึกรายการแล้ว — พร้อมต่อยอดไป Google Sheets/Drive");
  }

  function removeTransaction(id) {
    setTransactions((current) => current.filter((item) => item.id !== id));
    setToast("ลบรายการออกจากข้อมูลทดลองแล้ว");
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <div className="main-area">
        <Topbar
          activeView={activeView}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          onUpload={openUpload}
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
          {activeView === "upload" && <UploadView onUpload={openUpload} transactions={transactions} onReview={setDraft} />}
          {activeView === "history" && (
            <HistoryView
              transactions={transactions}
              selectedMonth={selectedMonth}
              onSelectTransaction={(transaction) => {
                setDraft({ ...transaction, fileName: transaction.evidenceName, isExisting: true });
              }}
              onRemove={removeTransaction}
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
        accept="image/*,.pdf"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {draft && (
        <ReviewModal draft={draft} onChange={updateDraft} onClose={closeDraft} onConfirm={confirmDraft} />
      )}
      {toast && <div className="toast"><Icon name="check" size={17} />{toast}</div>}
    </div>
  );
}

function Sidebar({ activeView, onNavigate }) {
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
            onClick={() => onNavigate(item.key)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sync-card">
          <div className="sync-icon"><Icon name="info" size={17} /></div>
          <div>
            <strong>โหมดทดลอง</strong>
            <span>ข้อมูลเก็บในเครื่องนี้</span>
          </div>
        </div>
        <button className="nav-item muted" type="button"><Icon name="settings" size={19} /><span>ตั้งค่า</span></button>
      </div>
    </aside>
  );
}

function MobileNav({ activeView, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="เมนูมือถือ">
      {navItems.map((item) => (
        <button key={item.key} className={activeView === item.key ? "active" : ""} onClick={() => onNavigate(item.key)}>
          <Icon name={item.icon} size={20} />
          <span>{item.label.replace("คำแนะนำ AI", "AI")}</span>
        </button>
      ))}
    </nav>
  );
}

function Topbar({ activeView, selectedMonth, onMonthChange, onUpload }) {
  const title = navItems.find((item) => item.key === activeView)?.label || "ภาพรวม";
  const monthIndex = monthOptions.findIndex((item) => item.value === selectedMonth);
  return (
    <header className="topbar">
      <div className="mobile-brand"><div className="brand-mark"><Icon name="wallet" size={18} /></div><strong>การเงินส่วนตัว</strong></div>
      <div className="topbar-title"><h1>{title}</h1><span>อัปเดตล่าสุดเมื่อสักครู่</span></div>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="การแจ้งเตือน"><Icon name="bell" size={20} /></button>
        <button className="avatar" aria-label="โปรไฟล์ผู้ใช้">ส</button>
      </div>
      <div className="month-control">
        <button className="icon-button small" aria-label="เดือนก่อนหน้า" disabled={monthIndex <= 0} onClick={() => onMonthChange(monthOptions[Math.max(0, monthIndex - 1)].value)}><Icon name="chevronLeft" size={18} /></button>
        <select value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)} aria-label="เลือกเดือนงบประมาณ">
          {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
        </select>
        <button className="icon-button small" aria-label="เดือนถัดไป" disabled={monthIndex >= monthOptions.length - 1} onClick={() => onMonthChange(monthOptions[Math.min(monthOptions.length - 1, monthIndex + 1)].value)}><Icon name="chevronRight" size={18} /></button>
      </div>
      <button className="top-upload" onClick={onUpload}><Icon name="upload" size={17} />อัปโหลดสลิป</button>
    </header>
  );
}

function Overview({ summary, transactions, selectedMonth, onUpload, onNavigate, onSelectTransaction }) {
  const latest = summary.monthTransactions.slice(0, 6);
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
          <div className="panel-header"><div><h3>รายการล่าสุด</h3><span>{latest.length} รายการในงบเดือนนี้</span></div><button className="text-button" onClick={() => onNavigate("history")}>ดูทั้งหมด <Icon name="chevronRight" size={16} /></button></div>
          <TransactionTable transactions={latest} onSelect={onSelectTransaction} />
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
          <span className="date-cell">{formatDate(transaction.date)}</span>
          <span className="name-cell"><span className={`row-icon ${transaction.type === "income" ? "income" : "expense"}`}><Icon name={transaction.type === "income" ? "arrowUp" : transaction.category === "บัตรเครดิต" ? "card" : "wallet"} size={16} /></span><span>{transaction.name}</span></span>
          <span className={transaction.type === "income" ? "amount income-text" : "amount"}>{transaction.type === "income" ? "+" : "-"}฿ {formatNumber(transaction.amount)}</span>
          <span><span className="category-text">{transaction.category}</span></span>
          <span><Status status={transaction.status} /></span>
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
          <span>รองรับ JPG, PNG และ PDF</span>
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

function HistoryView({ transactions, selectedMonth, onSelectTransaction, onRemove }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");
  const categories = ["ทั้งหมด", ...categoryOptions];
  const filtered = transactions.filter((item) => {
    const matchesMonth = item.budgetMonth === selectedMonth;
    const matchesCategory = category === "ทั้งหมด" || item.category === category;
    const haystack = `${item.name} ${item.channel} ${item.category}`.toLowerCase();
    return matchesMonth && matchesCategory && haystack.includes(query.toLowerCase());
  });
  return (
    <div className="page-stack">
      <section className="page-intro"><div><h2>ประวัติรายการ</h2><p>ตรวจสอบรายการทั้งหมดที่ถูกจัดเข้าเดือน {getMonthLabel(selectedMonth)}</p></div><button className="secondary-button"><Icon name="download" size={17} />ส่งออกภายหลัง</button></section>
      <section className="filter-bar panel"><div className="search-field"><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหารายการหรือช่องทางจ่าย" /></div><div className="select-field"><Icon name="filter" size={17} /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="กรองตามหมวดหมู่">{categories.map((item) => <option key={item}>{item}</option>)}</select></div></section>
      <section className="panel history-panel"><div className="panel-header"><div><h3>รายการในเดือน {getMonthLabel(selectedMonth)}</h3><span>{filtered.length} จาก {transactions.filter((item) => item.budgetMonth === selectedMonth).length} รายการ</span></div></div><TransactionTable transactions={filtered} onSelect={onSelectTransaction} /></section>
      <div className="history-footnote"><Icon name="info" size={16} /><span>ข้อมูลชุดนี้เป็นข้อมูลทดลองในเครื่อง การเชื่อม Google Sheets/Drive จะเพิ่มในขั้นตอนถัดไป</span>{filtered.length > 0 && <button className="danger-link" onClick={() => onRemove(filtered[0].id)}>ลบรายการทดลองล่าสุด</button>}</div>
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

function ReviewModal({ draft, onChange, onClose, onConfirm }) {
  const isExisting = draft.isExisting;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="modal-header"><div><span className="modal-kicker">{isExisting ? "รายละเอียดรายการ" : "ตรวจสอบข้อมูลจากสลิป"}</span><h2 id="review-title">{isExisting ? draft.name : "รายการใหม่จากหลักฐาน"}</h2></div><button className="icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><Icon name="close" size={21} /></button></div>
        <div className="review-body">
          <div className="receipt-preview">{draft.previewUrl ? <img src={draft.previewUrl} alt="ตัวอย่างหลักฐานที่อัปโหลด" /> : <div className="preview-empty"><Icon name="image" size={27} /><span>{draft.fileName || "ไม่มีภาพตัวอย่าง"}</span></div>}<span className="preview-status"><Icon name={draft.isDemoDetected ? "check" : "info"} size={13} />{draft.isDemoDetected ? "ตรวจข้อมูลเบื้องต้นแล้ว" : "กรุณากรอกข้อมูลจากหลักฐาน"}</span></div>
          <div className="review-form">
            {!isExisting && <div className="review-note"><Icon name="info" size={16} /><span>{draft.isDemoDetected ? "ระบบจำลองตรวจพบข้อมูลจากรูปตัวอย่าง โปรดตรวจสอบความถูกต้องก่อนยืนยัน" : "นี่คือ MVP ฝั่งหน้าจอ ยังไม่ได้ส่งรูปไป OCR/AI จริง"}</span></div>}
            <label>วันที่เกิดรายการ<input type="date" value={draft.date || ""} onChange={(event) => onChange("date", event.target.value)} disabled={isExisting} /></label>
            <label>รายการ<input type="text" value={draft.name || ""} onChange={(event) => onChange("name", event.target.value)} disabled={isExisting} /></label>
            <label>จำนวนเงิน (บาท)<input type="number" min="0" step="0.01" value={draft.amount ?? ""} onChange={(event) => onChange("amount", event.target.value)} disabled={isExisting} /></label>
            <div className="form-two-col"><label>หมวดหมู่<select value={draft.category || "อื่นๆ"} onChange={(event) => onChange("category", event.target.value)} disabled={isExisting}>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label>ช่องทางจ่าย<select value={draft.channel || "อื่นๆ"} onChange={(event) => onChange("channel", event.target.value)} disabled={isExisting}>{channelOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            <label>เดือนงบประมาณ<select value={draft.budgetMonth || "2026-10"} onChange={(event) => onChange("budgetMonth", event.target.value)} disabled={isExisting}>{monthOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label>หมายเหตุ<textarea rows="2" value={draft.note || ""} onChange={(event) => onChange("note", event.target.value)} disabled={isExisting} /></label>
          </div>
        </div>
        <div className="modal-footer"><button className="secondary-button" onClick={onClose}>{isExisting ? "ปิด" : "ยกเลิก"}</button>{!isExisting && <button className="primary-button" onClick={onConfirm}><Icon name="check" size={17} />ยืนยันรายการ</button>}</div>
      </section>
    </div>
  );
}

export default App;
