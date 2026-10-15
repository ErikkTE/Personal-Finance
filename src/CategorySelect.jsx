import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export default function CategorySelect({
  label,
  value,
  options,
  scope,
  onChange,
  onAddCategory,
  disabled = false,
  className = "",
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function addCategory() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("พิมพ์ชื่อหมวดหมู่ก่อน");
      return;
    }
    if (options.some((option) => normalize(option) === normalize(trimmed))) {
      setError("มีหมวดหมู่นี้อยู่แล้ว");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const savedName = await onAddCategory(scope, trimmed);
      if (!savedName) {
        setError("บันทึกหมวดหมู่ไม่สำเร็จ ลองอีกครั้งได้เลย");
        return;
      }
      onChange(typeof savedName === "string" ? savedName : trimmed);
      setName("");
      setAdding(false);
    } catch {
      setError("บันทึกหมวดหมู่ไม่สำเร็จ ลองอีกครั้งได้เลย");
    } finally {
      setSaving(false);
    }
  }

  function closeEditor() {
    if (saving) return;
    setAdding(false);
    setName("");
    setError("");
  }

  return (
    <div className={"category-field " + className}>
      <label className="category-field-label">
        <span>{label}</span>
        <select value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      {!disabled && (
        <button
          className="category-add-trigger"
          type="button"
          aria-expanded={adding}
          onClick={() => { setAdding((current) => !current); setError(""); }}
        >
          <Icon name="plus" size={14} />
          เพิ่มหมวดหมู่
        </button>
      )}
      {adding && (
        <div className="category-add-editor">
          <input
            ref={inputRef}
            type="text"
            value={name}
            maxLength={40}
            aria-label={"ชื่อหมวดหมู่ใหม่สำหรับ" + label}
            aria-invalid={Boolean(error)}
            placeholder="เช่น ดูแลสัตว์เลี้ยง"
            disabled={saving}
            onChange={(event) => { setName(event.target.value); setError(""); }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCategory();
              }
              if (event.key === "Escape") closeEditor();
            }}
          />
          <div className="category-add-actions">
            <button className="category-add-save" type="button" onClick={addCategory} disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button className="category-add-cancel" type="button" onClick={closeEditor} disabled={saving}>ยกเลิก</button>
          </div>
          {error && <span className="category-add-error" role="alert">{error}</span>}
        </div>
      )}
    </div>
  );
}
