import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { formatDate, formatNumber, getCurrentMonthValue, getMonthLabel, getTodayDate } from "./data";
import { buildDebtSchedule, makeDebtId, summarizeDebt, validateDebtInput } from "./debts";
import "./debt.css";

const priorityChoices = [
  { value: "high", label: "เร่งติดตาม", icon: "lightbulb" },
  { value: "normal", label: "สำคัญ", icon: "clock" },
  { value: "low", label: "ไม่เร่งด่วน", icon: "check" },
];

function thaiMoney(value) {
  return "฿" + formatNumber(value);
}

function bytesToBase64(value) {
  return String(value || "").split(",").pop() || "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านรูปไม่สำเร็จ ลองเลือกรูปอีกครั้ง"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function preparePhoto(file, previewUrl) {
  if (!file?.type?.startsWith("image/")) throw new Error("เลือกไฟล์รูปภาพเท่านั้น");
  const image = new Image();
  image.src = previewUrl || URL.createObjectURL(file);
  try {
    if (typeof image.decode === "function") await image.decode();
    else await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("เปิดรูปไม่ได้"));
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("เปิดรูปไม่ได้");

    const maxDimension = 1500;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("เตรียมรูปไม่สำเร็จ");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob = await canvasBlob(canvas, 0.78);
    let quality = 0.68;
    while (blob && blob.size > 440_000 && quality >= 0.44) {
      blob = await canvasBlob(canvas, quality);
      quality -= 0.08;
    }
    if (!blob || blob.size > 480_000) throw new Error("รูปยังมีขนาดใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง");
    const dataUrl = await fileToDataUrl(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
    return { fileName: file.name || "evidence.jpg", mimeType: "image/jpeg", base64: bytesToBase64(dataUrl), previewUrl: previewUrl || URL.createObjectURL(file) };
  } finally {
    if (!previewUrl && image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
  }
}

function prepareSignature(dataUrl, fileName) {
  return {
    fileName: fileName || "signature.png",
    mimeType: "image/png",
    base64: bytesToBase64(dataUrl),
  };
}

function EvidenceThumbnail({ debtId, kind, index = 0, installmentNumber = 0, media, label, onLoad, onOpen }) {
  const [url, setUrl] = useState(media?.previewUrl || "");
  const [error, setError] = useState(false);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  useEffect(() => {
    if (media?.previewUrl) {
      setUrl(media.previewUrl);
      return undefined;
    }
    let active = true;
    let objectUrl = "";
    onLoadRef.current({ id: debtId, kind, index, installmentNumber }).then((preview) => {
      objectUrl = preview.url;
      if (active) setUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [debtId, kind, index, installmentNumber, media?.previewUrl]);

  return (
    <button className="debt-evidence-thumb" type="button" onClick={() => url && onOpen({ url, label })} disabled={!url} aria-label={"ดูภาพ" + label}>
      {url ? <img src={url} alt={label} /> : <span className="debt-evidence-placeholder"><Icon name={error ? "info" : "image"} size={19} /></span>}
      <small>{label}</small>
    </button>
  );
}

function SignaturePad({ label, value, onChange, hint }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const signedRef = useRef(Boolean(value));
  const contextRef = useRef(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const savedSignature = signedRef.current && canvas.width && canvas.height
        ? canvas.toDataURL("image/png")
        : valueRef.current;
      const scale = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      const context = canvas.getContext("2d");
      context.scale(scale, scale);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.2;
      context.strokeStyle = "#203a58";
      contextRef.current = context;
      if (savedSignature) {
        const image = new Image();
        image.onload = () => {
          if (contextRef.current === context) context.drawImage(image, 0, 0, rect.width, rect.height);
        };
        image.src = savedSignature;
        signedRef.current = true;
      } else {
        signedRef.current = false;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    return () => {
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, []);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event) {
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    const context = contextRef.current;
    if (!context) return;
    const location = point(event);
    context.beginPath();
    context.moveTo(location.x, location.y);
    context.arc(location.x, location.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(location.x, location.y);
    drawingRef.current = true;
    signedRef.current = true;
  }

  function move(event) {
    if (!drawingRef.current || !contextRef.current) return;
    event.preventDefault();
    const location = point(event);
    contextRef.current.lineTo(location.x, location.y);
    contextRef.current.stroke();
    signedRef.current = true;
  }

  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (signedRef.current) onChangeRef.current(canvasRef.current.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      signedRef.current = false;
      onChangeRef.current("");
    }
  }

  return (
    <div className="debt-signature-field">
      <div className="debt-signature-label">
        <span><Icon name="edit" size={16} />{label}</span>
        <button type="button" className="text-button" onClick={clear} disabled={!value}>ล้างลายเซ็น</button>
      </div>
      <canvas
        ref={canvasRef}
        className={"debt-signature-canvas" + (value ? " has-signature" : "")}
        aria-label={label}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      />
      {!value && <span className="debt-signature-placeholder">ใช้นิ้วหรือเมาส์เซ็นชื่อที่นี่</span>}
      {hint && <small>{hint}</small>}
    </div>
  );
}

function PhotoPicker({ items, onAdd, onRemove, onPreview, disabled, title, description, capture }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addFiles(fileList) {
    const selected = [...(fileList || [])];
    if (!selected.length) return;
    setError("");
    setBusy(true);
    try {
      const remaining = Math.max(0, 3 - items.length);
      if (selected.length > remaining) throw new Error("แนบภาพได้ไม่เกิน 3 รูป");
      const prepared = [];
      for (const file of selected) {
        const previewUrl = URL.createObjectURL(file);
        try {
          prepared.push(await preparePhoto(file, previewUrl));
        } catch (error) {
          URL.revokeObjectURL(previewUrl);
          throw error;
        }
      }
      onAdd(prepared);
    } catch (error) {
      setError(error.message || "เตรียมรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="debt-photo-field">
      <div className="debt-field-heading">
        <span>{title}</span>
        <small>{items.length}/3 รูป</small>
      </div>
      {description && <p className="debt-field-help">{description}</p>}
      <div className="debt-photo-grid">
        {items.map((item, index) => (
          <div className="debt-photo-item" key={item.fileName + "-" + index}>
            <button className="debt-photo-preview" type="button" onClick={() => item.previewUrl && onPreview?.({ url: item.previewUrl, label: "ภาพหลักฐาน " + (index + 1) })} aria-label={"ดูรูป " + (index + 1)}>
              <img src={item.previewUrl || ""} alt={"หลักฐานรูปที่ " + (index + 1)} />
            </button>
            <button className="debt-photo-remove" type="button" onClick={() => onRemove(index)} aria-label="นำรูปนี้ออก"><Icon name="close" size={15} /></button>
          </div>
        ))}
        {items.length < 3 && (
          <button className="debt-photo-add" type="button" onClick={() => inputRef.current?.click()} disabled={disabled || busy}>
            <span className="debt-photo-add-icon"><Icon name={capture ? "camera" : "image"} size={21} /></span>
            <strong>{busy ? "กำลังเตรียมรูป…" : capture ? "ถ่ายหรือเลือกรูป" : "เพิ่มรูป"}</strong>
            <small>{items.length === 0 ? "JPG · PNG · WebP" : "เพิ่มได้อีก " + (3 - items.length) + " รูป"}</small>
          </button>
        )}
      </div>
      {error && <span className="debt-field-error" role="alert">{error}</span>}
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        capture={capture ? "environment" : undefined}
        onChange={(event) => addFiles(event.target.files)}
      />
    </div>
  );
}

function DebtSummaryCard({ icon, title, value, caption, tone }) {
  return (
    <article className={"debt-summary-card " + tone}>
      <span className="debt-summary-icon"><Icon name={icon} size={19} /></span>
      <span className="debt-summary-copy"><small>{title}</small><strong>{value}</strong><em>{caption}</em></span>
    </article>
  );
}

function NewDebtDialog({ saving, onClose, onCreate, onPreview }) {
  const [form, setForm] = useState(() => ({
    id: makeDebtId(), lender: "", borrower: "", loanDate: getTodayDate(),
    principal: "", hasInterest: false, interestRate: "", installments: "1",
    priority: "normal", note: "",
  }));
  const [photos, setPhotos] = useState([]);
  const [signature, setSignature] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [localError, setLocalError] = useState("");
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)), []);

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addPhotos(items) {
    setPhotos((current) => [...current, ...items].slice(0, 3));
  }

  async function submit(event) {
    event.preventDefault();
    setLocalError("");
    try {
      validateDebtInput({
        ...form,
        principal: Number(form.principal),
        interestRate: Number(form.interestRate || 0),
        installments: Number(form.installments),
      });
      if (!reviewing) {
        setReviewing(true);
        return;
      }
      const payload = {
        ...form,
        principal: Number(form.principal),
        interestRate: Number(form.interestRate || 0),
        installments: Number(form.installments),
        loanEvidence: photos.map(({ fileName, mimeType, base64 }) => ({ fileName, mimeType, base64 })),
        lenderSignature: signature ? prepareSignature(signature, "loan-signature.png") : null,
      };
      const saved = await onCreate(payload);
      if (saved) {
        photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        onClose();
      }
    } catch (error) {
      setLocalError(error.message || "กรุณาตรวจข้อมูลก่อนบันทึก");
      setReviewing(false);
    }
  }

  return (
    <div className="debt-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="debt-create-dialog" role="dialog" aria-modal="true" aria-labelledby="debt-create-title">
        <header className="debt-dialog-header">
          <div className="debt-dialog-heading">
            <span className="debt-dialog-mark"><Icon name={reviewing ? "shield" : "handCoins"} size={21} /></span>
            <div><small>{reviewing ? "ตรวจข้อมูลก่อนบันทึก" : "บันทึกครั้งเดียว · ปลอดภัย"}</small><h2 id="debt-create-title">{reviewing ? "ยืนยันรายการให้ถูกต้อง" : "เพิ่มรายการทวงหนี้"}</h2></div>
          </div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose} disabled={saving}><Icon name="close" size={19} /></button>
        </header>
        <form onSubmit={submit}>
          {!reviewing ? (
            <div className="debt-create-body">
              <div className="debt-form-section">
                <div className="debt-section-heading"><span className="debt-section-number">1</span><div><strong>ใครให้ยืม และใครเป็นผู้ยืม</strong><small>ใช้ชื่อที่จำได้ง่ายเพื่อค้นหารายการภายหลัง</small></div></div>
                <div className="debt-form-grid">
                  <label className="debt-field"><span>ผู้ให้ยืม</span><input autoComplete="name" maxLength="100" value={form.lender} onChange={(event) => change("lender", event.target.value)} placeholder="เช่น ฉัน" required /></label>
                  <label className="debt-field"><span>ผู้ยืม</span><input autoComplete="off" maxLength="100" value={form.borrower} onChange={(event) => change("borrower", event.target.value)} placeholder="ชื่อผู้ยืม" required /></label>
                  <label className="debt-field"><span>วันที่ยืม</span><input type="date" value={form.loanDate} max={getTodayDate()} onChange={(event) => change("loanDate", event.target.value)} required /></label>
                  <label className="debt-field"><span>จำนวนเงินต้น</span><span className="debt-input-prefix"><em>฿</em><input type="number" min="0.01" max="100000000" step="0.01" inputMode="decimal" value={form.principal} onChange={(event) => change("principal", event.target.value)} placeholder="0.00" required /></span></label>
                </div>
              </div>

              <div className="debt-form-section">
                <div className="debt-section-heading"><span className="debt-section-number">2</span><div><strong>เงื่อนไขการคืนเงิน</strong><small>งวดแรกเริ่มในเดือนถัดจากวันที่ยืม</small></div></div>
                <div className="debt-form-grid debt-terms-grid">
                  <fieldset className="debt-interest-field">
                    <legend>มีดอกเบี้ยหรือไม่</legend>
                    <div className="debt-segment-control">
                      {[{ value: false, label: "ไม่มีดอกเบี้ย" }, { value: true, label: "มีดอกเบี้ย" }].map((option) => (
                        <button key={String(option.value)} className={form.hasInterest === option.value ? "selected" : ""} type="button" onClick={() => change("hasInterest", option.value)} aria-pressed={form.hasInterest === option.value}>{option.label}</button>
                      ))}
                    </div>
                  </fieldset>
                  {form.hasInterest && <label className="debt-field"><span>ดอกเบี้ยรวมทั้งสัญญา (%)</span><span className="debt-input-suffix"><input type="number" min="0.01" max="100" step="0.01" inputMode="decimal" value={form.interestRate} onChange={(event) => change("interestRate", event.target.value)} placeholder="เช่น 3" required /><em>%</em></span></label>}
                  <label className="debt-field"><span>จำนวนงวดรายเดือน</span><span className="debt-input-suffix"><input type="number" min="1" max="120" step="1" inputMode="numeric" value={form.installments} onChange={(event) => change("installments", event.target.value)} required /><em>งวด</em></span></label>
                </div>
                <div className="debt-live-amount">
                  <span><Icon name="calendar" size={17} />ยอดที่ต้องคืนโดยประมาณ</span>
                  <strong>{thaiMoney(Number(form.principal || 0) * (1 + (form.hasInterest ? Number(form.interestRate || 0) / 100 : 0)))}</strong>
                  <small>เฉลี่ย {thaiMoney((Number(form.principal || 0) * (1 + (form.hasInterest ? Number(form.interestRate || 0) / 100 : 0))) / Math.max(1, Number(form.installments || 1)))} / เดือน</small>
                </div>
              </div>

              <div className="debt-form-section">
                <div className="debt-section-heading"><span className="debt-section-number">3</span><div><strong>ตั้งความสำคัญและเก็บรายละเอียด</strong><small>เพิ่มหลักฐานหรือหมายเหตุได้ตามต้องการ</small></div></div>
                <fieldset className="debt-priority-field">
                  <legend>ความสำคัญในการติดตาม</legend>
                  <div className="debt-priority-options">
                    {priorityChoices.map((option) => (
                      <button key={option.value} className={"debt-priority-option " + option.value + (form.priority === option.value ? " selected" : "")} type="button" onClick={() => change("priority", option.value)} aria-pressed={form.priority === option.value}>
                        <Icon name={option.icon} size={17} /><span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <PhotoPicker
                  items={photos}
                  onAdd={addPhotos}
                  onPreview={onPreview}
                  onRemove={(index) => {
                    const photo = photos[index];
                    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
                    setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
                  }}
                  disabled={saving}
                  title="ภาพตอนให้ยืม"
                  description="แนบสัญญา สลิป หรือภาพที่ช่วยยืนยันได้สูงสุด 3 รูป"
                />
                <label className="debt-field"><span>หมายเหตุ</span><textarea maxLength="500" value={form.note} onChange={(event) => change("note", event.target.value)} placeholder="รายละเอียดที่ควรจำ เช่น วัตถุประสงค์หรือข้อตกลงเพิ่มเติม" /></label>
                <SignaturePad label="ลายเซ็นผู้ยืม (ถ้ามี)" value={signature} onChange={setSignature} hint="ใช้ยืนยันข้อตกลงตอนให้ยืม" />
              </div>
              {localError && <div className="debt-form-error" role="alert"><Icon name="info" size={17} />{localError}</div>}
              <div className="debt-lock-note"><Icon name="shield" size={17} /><span><strong>บันทึกแล้วแก้ไขหรือลบไม่ได้</strong><small>ตรวจชื่อ จำนวนเงิน และเงื่อนไขก่อนยืนยันอีกครั้ง</small></span></div>
            </div>
          ) : (
            <div className="debt-create-review">
              <p>โปรดตรวจรายการนี้ให้ครบ เมื่อยืนยันแล้วจะเก็บเป็นหลักฐานถาวร</p>
              <div className="debt-review-total"><small>ยอดคืนรวมโดยประมาณ</small><strong>{thaiMoney(Number(form.principal || 0) * (1 + (form.hasInterest ? Number(form.interestRate || 0) / 100 : 0)))}</strong></div>
              <dl className="debt-review-grid">
                <div><dt>ผู้ให้ยืม</dt><dd>{form.lender}</dd></div>
                <div><dt>ผู้ยืม</dt><dd>{form.borrower}</dd></div>
                <div><dt>วันที่ยืม</dt><dd>{formatDate(form.loanDate)}</dd></div>
                <div><dt>เงินต้น</dt><dd>{thaiMoney(form.principal)}</dd></div>
                <div><dt>ดอกเบี้ย</dt><dd>{form.hasInterest ? (form.interestRate || 0) + "% รวมทั้งสัญญา" : "ไม่มี"}</dd></div>
                <div><dt>จำนวนงวด</dt><dd>{form.installments} งวด · เริ่มเดือนถัดไป</dd></div>
                <div><dt>ความสำคัญ</dt><dd>{priorityChoices.find((item) => item.value === form.priority)?.label}</dd></div>
                <div><dt>แนบภาพ</dt><dd>{photos.length} รูป{signature ? " · มีลายเซ็น" : ""}</dd></div>
              </dl>
              {form.note && <div className="debt-review-note"><strong>หมายเหตุ</strong><p>{form.note}</p></div>}
              {localError && <div className="debt-form-error" role="alert"><Icon name="info" size={17} />{localError}</div>}
              <div className="debt-lock-note"><Icon name="shield" size={17} /><span><strong>ยืนยันแล้วจะไม่มีปุ่มแก้ไขหรือลบ</strong><small>หลังบันทึกจะทำได้เฉพาะยืนยันการชำระเป็นงวดเท่านั้น</small></span></div>
            </div>
          )}
          <footer className="debt-dialog-footer">
            {reviewing ? (
              <>
                <button className="secondary-button" type="button" onClick={() => { setReviewing(false); setLocalError(""); }} disabled={saving}>กลับไปตรวจ</button>
                <button className="primary-button debt-confirm-create" type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : <><Icon name="shield" size={17} />ยืนยันบันทึกหนี้</>}</button>
              </>
            ) : (
              <>
                <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>ยกเลิก</button>
                <button className="primary-button debt-confirm-create" type="submit" disabled={saving}><Icon name="check" size={17} />ตรวจข้อมูลก่อนบันทึก</button>
              </>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}

function RepaymentDialog({ debt, payment, saving, onClose, onSubmit, onPreview }) {
  const [photos, setPhotos] = useState([]);
  const [signature, setSignature] = useState("");
  const [paidAt, setPaidAt] = useState(getTodayDate());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)), []);
  const summary = summarizeDebt(debt);

  async function submit(event) {
    event.preventDefault();
    if (!photos.length) {
      setError("แนบภาพหลักฐานการรับชำระอย่างน้อย 1 รูป");
      return;
    }
    if (!signature) {
      setError("กรุณาเซ็นลายมือชื่อผู้คืนเงินก่อนบันทึก");
      return;
    }
    setError("");
    const saved = await onSubmit({
      id: debt.id,
      installmentNumber: payment.installmentNumber,
      paidAt,
      evidence: photos.map(({ fileName, mimeType, base64 }) => ({ fileName, mimeType, base64 })),
      signature: prepareSignature(signature, "payment-signature.png"),
      note,
    });
    if (saved) {
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      onClose();
    }
  }

  return (
    <div className="debt-modal-backdrop debt-repayment-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="debt-repayment-dialog" role="dialog" aria-modal="true" aria-labelledby="debt-repayment-title">
        <header className="debt-dialog-header">
          <div className="debt-dialog-heading"><span className="debt-dialog-mark repayment"><Icon name="check" size={21} /></span><div><small>บันทึกหลักฐานรายงวด</small><h2 id="debt-repayment-title">ยืนยันการชำระงวดนี้</h2></div></div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose} disabled={saving}><Icon name="close" size={19} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="debt-repayment-body">
            <div className="debt-repayment-receipt">
              <div><strong>{debt.borrower}</strong><small>งวดที่ {payment.installmentNumber} จาก {summary.installmentCount}</small></div>
              <strong>{thaiMoney(payment.amount)}</strong>
              <small>ครบกำหนด {formatDate(payment.dueDate)}</small>
            </div>
            <label className="debt-field"><span>วันที่ได้รับเงินคืน</span><input type="date" value={paidAt} min={debt.loanDate} max={getTodayDate()} onChange={(event) => setPaidAt(event.target.value)} required /></label>
            <PhotoPicker items={photos} onAdd={(items) => setPhotos((current) => [...current, ...items].slice(0, 3))} onRemove={(index) => { const photo = photos[index]; if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl); setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index)); }} onPreview={onPreview} disabled={saving} capture title="ภาพหลักฐานการชำระ" description="ถ่ายหรือเลือกรูปสลิป/หลักฐาน สูงสุด 3 รูป" />
            <SignaturePad label="ลายเซ็นผู้คืนเงิน" value={signature} onChange={setSignature} hint="ให้ผู้คืนเงินเซ็นรับรองก่อนบันทึก" />
            <label className="debt-field"><span>หมายเหตุการชำระ (ถ้ามี)</span><textarea maxLength="300" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น คืนเงินสด หรือโอนจากธนาคาร" /></label>
            {error && <div className="debt-form-error" role="alert"><Icon name="info" size={17} />{error}</div>}
            <div className="debt-lock-note"><Icon name="shield" size={17} /><span><strong>รายการชำระที่ยืนยันแล้วจะย้อนแก้ไม่ได้</strong><small>รูปและลายเซ็นจะถูกเก็บไว้กับรายการงวดนี้</small></span></div>
          </div>
          <footer className="debt-dialog-footer">
            <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>กลับไปตรวจ</button>
            <button className="primary-button debt-confirm-create" type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : <><Icon name="check" size={18} />ยืนยันรับชำระ</>}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function DebtDetailDialog({ debt, onClose, onPay, paying, onLoadEvidence, onOpenEvidence, onOpenPaymentProof }) {
  const [showAll, setShowAll] = useState(false);
  const summary = summarizeDebt(debt);
  const shownSchedule = showAll ? summary.schedule : summary.schedule.slice(0, 3);
  const importance = priorityChoices.find((item) => item.value === debt.priority) || priorityChoices[1];

  return (
    <div className="debt-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="debt-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="debt-detail-title">
        <header className="debt-dialog-header">
          <div className="debt-dialog-heading"><span className="debt-dialog-mark"><Icon name={summary.complete ? "check" : "handCoins"} size={21} /></span><div><small>รายละเอียดรายการ</small><h2 id="debt-detail-title">{debt.borrower}</h2></div></div>
          <button className="icon-button" type="button" aria-label="ปิดรายละเอียด" onClick={onClose}><Icon name="close" size={19} /></button>
        </header>
        <div className="debt-detail-body">
          <div className="debt-detail-total">
            <span>{summary.complete ? "คืนครบแล้ว" : "ยอดคงเหลือ"}</span>
            <strong>{thaiMoney(summary.remainingAmount)}</strong>
            <small>ยอดคืนรวม {thaiMoney(summary.totalAmount)} · ชำระแล้ว {summary.paidCount}/{summary.installmentCount} งวด</small>
          </div>
          <dl className="debt-detail-facts">
            <div><dt>ผู้ให้ยืม</dt><dd>{debt.lender}</dd></div>
            <div><dt>ผู้ยืม</dt><dd>{debt.borrower}</dd></div>
            <div><dt>วันที่ยืม</dt><dd>{formatDate(debt.loanDate)}</dd></div>
            <div><dt>เงินต้น</dt><dd>{thaiMoney(debt.principal)}</dd></div>
            <div><dt>ดอกเบี้ย</dt><dd>{debt.hasInterest ? thaiMoney(summary.totalAmount - debt.principal) + " (" + debt.interestRate + "%)" : "ไม่มี"}</dd></div>
            <div><dt>ความสำคัญ</dt><dd><span className={"debt-priority-chip " + importance.value}><Icon name={importance.icon} size={14} />{importance.label}</span></dd></div>
          </dl>
          {debt.note && <div className="debt-detail-note"><strong>หมายเหตุ</strong><p>{debt.note}</p></div>}

          {(debt.loanEvidence?.length > 0 || debt.lenderSignature) && (
            <section className="debt-detail-section">
              <div className="debt-detail-section-heading"><div><h3>หลักฐานตอนให้ยืม</h3><small>{debt.loanEvidence?.length || 0} ภาพ{debt.lenderSignature ? " · มีลายเซ็น" : ""}</small></div></div>
              <div className="debt-evidence-grid">
                {(debt.loanEvidence || []).map((media, index) => <EvidenceThumbnail key={"loan-" + index} debtId={debt.id} kind="loan-photo" index={index} media={media} label={"ภาพ " + (index + 1)} onLoad={onLoadEvidence} onOpen={onOpenEvidence} />)}
                {debt.lenderSignature && <EvidenceThumbnail debtId={debt.id} kind="loan-signature" media={debt.lenderSignature} label="ลายเซ็นผู้ยืม" onLoad={onLoadEvidence} onOpen={onOpenEvidence} />}
              </div>
            </section>
          )}

          <section className="debt-detail-section">
            <div className="debt-detail-section-heading">
              <div><h3>ตารางคืนเงิน</h3><small>งวดแรกเริ่มเดือนถัดจากวันที่ยืม</small></div>
              {summary.schedule.length > 3 && <button className="text-button" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "ย่อรายการ" : "ดูทั้งหมด " + summary.schedule.length + " งวด"}</button>}
            </div>
            <div className="debt-schedule-list">
              {shownSchedule.map((payment) => (
                <div className={"debt-schedule-row" + (payment.paid ? " paid" : "")} key={payment.installmentNumber}>
                  <span className="debt-schedule-index">{payment.paid ? <Icon name="check" size={15} /> : String(payment.installmentNumber).padStart(2, "0")}</span>
                  <span className="debt-schedule-copy"><strong>งวดที่ {payment.installmentNumber}</strong><small>{formatDate(payment.dueDate)} · {payment.paid ? "รับเงิน " + formatDate(payment.paidAt) : getMonthLabel(payment.month)}</small></span>
                  <strong className="debt-schedule-amount">{thaiMoney(payment.amount)}</strong>
                  {payment.paid
                    ? <button className="debt-proof-link" type="button" onClick={() => onOpenPaymentProof(payment)}><Icon name="image" size={15} />หลักฐาน</button>
                    : <button className="debt-pay-button" type="button" onClick={() => onPay(payment)} disabled={Boolean(paying)}>{paying === debt.id + ":" + payment.installmentNumber ? "กำลังบันทึก…" : "ยืนยันชำระ"}</button>}
                </div>
              ))}
            </div>
          </section>
          <div className="debt-record-lock"><Icon name="shield" size={16} /><span>ข้อมูลรายการนี้แก้ไขหรือลบไม่ได้</span></div>
        </div>
        <footer className="debt-detail-footer"><button className="secondary-button" type="button" onClick={onClose}>ปิดรายละเอียด</button></footer>
      </section>
    </div>
  );
}

function PaymentEvidenceDialog({ debt, payment, onClose, onLoadEvidence, onOpenEvidence }) {
  const count = payment.evidence?.length || 0;
  return (
    <div className="debt-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="debt-proof-dialog" role="dialog" aria-modal="true" aria-labelledby="debt-proof-title">
        <header className="debt-dialog-header"><div className="debt-dialog-heading"><span className="debt-dialog-mark repayment"><Icon name="image" size={20} /></span><div><small>หลักฐานการรับเงินคืน</small><h2 id="debt-proof-title">งวดที่ {payment.installmentNumber} · {debt.borrower}</h2></div></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><Icon name="close" size={19} /></button></header>
        <div className="debt-proof-body">
          <div className="debt-proof-summary"><strong>{thaiMoney(payment.amount)}</strong><span>รับเงินวันที่ {formatDate(payment.paidAt)}</span>{payment.note && <small>{payment.note}</small>}</div>
          <div className="debt-evidence-grid">
            {(payment.evidence || []).map((media, index) => <EvidenceThumbnail key={"payment-" + payment.installmentNumber + "-" + index} debtId={debt.id} kind="payment-photo" index={index} installmentNumber={payment.installmentNumber} media={media} label={"ภาพ " + (index + 1)} onLoad={onLoadEvidence} onOpen={onOpenEvidence} />)}
            {payment.signature && <EvidenceThumbnail debtId={debt.id} kind="payment-signature" installmentNumber={payment.installmentNumber} media={payment.signature} label="ลายเซ็น" onLoad={onLoadEvidence} onOpen={onOpenEvidence} />}
          </div>
        </div>
        <footer className="debt-detail-footer"><button className="secondary-button" type="button" onClick={onClose}>ปิด</button></footer>
      </section>
    </div>
  );
}

export default function DebtCollectionView({ debts, storageMode, syncReady, syncError, saving, paying, onRetrySync, onCreate, onRecordPayment, onLoadEvidence, onSettings }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [sortPriority, setSortPriority] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState("");
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [proofPayment, setProofPayment] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const selectedDebt = debts.find((debt) => debt.id === selectedDebtId) || null;
  const currentMonth = getCurrentMonthValue();
  const activeDebts = debts.filter((debt) => !summarizeDebt(debt).complete);
  const dueThisMonth = activeDebts.flatMap((debt) => summarizeDebt(debt).schedule.filter((payment) => !payment.paid && payment.month === currentMonth).map((payment) => ({ debt, payment })));
  const outstandingTotal = activeDebts.reduce((sum, debt) => sum + summarizeDebt(debt).remainingAmount, 0);
  const dueTotal = dueThisMonth.reduce((sum, item) => sum + item.payment.amount, 0);

  const visibleDebts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return debts.filter((debt) => {
      const summary = summarizeDebt(debt);
      if (filter === "active" && summary.complete) return false;
      if (filter === "complete" && !summary.complete) return false;
      return !query || [debt.lender, debt.borrower, debt.note].some((value) => String(value || "").toLocaleLowerCase().includes(query));
    }).sort((left, right) => {
      const leftSummary = summarizeDebt(left);
      const rightSummary = summarizeDebt(right);
      if (leftSummary.complete !== rightSummary.complete) return leftSummary.complete ? 1 : -1;
      if (sortPriority) {
        const rank = { high: 0, normal: 1, low: 2 };
        const difference = rank[left.priority] - rank[right.priority];
        if (difference) return difference;
      }
      return String(leftSummary.nextPayment?.dueDate || "").localeCompare(String(rightSummary.nextPayment?.dueDate || ""));
    });
  }, [debts, filter, search, sortPriority]);

  const syncBlocked = storageMode === "google" && !syncReady;

  async function openPaymentProof(payment) {
    setProofPayment(payment);
  }

  function showImage(item) {
    setLightbox(item);
  }

  return (
    <div className="page-stack debt-page">
      <header className="page-intro debt-page-intro">
        <div><h2>เงินที่ให้ยืม</h2><p>ติดตามยอดคงเหลือ กำหนดคืน และเก็บหลักฐานไว้ในที่เดียว</p></div>
        <button className="primary-button debt-add-button" type="button" onClick={() => setCreateOpen(true)} disabled={syncBlocked}><Icon name="plus" size={17} />เพิ่มรายการ</button>
      </header>

      {storageMode === "google" && !syncReady ? (
        <div className="debt-sync-notice" role="status">
          <span className="debt-sync-icon"><Icon name="info" size={18} /></span>
          <div><strong>{syncError || "ยังเชื่อมข้อมูลทวงหนี้ไม่ได้"}</strong><small>ต้องเผยแพร่ Apps Script เวอร์ชันที่รองรับแท็บนี้ก่อน รายการจะได้บันทึกลงชีตและ Drive</small></div>
          <button className="secondary-button" type="button" onClick={onRetrySync}><Icon name="restore" size={15} />ลองอีกครั้ง</button>
          <button className="text-button" type="button" onClick={onSettings}>สถานะการเชื่อมต่อ</button>
        </div>
      ) : (
        <div className={"debt-sync-ready " + (storageMode === "google" ? "connected" : "local")}><Icon name={storageMode === "google" ? "check" : "info"} size={15} /><span>{storageMode === "google" ? "ข้อมูลและหลักฐานเก็บใน Google Sheets และ Drive" : "โหมดทดลอง · ข้อมูลเก็บไว้ในอุปกรณ์นี้เท่านั้น"}</span></div>
      )}

      <section className="debt-summary-grid" aria-label="สรุปยอดทวงหนี้">
        <DebtSummaryCard icon="wallet" title="ยอดคงค้างทั้งหมด" value={thaiMoney(outstandingTotal)} caption={activeDebts.length + " รายการที่ยังไม่คืนครบ"} tone="green" />
        <DebtSummaryCard icon="calendar" title={"กำหนดคืนใน" + getMonthLabel(currentMonth)} value={thaiMoney(dueTotal)} caption={dueThisMonth.length + " งวดที่ยังไม่ชำระ"} tone="blue" />
        <DebtSummaryCard icon="handCoins" title="คืนครบแล้ว" value={String(debts.length - activeDebts.length) + " รายการ"} caption="เก็บประวัติและหลักฐานไว้" tone="lilac" />
      </section>

      <section className="debt-list-panel">
        <div className="debt-list-heading">
          <div><h3>รายการติดตาม</h3><span>{visibleDebts.length} จาก {debts.length} รายการ</span></div>
          <label className="debt-search"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อหรือหมายเหตุ" aria-label="ค้นหารายการทวงหนี้" />{search && <button type="button" aria-label="ล้างคำค้น" onClick={() => setSearch("")}><Icon name="close" size={15} /></button>}</label>
        </div>
        <div className="debt-list-controls">
          <div className="debt-filter-tabs" role="tablist" aria-label="กรองสถานะ">
            {[{ value: "active", label: "กำลังติดตาม" }, { value: "complete", label: "คืนครบแล้ว" }, { value: "all", label: "ทั้งหมด" }].map((item) => <button key={item.value} className={filter === item.value ? "active" : ""} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span>{item.value === "active" ? activeDebts.length : item.value === "complete" ? debts.length - activeDebts.length : debts.length}</span></button>)}
          </div>
          <button className="debt-sort-button" type="button" onClick={() => setSortPriority((value) => !value)} aria-pressed={sortPriority}><Icon name="filter" size={15} />{sortPriority ? "เรียงตามความสำคัญ" : "เรียงตามกำหนดคืน"}</button>
        </div>

        {visibleDebts.length ? (
          <div className="debt-table-wrap">
            <div className="debt-table-header"><span>ผู้ยืม</span><span>ยอดคงเหลือ</span><span>กำหนดคืนถัดไป</span><span>ความสำคัญ</span><span>สถานะ</span><span aria-label="เปิดรายละเอียด" /></div>
            <div className="debt-table-body">
              {visibleDebts.map((debt) => {
                const summary = summarizeDebt(debt);
                const priority = priorityChoices.find((item) => item.value === debt.priority) || priorityChoices[1];
                const currentDue = summary.nextPayment?.month === currentMonth && !summary.complete;
                return (
                  <button className="debt-table-row" type="button" key={debt.id} onClick={() => setSelectedDebtId(debt.id)} aria-label={"ดูรายละเอียดรายการของ " + debt.borrower}>
                    <span className="debt-row-person"><span className="debt-avatar"><Icon name="user" size={18} /></span><span><strong>{debt.borrower}</strong><small>ให้ยืมโดย {debt.lender}</small></span></span>
                    <strong className="debt-row-amount">{thaiMoney(summary.remainingAmount)}<small>จาก {thaiMoney(summary.totalAmount)}</small></strong>
                    <span className={"debt-row-due" + (currentDue ? " this-month" : "")}>{summary.complete ? "คืนครบแล้ว" : summary.nextPayment ? <><strong>{formatDate(summary.nextPayment.dueDate)}</strong><small>งวด {summary.nextPayment.installmentNumber}/{summary.installmentCount}</small></> : "—"}</span>
                    <span className={"debt-priority-chip " + priority.value}><Icon name={priority.icon} size={14} />{priority.label}</span>
                    <span className={"debt-status-chip " + (summary.complete ? "complete" : "open")}><Icon name={summary.complete ? "check" : "clock"} size={14} />{summary.complete ? "คืนครบแล้ว" : "กำลังติดตาม"}</span>
                    <Icon className="debt-row-chevron" name="chevronRight" size={17} />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="debt-empty-state">
            <span className="debt-empty-illustration"><Icon name="handCoins" size={26} /></span>
            <strong>{search ? "ไม่พบรายการที่ค้นหา" : filter === "complete" ? "ยังไม่มีรายการที่คืนครบ" : "ยังไม่มีรายการให้ติดตาม"}</strong>
            <small>{search ? "ลองค้นหาด้วยชื่อผู้ให้ยืมหรือหมายเหตุ" : "เพิ่มข้อมูลครั้งเดียว แล้วติดตามการคืนเงินได้ทุกงวด"}</small>
            {!search && filter !== "complete" && <button className="text-button" type="button" onClick={() => setCreateOpen(true)} disabled={syncBlocked}><Icon name="plus" size={16} />เพิ่มรายการทวงหนี้</button>}
          </div>
        )}
        <div className="debt-list-footnote"><Icon name="shield" size={15} /><span>ข้อมูลรายการหลักแก้ไขหรือลบไม่ได้ · ชำระแต่ละงวดพร้อมรูปและลายเซ็นยืนยัน</span></div>
      </section>

      {createOpen && <NewDebtDialog key="new-debt" saving={saving} onClose={() => setCreateOpen(false)} onCreate={onCreate} onPreview={showImage} />}
      {selectedDebt && <DebtDetailDialog debt={selectedDebt} onClose={() => { setSelectedDebtId(""); setSelectedPayment(null); }} onPay={setSelectedPayment} paying={paying} onLoadEvidence={onLoadEvidence} onOpenEvidence={showImage} onOpenPaymentProof={openPaymentProof} />}
      {selectedDebt && selectedPayment && <RepaymentDialog debt={selectedDebt} payment={selectedPayment} saving={paying === selectedDebt.id + ":" + selectedPayment.installmentNumber} onClose={() => setSelectedPayment(null)} onSubmit={onRecordPayment} onPreview={showImage} />}
      {selectedDebt && proofPayment && <PaymentEvidenceDialog debt={selectedDebt} payment={proofPayment} onClose={() => setProofPayment(null)} onLoadEvidence={onLoadEvidence} onOpenEvidence={showImage} />}
      {lightbox && <div className="debt-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.label} onMouseDown={(event) => event.target === event.currentTarget && setLightbox(null)} onKeyDown={(event) => event.key === "Escape" && setLightbox(null)} tabIndex={-1}><button className="debt-lightbox-close" type="button" aria-label="ปิดภาพ" onClick={() => setLightbox(null)}><Icon name="close" size={20} /></button><img src={lightbox.url} alt={lightbox.label} /><span>{lightbox.label}</span></div>}
    </div>
  );
}
