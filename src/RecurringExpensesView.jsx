import { useEffect, useRef, useState } from "react";
import { formatNumber, getMonthLabel } from "./data";
import { recurringExpenseCategories, recurringExpenseDurationMonths, isValidMonth } from "./recurring-expenses";
import { Icon } from "./icons";
import CategorySelect from "./CategorySelect";

const categoryVisuals = {
  "บ้านและที่พัก": { icon: "home", tone: "home" },
  "สาธารณูปโภค": { icon: "utilities", tone: "utilities" },
  "ประกัน": { icon: "insurance", tone: "insurance" },
  "สุขภาพ": { icon: "health", tone: "health" },
  "การศึกษา": { icon: "education", tone: "education" },
  "อื่นๆ": { icon: "receipt", tone: "other" },
  "ผ่อนสินค้า": { icon: "card", tone: "installment" },
  "บริการ": { icon: "calendar", tone: "subscription" },
};

const commitmentGroups = [
  { key: "fixed", label: "รายจ่ายคงที่", countLabel: "รายการ", icon: "home", tone: "fixed" },
  { key: "installment", label: "ผ่อนสินค้า", countLabel: "แผน", icon: "card", tone: "installment" },
  { key: "subscription", label: "บริการ", countLabel: "รายการ", icon: "calendar", tone: "subscription" },
];

function blankExpense(month) {
  return {
    name: "",
    amount: "",
    category: "บ้านและที่พัก",
    dueDay: "1",
    startMonth: month,
    endMode: "open",
    endMonth: "",
    note: "",
  };
}

function shortDateLabel(value) {
  if (!value) return "เดือนนี้";
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function moneyLabel(value) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function categoryVisual(category, type) {
  if (type === "fixed") return categoryVisuals[category] || categoryVisuals["อื่นๆ"];
  return categoryVisuals[category] || (type === "subscription" ? categoryVisuals["บริการ"] : categoryVisuals["ผ่อนสินค้า"]);
}

function commitmentDetail(entry) {
  if (entry.type === "fixed") {
    const ending = entry.source.endMonth ? `สิ้นสุด ${getMonthLabel(entry.source.endMonth)}` : "ต่อเนื่อง";
    return `ทุกวันที่ ${entry.dueDay} · ${ending}`;
  }
  if (entry.type === "installment") {
    const endingMonth = entry.source.schedule?.at(-1)?.month;
    const ending = endingMonth ? `สิ้นสุด ${getMonthLabel(endingMonth)}` : "มีงวดสิ้นสุด";
    return `งวด ${entry.payment?.installmentNumber || "—"}/${entry.source.months} · ${ending}`;
  }
  const cycle = entry.source.cycle === "yearly" ? "รายปี" : "รายเดือน";
  return `รอบถัดไป ${shortDateLabel(entry.dueDate)} · ${cycle}`;
}

export default function RecurringExpensesView({
  summary,
  selectedMonth,
  storageMode,
  syncReady,
  syncError,
  onRetrySync,
  saving,
  onSave,
  onDelete,
  onNavigate,
  onSettings,
  categoryOptions,
  onAddCategory,
}) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [draft, setDraft] = useState(() => blankExpense(selectedMonth));
  const [formError, setFormError] = useState("");
  const addButtonRef = useRef(null);
  const firstFieldRef = useRef(null);
  const dialogRef = useRef(null);
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const connectedSaveDisabled = storageMode === "google" && !syncReady;
  const canSave = !saving && !connectedSaveDisabled;

  useEffect(() => {
    if (!formOpen) return undefined;
    const previousFocus = document.activeElement;
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
    function closeOnEscape(event) {
      if (event.key === "Escape" && !savingRef.current) closeForm();
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)") || [])];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [formOpen]);

  function openCreateForm() {
    if (connectedSaveDisabled) {
      onSettings();
      return;
    }
    setEditingExpense(null);
    setDraft(blankExpense(selectedMonth));
    setFormError("");
    setFormOpen(true);
  }

  function openEditForm(expense) {
    if (connectedSaveDisabled) return;
    setEditingExpense(expense);
    setDraft({ ...blankExpense(selectedMonth), ...expense, amount: String(expense.amount), dueDay: String(expense.dueDay), endMode: expense.endMonth ? "ends" : "open" });
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (savingRef.current) return;
    setFormOpen(false);
    setFormError("");
  }

  function updateDraft(field, value) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "endMode" && value === "ends" && !next.endMonth) next.endMonth = next.startMonth;
      if (field === "startMonth" && next.endMode === "ends" && next.endMonth && next.endMonth < value) next.endMonth = value;
      return next;
    });
    setFormError("");
  }

  async function submitForm(event) {
    event.preventDefault();
    const amount = Number(String(draft.amount).replaceAll(",", ""));
    if (!draft.name.trim()) return setFormError("ใส่ชื่อรายการก่อนนะ เช่น ค่าเช่าบ้าน หรืออินเทอร์เน็ต");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return setFormError("ตรวจยอดรายจ่ายให้เป็นจำนวนเงินที่มากกว่า 0");
    if (!Number.isInteger(Number(draft.dueDay)) || Number(draft.dueDay) < 1 || Number(draft.dueDay) > 31) return setFormError("เลือกวันที่ครบกำหนดระหว่างวันที่ 1–31");
    if (!isValidMonth(draft.startMonth)) return setFormError("เลือกเดือนที่เริ่มชำระให้ถูกต้อง");
    if (draft.endMode === "ends" && (!isValidMonth(draft.endMonth) || draft.endMonth < draft.startMonth)) return setFormError("เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่มชำระ");

    let result;
    try {
      result = await onSave({
        ...(editingExpense ? { id: editingExpense.id } : {}),
        name: draft.name.trim(),
        amount: Math.round(amount * 100) / 100,
        category: draft.category,
        dueDay: Number(draft.dueDay),
        startMonth: draft.startMonth,
        endMonth: draft.endMode === "ends" ? draft.endMonth : "",
        note: draft.note.trim(),
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "บันทึกรายจ่ายไม่สำเร็จ ลองอีกครั้งนะ");
      return;
    }
    if (result === true || result?.ok === true) {
      setFormOpen(false);
      setEditingExpense(null);
      setFormError("");
    } else {
      setFormError(result?.error || "บันทึกไม่สำเร็จ รายการยังไม่ถูกบันทึก ลองอีกครั้งนะ");
    }
  }

  const groups = commitmentGroups.map((group) => ({
    ...group,
    entries: summary.entries.filter((entry) => entry.type === group.key),
    count: summary.counts[group.key],
    total: summary.totals[group.key],
  }));
  const duration = draft.endMode === "ends" ? recurringExpenseDurationMonths(draft.startMonth, draft.endMonth) : 0;

  function toggleGroup(key, hasEntries) {
    setExpandedGroups((current) => ({ ...current, [key]: !(current[key] ?? hasEntries) }));
  }

  function openGroupDestination(key) {
    if (key === "fixed") openCreateForm();
    else onNavigate(key === "installment" ? "installments" : "subscriptions");
  }

  return (
    <div className="page-stack recurring-page">
      <section className="commitment-hero" aria-labelledby="commitment-total-title">
        <div className="commitment-hero-copy">
          <h2 id="commitment-total-title">ยอดตามกำหนดในเดือนนี้</h2>
          <strong className="commitment-total">฿ {moneyLabel(summary.total)}</strong>
          <span className="commitment-count">
            {summary.count ? `${summary.count} รายการ · บิลประจำ ผ่อนสินค้า และบริการ` : "เพิ่มรายการเพื่อเริ่มดูยอดรวม"}
          </span>
        </div>
        <img className="commitment-illustration" src="/illustrations/finance-wallet.avif" alt="" aria-hidden="true" />
      </section>

      <button ref={addButtonRef} className="primary-button commitment-add-button" type="button" onClick={openCreateForm} disabled={connectedSaveDisabled}>
        <Icon name="plus" size={21} />เพิ่มรายจ่ายคงที่
      </button>

      {storageMode === "google" && !syncReady && (
        <aside className="recurring-sync-notice" role="status">
          <span className="recurring-sync-icon"><Icon name="info" size={18} /></span>
          <div><strong>ยังเชื่อมข้อมูลรายจ่ายประจำไม่ได้</strong><small>{syncError || "อัปเดต Apps Script ให้รองรับรายการรายจ่ายประจำ แล้วลองโหลดอีกครั้ง"}</small></div>
          <button className="secondary-button" type="button" onClick={onRetrySync}>ลองอีกครั้ง</button>
        </aside>
      )}

      {summary.count === 0 && (
        <p className="commitment-empty-note">
          <Icon name="info" size={16} /> ยอดนี้คำนวณจากกำหนดรายเดือน ไม่ใช่ยอดเงินคงเหลือในบัญชี
        </p>
      )}

      <section className="commitment-section" aria-labelledby="commitment-groups-title">
        <header className="commitment-section-heading">
          <h2 id="commitment-groups-title">แยกตามประเภท</h2>
          <span>แตะกลุ่มเพื่อดูวันจ่ายและระยะเวลา</span>
        </header>
        <div className="commitment-groups">
          {groups.map((group) => {
            const expanded = expandedGroups[group.key] ?? group.count > 0;
            const panelId = `commitment-group-${group.key}-items`;
            return (
              <section className={`commitment-group ${group.tone}`} key={group.key}>
                <button
                  className="commitment-group-trigger"
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  aria-label={`${group.label}, ${group.count} ${group.countLabel}, ฿${moneyLabel(group.total)}`}
                  onClick={() => toggleGroup(group.key, group.count > 0)}
                >
                  <span className="commitment-group-icon"><Icon name={group.icon} size={25} /></span>
                  <span className="commitment-group-label">
                    <strong>{group.label}</strong>
                    <small>{group.count} {group.countLabel}</small>
                  </span>
                  <strong className="commitment-group-total">฿ {moneyLabel(group.total)}</strong>
                  <span className={`commitment-group-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true"><Icon name="chevronRight" size={19} /></span>
                </button>
                {expanded && (
                  <div className="commitment-group-body" id={panelId}>
                    {group.entries.length ? (
                      <div className="commitment-entry-list">
                        {group.entries.map((entry) => {
                          const visual = categoryVisual(entry.category, entry.type);
                          return (
                            <article className={`commitment-entry ${entry.paid ? "is-paid" : ""}`} key={entry.id}>
                              <span className={`commitment-entry-icon ${visual.tone}`}><Icon name={visual.icon} size={20} /></span>
                              <div className="commitment-entry-main">
                                <div className="commitment-entry-name">
                                  <strong>{entry.name}</strong>
                                  {entry.paid && <span className="commitment-paid-badge"><Icon name="check" size={12} />ชำระแล้ว</span>}
                                </div>
                                <span className="commitment-entry-detail">{commitmentDetail(entry)}</span>
                              </div>
                              <div className="commitment-entry-trailing">
                                <strong className="commitment-entry-amount">฿ {moneyLabel(entry.amount)}</strong>
                                {entry.type === "fixed" && (
                                  <div className="commitment-entry-actions">
                                    <button className="icon-button" type="button" onClick={() => openEditForm(entry.source)} disabled={connectedSaveDisabled} aria-label={`แก้ไข ${entry.name}`} title="แก้ไข"><Icon name="edit" size={17} /></button>
                                    <button className="icon-button commitment-delete-action" type="button" onClick={() => onDelete(entry.source)} disabled={connectedSaveDisabled} aria-label={`ลบ ${entry.name}`} title="ลบ"><Icon name="trash" size={17} /></button>
                                  </div>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="commitment-group-empty">
                        <span>ยังไม่มี{group.label}ในเดือนนี้</span>
                        <button type="button" onClick={() => openGroupDestination(group.key)} disabled={connectedSaveDisabled && group.key === "fixed"}>
                          {group.key === "fixed" ? "เพิ่มรายการ" : group.key === "installment" ? "เพิ่มแผนผ่อน" : "เพิ่มบริการ"}
                          <Icon name="chevronRight" size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>

      {formOpen && (
        <div className="modal-backdrop recurring-form-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeForm()}>
          <section ref={dialogRef} className="recurring-form-dialog" role="dialog" aria-modal="true" aria-labelledby="recurring-form-title" aria-describedby="recurring-form-description">
            <header className="modal-header recurring-form-header">
              <div><span className="modal-kicker">จัดการบิลประจำ</span><h2 id="recurring-form-title">{editingExpense ? "แก้ไขรายจ่ายคงที่" : "เพิ่มรายจ่ายคงที่"}</h2><p id="recurring-form-description">บันทึกครั้งเดียว แล้วระบบจะรวมยอดในเดือนที่เลือกให้อัตโนมัติ</p></div>
              <button className="icon-button" type="button" aria-label="ปิดหน้าต่าง" onClick={closeForm} disabled={saving}><Icon name="close" size={20} /></button>
            </header>
            <form onSubmit={submitForm}>
              <div className="recurring-form-body">
                <div className="recurring-live-preview"><span className="recurring-preview-icon"><Icon name="calendar" size={19} /></span><span><small>ยอดต่อเดือน</small><strong>฿ {formatNumber(Number(draft.amount) || 0)}</strong></span><span className="recurring-preview-date"><Icon name="clock" size={14} />ทุกวันที่ {draft.dueDay}</span></div>
                <label className="recurring-form-field"><span>ชื่อรายการ <i>*</i></span><input ref={firstFieldRef} type="text" value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} maxLength={120} placeholder="เช่น ค่าเช่าบ้าน, อินเทอร์เน็ต" required /></label>
                <div className="recurring-form-two-col">
                  <label className="recurring-form-field"><span>จำนวนเงินต่อเดือน <i>*</i></span><div className="recurring-money-input"><span>฿</span><input type="number" inputMode="decimal" value={draft.amount} onChange={(event) => updateDraft("amount", event.target.value)} min="0.01" max="100000000" step="0.01" placeholder="0.00" required /></div></label>
                  <CategorySelect className="recurring-form-field" label="หมวดหมู่" scope="recurringExpenses" value={draft.category} options={categoryOptions || recurringExpenseCategories} onChange={(value) => updateDraft("category", value)} onAddCategory={onAddCategory} />
                </div>
                <div className="recurring-form-two-col">
                  <label className="recurring-form-field"><span>วันที่ครบกำหนด</span><select value={draft.dueDay} onChange={(event) => updateDraft("dueDay", event.target.value)}>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>วันที่ {index + 1}{index === 30 ? " (เดือนสั้นจะปรับเป็นวันสุดท้าย)" : ""}</option>)}</select></label>
                  <label className="recurring-form-field"><span>เริ่มชำระตั้งแต่เดือน</span><input type="month" value={draft.startMonth} onChange={(event) => updateDraft("startMonth", event.target.value)} required /></label>
                </div>
                <fieldset className="recurring-end-fieldset">
                  <legend>ระยะเวลาที่ต้องจ่าย</legend>
                  <div className="recurring-end-options">
                    <label className={draft.endMode === "open" ? "selected" : ""}><input type="radio" name="recurring-end-mode" value="open" checked={draft.endMode === "open"} onChange={() => updateDraft("endMode", "open")} /><span className="recurring-radio-dot" /><span><strong>จ่ายต่อเนื่อง</strong><small>ยังไม่กำหนดเดือนสิ้นสุด</small></span></label>
                    <label className={draft.endMode === "ends" ? "selected" : ""}><input type="radio" name="recurring-end-mode" value="ends" checked={draft.endMode === "ends"} onChange={() => updateDraft("endMode", "ends")} /><span className="recurring-radio-dot" /><span><strong>มีเดือนสิ้นสุด</strong><small>ใช้กับสัญญาหรือรายการที่มีกำหนด</small></span></label>
                  </div>
                  {draft.endMode === "ends" && <label className="recurring-form-field recurring-end-month"><span>เดือนสุดท้ายที่ต้องจ่าย</span><input type="month" min={draft.startMonth} value={draft.endMonth || draft.startMonth} onChange={(event) => updateDraft("endMonth", event.target.value)} required /></label>}
                  <div className="recurring-duration-preview"><Icon name="info" size={15} />{draft.endMode === "ends" ? duration ? `รวม ${duration} เดือน · ระบบจะรวมยอดถึง ${getMonthLabel(draft.endMonth || draft.startMonth)}` : "เลือกเดือนสิ้นสุดที่ไม่ก่อนเดือนเริ่ม" : `เริ่ม ${getMonthLabel(draft.startMonth)} · ระบบจะรวมยอดต่อไปทุกเดือน`}</div>
                </fieldset>
                <label className="recurring-form-field"><span>หมายเหตุ <small>(ไม่บังคับ)</small></span><textarea rows="2" maxLength={500} value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} placeholder="เช่น หักบัญชีอัตโนมัติทุกเดือน" /></label>
                {formError && <div className="recurring-form-error" role="alert"><Icon name="info" size={16} />{formError}</div>}
              </div>
              <footer className="modal-footer recurring-form-footer">
                <button className="secondary-button" type="button" onClick={closeForm} disabled={saving}>ยกเลิก</button>
                <button className="primary-button" type="submit" disabled={!canSave}>{saving ? "กำลังบันทึก…" : <><Icon name="check" size={17} />{editingExpense ? "บันทึกการแก้ไข" : "บันทึกรายจ่าย"}</>}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
