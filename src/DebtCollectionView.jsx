import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { formatDate, formatNumber, getCurrentMonthValue, getMonthLabel, getTodayDate } from "./data";
import { buildDebtSchedule, debtEditSnapshot, daysBetweenDebtDates, makeDebtEventId, makeDebtId, summarizeDebt, validateDebtEventInput, validateDebtInput } from "./debts";
import "./debt.css";

const priorityChoices = [
  { value: "high", label: "เร่งติดตาม", icon: "lightbulb" },
  { value: "normal", label: "สำคัญ", icon: "clock" },
  { value: "low", label: "ไม่เร่งด่วน", icon: "check" },
];
const debtCorrectionLabels = {
  lender: "ผู้ให้ยืม", borrower: "ผู้ยืม", loanDate: "วันที่ยืม", principal: "เงินต้น",
  hasInterest: "ดอกเบี้ย", interestRate: "อัตราดอกเบี้ย", installments: "จำนวนงวด",
  priority: "ความสำคัญ", note: "หมายเหตุ",
};

function useDebtModalScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previousStyles = {
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
    };

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      html.style.overflow = previousStyles.htmlOverflow;
      html.style.overscrollBehavior = previousStyles.htmlOverscrollBehavior;
      body.style.position = previousStyles.bodyPosition;
      body.style.top = previousStyles.bodyTop;
      body.style.left = previousStyles.bodyLeft;
      body.style.right = previousStyles.bodyRight;
      body.style.width = previousStyles.bodyWidth;
      body.style.overflow = previousStyles.bodyOverflow;
      body.style.overscrollBehavior = previousStyles.bodyOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}

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

function EvidenceThumbnail({ debtId, kind, index = 0, installmentNumber = 0, paymentId = "", media, label, onLoad, onOpen }) {
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
    onLoadRef.current({ id: debtId, kind, index, installmentNumber, paymentId }).then((preview) => {
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
  }, [debtId, kind, index, installmentNumber, paymentId, media?.previewUrl]);

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
              <div className="debt-lock-note"><Icon name="shield" size={17} /><span><strong>แก้ไขภายหลังได้ แต่ลบรายการไม่ได้</strong><small>ทุกการแก้ไขจะเก็บค่าเดิมและเหตุผลไว้ในประวัติ</small></span></div>
            </div>
          ) : (
            <div className="debt-create-review">
              <p>ตรวจสอบข้อมูลก่อนบันทึก หากต้องแก้ภายหลัง ระบบจะเก็บรายละเอียดก่อนและหลังไว้ในประวัติ</p>
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
              <div className="debt-lock-note"><Icon name="shield" size={17} /><span><strong>แก้ไขได้โดยไม่ลบประวัติเดิม</strong><small>เมื่อเริ่มรับชำระแล้ว จะปรับได้เฉพาะชื่อ ความสำคัญ และหมายเหตุ</small></span></div>
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
  const [amount, setAmount] = useState(String(payment.remainingAmount ?? payment.amount ?? ""));
  const [eventId] = useState(makeDebtEventId);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)), []);
  const summary = summarizeDebt(debt);
  const earlyClose = payment.eventType === "earlyClose";
  const maximumAmount = Number(payment.remainingAmount ?? payment.amount ?? summary.remainingAmount);

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
    const receivedAmount = Number(amount);
    if (!Number.isFinite(receivedAmount) || receivedAmount <= 0 || receivedAmount > maximumAmount + 0.005) {
      setError("จำนวนเงินต้องมากกว่า 0 และไม่เกินยอดคงเหลือ " + thaiMoney(maximumAmount));
      return;
    }
    setError("");
    const saved = await onSubmit({
      id: debt.id,
      eventId,
      eventType: earlyClose ? "earlyClose" : "installment",
      installmentNumber: payment.installmentNumber,
      amount: receivedAmount,
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
          <div className="debt-dialog-heading"><span className="debt-dialog-mark repayment"><Icon name="check" size={21} /></span><div><small>{earlyClose ? "บันทึกการปิดยอด" : "บันทึกหลักฐานรายงวด"}</small><h2 id="debt-repayment-title">{earlyClose ? "ปิดหนี้ก่อนกำหนด" : "บันทึกรับชำระ"}</h2></div></div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose} disabled={saving}><Icon name="close" size={19} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="debt-repayment-body">
            <div className="debt-repayment-receipt">
              <div><strong>{debt.borrower}</strong><small>{earlyClose ? "ยอดหนี้คงเหลือทั้งหมด" : "งวดที่ " + payment.installmentNumber + " จาก " + summary.installmentCount}</small></div>
              <strong>{thaiMoney(maximumAmount)}</strong>
              <small>{earlyClose ? "ยอดที่ตกลงรับเพื่อปิดหนี้" : "ยอดคงเหลือของงวดนี้"}</small>
            </div>
            <label className="debt-field"><span>จำนวนเงินที่ได้รับ (บาท)</span><input type="number" min="0.01" max={maximumAmount} step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /><small className="debt-field-help">รับบางส่วนได้ · สูงสุด {thaiMoney(maximumAmount)}</small></label>
            <label className="debt-field"><span>วันที่ได้รับเงินคืน</span><input type="date" value={paidAt} min={debt.loanDate} max={getTodayDate()} onChange={(event) => setPaidAt(event.target.value)} required /></label>
            <PhotoPicker items={photos} onAdd={(items) => setPhotos((current) => [...current, ...items].slice(0, 3))} onRemove={(index) => { const photo = photos[index]; if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl); setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index)); }} onPreview={onPreview} disabled={saving} capture title="ภาพหลักฐานการชำระ" description="ถ่ายหรือเลือกรูปสลิป/หลักฐาน สูงสุด 3 รูป" />
            <SignaturePad label="ลายเซ็นผู้คืนเงิน" value={signature} onChange={setSignature} hint="ให้ผู้คืนเงินเซ็นรับรองก่อนบันทึก" />
            <label className="debt-field"><span>หมายเหตุการชำระ (ถ้ามี)</span><textarea maxLength="300" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น คืนเงินสด หรือโอนจากธนาคาร" /></label>
            {error && <div className="debt-form-error" role="alert"><Icon name="info" size={17} />{error}</div>}
            <div className="debt-lock-note"><Icon name="shield" size={17} /><span><strong>รายการรับชำระที่ยืนยันแล้วจะย้อนแก้ไม่ได้</strong><small>ทุกครั้งที่รับเงินจะเพิ่มเป็นบรรทัดใหม่พร้อมรูปและลายเซ็น</small></span></div>
          </div>
          <footer className="debt-dialog-footer">
            <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>กลับไปตรวจ</button>
            <button className="primary-button debt-confirm-create" type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : <><Icon name="check" size={18} />{earlyClose ? "ยืนยันปิดยอด" : "ยืนยันรับเงิน"}</>}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function DebtEventDialog({ debt, type, saving, onClose, onSubmit }) {
  const [note, setNote] = useState("");
  const [eventId] = useState(makeDebtEventId);
  const [error, setError] = useState("");
  const cancellation = type === "cancellation";

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (note.trim().length < 3) {
      setError("กรุณาเขียนเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }
    setError("");
    try {
      const saved = await onSubmit({ eventId, debtId: debt.id, type, referenceId: debt.id, note });
      if (saved) onClose();
      else setError("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } catch (submitError) {
      setError(submitError.message || "บันทึกไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง");
    }
  }

  return (
    <div className="debt-modal-backdrop debt-repayment-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="debt-event-dialog" role="dialog" aria-modal="true" aria-labelledby="debt-event-title">
        <header className="debt-dialog-header">
          <div className="debt-dialog-heading"><span className={"debt-dialog-mark " + (cancellation ? "cancel" : "repayment")}><Icon name={cancellation ? "info" : "edit"} size={20} /></span><div><small>บันทึกต่อท้ายรายการเดิม</small><h2 id="debt-event-title">{cancellation ? "ยกเลิกรายการทวงหนี้" : "เพิ่มบันทึกชี้แจง"}</h2></div></div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose} disabled={saving}><Icon name="close" size={19} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="debt-repayment-body">
              <div className={"debt-event-warning" + (cancellation ? " cancel" : "")}><Icon name={cancellation ? "info" : "shield"} size={18} /><span>{cancellation ? "ระบบจะเก็บข้อมูลต้นฉบับไว้ และติดป้ายว่ายกเลิก รายการที่รับชำระแล้วไม่สามารถยกเลิกได้" : "บันทึกนี้จะผูกกับรายการเดิมและแก้ย้อนหลังไม่ได้ หากข้อมูลหลักผิด ให้ใช้ปุ่มแก้ไขรายการเพื่อเก็บค่าเดิมและค่าใหม่ในประวัติ"}</span></div>
            <div className="debt-repayment-receipt"><div><strong>{debt.borrower}</strong><small>รายการอ้างอิง {debt.id}</small></div><strong>{thaiMoney(debt.principal)}</strong><small>เงินต้นเดิม</small></div>
            <label className="debt-field"><span>{cancellation ? "เหตุผลที่ยกเลิก" : "ข้อความชี้แจง"}</span><textarea value={note} onChange={(event) => { setNote(event.target.value); if (error) setError(""); }} minLength="3" maxLength="500" required aria-invalid={Boolean(error)} aria-describedby={error ? "debt-event-error" : undefined} placeholder={cancellation ? "เช่น สร้างรายการซ้ำ หรือระบุยอดผิดและจะบันทึกรายการใหม่" : "ระบุสิ่งที่ต้องการชี้แจง โดยข้อมูลต้นฉบับจะยังอยู่"} /></label>
            {error && <div id="debt-event-error" className="debt-form-error" role="alert"><Icon name="info" size={17} />{error}</div>}
          </div>
          <footer className="debt-dialog-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>กลับ</button><button className={cancellation ? "danger-button" : "primary-button debt-confirm-create"} type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : cancellation ? "ยืนยันยกเลิก" : "บันทึกชี้แจง"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function DebtEditDialog({ debt, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({
    ...debtEditSnapshot(debt),
    principal: String(debt.principal ?? ""),
    interestRate: String(debt.interestRate ?? ""),
    installments: String(debt.installments ?? "1"),
  }));
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [changesForReview, setChangesForReview] = useState({});
  const [error, setError] = useState("");
  const [eventId] = useState(makeDebtEventId);
  const hasPayments = summarizeDebt(debt).paymentEventCount > 0;

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function makeEvent() {
    const note = reason.trim();
    if (note.length < 3) throw new Error("กรุณาระบุเหตุผลการแก้ไขอย่างน้อย 3 ตัวอักษร");
    const normalized = validateDebtInput({
      ...form,
      id: debt.id,
      principal: Number(form.principal),
      interestRate: Number(form.interestRate || 0),
      installments: Number(form.installments),
    });
    const current = debtEditSnapshot(debt);
    const after = debtEditSnapshot(normalized);
    const changes = Object.fromEntries(Object.keys(current)
      .filter((key) => after[key] !== current[key])
      .map((key) => [key, after[key]]));
    if (!Object.keys(changes).length) throw new Error("ยังไม่มีข้อมูลที่เปลี่ยนแปลง");
    return validateDebtEventInput({
      eventId,
      debtId: debt.id,
      type: "correction",
      referenceId: debt.id,
      note,
      expected: current,
      changes,
    }, debt);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const correction = makeEvent();
      if (!reviewing) {
        setChangesForReview(correction.changes);
        setReviewing(true);
        return;
      }
      const saved = await onSubmit(correction);
      if (saved) onClose();
      else setError("บันทึกไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง");
    } catch (validationError) {
      setError(validationError.message || "กรุณาตรวจข้อมูลที่แก้ไข");
      setReviewing(false);
    }
  }

  function displayValue(key, value) {
    if (key === "principal") return thaiMoney(value);
    if (key === "loanDate") return formatDate(value);
    if (key === "hasInterest") return value ? "มีดอกเบี้ย" : "ไม่มีดอกเบี้ย";
    if (key === "interestRate") return value + "%";
    if (key === "installments") return value + " งวด";
    if (key === "priority") return priorityChoices.find((item) => item.value === value)?.label || value;
    return value || "—";
  }

  return (
    <div className="debt-modal-backdrop debt-repayment-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="debt-event-dialog debt-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="debt-edit-title">
        <header className="debt-dialog-header">
          <div className="debt-dialog-heading"><span className="debt-dialog-mark"><Icon name={reviewing ? "shield" : "edit"} size={20} /></span><div><small>เก็บประวัติทุกครั้ง · ลบรายการไม่ได้</small><h2 id="debt-edit-title">{reviewing ? "ตรวจการแก้ไข" : "แก้ไขรายการทวงหนี้"}</h2></div></div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose} disabled={saving}><Icon name="close" size={19} /></button>
        </header>
        <form onSubmit={submit}>
          {!reviewing ? (
            <div className="debt-repayment-body debt-edit-body">
              {hasPayments && <div className="debt-event-warning"><Icon name="info" size={18} /><span>รายการนี้เริ่มรับชำระแล้ว แก้ได้เฉพาะชื่อผู้ให้ยืม ผู้ยืม ความสำคัญ และหมายเหตุ เพื่อไม่ให้ยอดหรืองวดที่รับไปแล้วคลาดเคลื่อน</span></div>}
              <div className="debt-form-grid">
                <label className="debt-field"><span>ผู้ให้ยืม</span><input maxLength="100" value={form.lender} onChange={(event) => change("lender", event.target.value)} required /></label>
                <label className="debt-field"><span>ผู้ยืม</span><input maxLength="100" value={form.borrower} onChange={(event) => change("borrower", event.target.value)} required /></label>
                <label className="debt-field"><span>วันที่ยืม</span><input type="date" value={form.loanDate} max={getTodayDate()} disabled={hasPayments} onChange={(event) => change("loanDate", event.target.value)} required /></label>
                <label className="debt-field"><span>จำนวนเงินต้น</span><span className="debt-input-prefix"><em>฿</em><input type="number" min="0.01" max="100000000" step="0.01" inputMode="decimal" value={form.principal} disabled={hasPayments} onChange={(event) => change("principal", event.target.value)} required /></span></label>
                <fieldset className="debt-interest-field"><legend>มีดอกเบี้ยหรือไม่</legend><div className="debt-segment-control">{[{ value: false, label: "ไม่มีดอกเบี้ย" }, { value: true, label: "มีดอกเบี้ย" }].map((option) => <button key={String(option.value)} className={form.hasInterest === option.value ? "selected" : ""} type="button" disabled={hasPayments} onClick={() => change("hasInterest", option.value)} aria-pressed={form.hasInterest === option.value}>{option.label}</button>)}</div></fieldset>
                {form.hasInterest && <label className="debt-field"><span>ดอกเบี้ยรวมทั้งสัญญา (%)</span><span className="debt-input-suffix"><input type="number" min="0.01" max="100" step="0.01" inputMode="decimal" value={form.interestRate} disabled={hasPayments} onChange={(event) => change("interestRate", event.target.value)} required /><em>%</em></span></label>}
                <label className="debt-field"><span>จำนวนงวดรายเดือน</span><span className="debt-input-suffix"><input type="number" min="1" max="120" step="1" inputMode="numeric" value={form.installments} disabled={hasPayments} onChange={(event) => change("installments", event.target.value)} required /><em>งวด</em></span></label>
              </div>
              <fieldset className="debt-priority-field"><legend>ความสำคัญในการติดตาม</legend><div className="debt-priority-options">{priorityChoices.map((option) => <button key={option.value} className={"debt-priority-option " + option.value + (form.priority === option.value ? " selected" : "")} type="button" onClick={() => change("priority", option.value)} aria-pressed={form.priority === option.value}><Icon name={option.icon} size={16} /><span>{option.label}</span></button>)}</div></fieldset>
              <label className="debt-field"><span>หมายเหตุ</span><textarea maxLength="500" value={form.note} onChange={(event) => change("note", event.target.value)} placeholder="รายละเอียดหรือข้อตกลงเพิ่มเติม" /></label>
              <label className="debt-field"><span>เหตุผลที่แก้ไข</span><textarea minLength="3" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="เช่น แก้ชื่อผู้ยืมให้ถูกต้อง" required /></label>
              <div className="debt-lock-note"><Icon name="shield" size={17} /><span><strong>ค่าเดิมและค่าใหม่จะอยู่ในประวัติรายการ</strong><small>ภาพหลักฐานและลายเซ็นต้นฉบับจะคงเดิม ไม่ถูกแทนที่</small></span></div>
            </div>
          ) : (
            <div className="debt-create-review debt-edit-review">
              <p>ยืนยันข้อมูลที่จะเปลี่ยน ระบบจะเพิ่มบันทึกใหม่และเก็บข้อมูลเดิมไว้ตรวจสอบ</p>
              <dl className="debt-edit-diff-list">{Object.entries(changesForReview).map(([key, value]) => <div key={key}><dt>{debtCorrectionLabels[key]}</dt><dd><span>{displayValue(key, debtEditSnapshot(debt)[key])}</span><Icon name="chevronRight" size={15} /><strong>{displayValue(key, value)}</strong></dd></div>)}</dl>
              <div className="debt-review-note"><strong>เหตุผล</strong><p>{reason}</p></div>
              {error && <div className="debt-form-error" role="alert"><Icon name="info" size={17} />{error}</div>}
            </div>
          )}
          {!reviewing && error && <div className="debt-form-error debt-edit-inline-error" role="alert"><Icon name="info" size={17} />{error}</div>}
          <footer className="debt-dialog-footer">
            {reviewing ? <><button className="secondary-button" type="button" onClick={() => { setReviewing(false); setError(""); }} disabled={saving}>กลับไปแก้</button><button className="primary-button debt-confirm-create" type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : <><Icon name="check" size={17} />ยืนยันการแก้ไข</>}</button></> : <><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>ยกเลิก</button><button className="primary-button debt-confirm-create" type="submit" disabled={saving}><Icon name="edit" size={16} />ตรวจสอบการแก้ไข</button></>}
          </footer>
        </form>
      </section>
    </div>
  );
}

function reportText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function openDebtReport(debt, summary) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) return false;
  const paymentRows = (debt.payments || []).map((payment) => {
    const title = payment.eventType === "earlyClose" ? "ปิดยอดก่อนกำหนด" : "งวดที่ " + payment.installmentNumber;
    const files = [...(payment.evidence || []).map((file) => file.fileName || "ภาพหลักฐาน"), ...(payment.signature ? [payment.signature.fileName || "ลายเซ็น"] : [])];
    return `<tr><td>${reportText(title)}</td><td>${reportText(formatDate(payment.paidAt))}</td><td class="money">${reportText(thaiMoney(payment.amount))}</td><td>${reportText(payment.note || "—")}</td><td>${files.length ? files.map(reportText).join("<br>") : "ไม่มีไฟล์"}</td></tr>`;
  }).join("");
  const scheduleRows = summary.schedule.map((payment) => `<tr><td>${payment.installmentNumber}</td><td>${reportText(formatDate(payment.dueDate))}</td><td class="money">${reportText(thaiMoney(payment.amount))}</td><td class="money">${reportText(thaiMoney(payment.paidAmount))}</td><td>${summary.cancelled ? "ยกเลิกรายการ" : payment.settledByEarlyClose ? "ปิดยอดก่อนกำหนด" : payment.remainingAmount <= 0.005 ? "รับครบแล้ว" : "คงเหลือ " + reportText(thaiMoney(payment.remainingAmount))}</td></tr>`).join("");
  const eventRows = (debt.events || []).map((event) => `<li><strong>${event.type === "cancellation" ? "ยกเลิกรายการ" : event.type === "correction" ? "แก้ไขข้อมูลรายการ" : "บันทึกชี้แจง"}</strong> · ${reportText(formatDate(event.createdAt))}<br>${reportText(event.note)}${event.changes ? `<br>${reportText(Object.entries(event.changes).map(([key, value]) => `${debtCorrectionLabels[key] || key}: ${displayCorrectionValue(key, value)}`).join(" · "))}` : ""}</li>`).join("");
  const loanEvidence = [...(debt.loanEvidence || []).map((file) => file.fileName || "ภาพหลักฐานตอนยืม"), ...(debt.lenderSignature ? [debt.lenderSignature.fileName || "ลายเซ็นผู้ยืม"] : [])];
  const reportHtml = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ประวัติทวงหนี้ ${reportText(debt.id)}</title><style>
    *{box-sizing:border-box}body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#25364d;max-width:900px;margin:32px auto;padding:0 24px}h1{font-size:24px;margin:0}h2{font-size:17px;margin:25px 0 8px}small,.muted{color:#75859a}.brand{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #e6edf4;padding-bottom:14px}.toolbar{display:flex;justify-content:flex-end;margin:12px 0}.toolbar button{border:0;border-radius:10px;background:#2675df;color:white;font:inherit;padding:10px 16px;cursor:pointer}.facts,.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.fact,.total{border:1px solid #e5ebf2;border-radius:12px;padding:12px}.fact span,.total span{display:block;color:#75859a;font-size:12px}.total strong{font-size:18px}.note{white-space:pre-wrap;border-left:3px solid #8aaee4;padding:8px 12px;background:#f7faff}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}th,td{border-bottom:1px solid #e8edf3;text-align:left;vertical-align:top;padding:8px}th{background:#f5f8fb}.money{text-align:right;white-space:nowrap}.event-list{padding-left:20px}.event-list li{margin:8px 0}.evidence-index{background:#f7f9fc;border-radius:10px;padding:10px}.footer{margin-top:30px;padding-top:10px;border-top:1px solid #e8edf3;font-size:11px;color:#75859a}@media print{body{margin:0 auto;padding:0 8mm}.toolbar{display:none}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}@media(max-width:600px){body{padding:0 12px}.facts,.totals{grid-template-columns:repeat(2,1fr)}table{font-size:10px}}
    </style></head><body><div class="brand"><div><h1>ประวัติรายการทวงหนี้</h1><small>สร้างรายงานวันที่ ${reportText(formatDate(getTodayDate()))}</small></div><strong>${reportText(debt.id)}</strong></div><div class="toolbar"><button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div>
    <div class="facts"><div class="fact"><span>ผู้ให้ยืม</span><strong>${reportText(debt.lender)}</strong></div><div class="fact"><span>ผู้ยืม</span><strong>${reportText(debt.borrower)}</strong></div><div class="fact"><span>วันที่ยืม</span><strong>${reportText(formatDate(debt.loanDate))}</strong></div></div>
    <div class="totals"><div class="total"><span>เงินต้น</span><strong>${reportText(thaiMoney(debt.principal))}</strong></div><div class="total"><span>ยอดตามสัญญารวม</span><strong>${reportText(thaiMoney(summary.totalAmount))}</strong></div><div class="total"><span>ยอดคงเหลือ</span><strong>${reportText(thaiMoney(summary.remainingAmount))}</strong></div><div class="total"><span>รับเงินจริง</span><strong>${reportText(thaiMoney(summary.receivedAmount))}</strong></div><div class="total"><span>ดอกเบี้ย</span><strong>${debt.hasInterest ? reportText(debt.interestRate + "% · " + thaiMoney(summary.totalAmount - debt.principal)) : "ไม่มี"}</strong></div><div class="total"><span>สถานะ</span><strong>${summary.cancelled ? "ยกเลิกแล้ว" : summary.complete ? "ปิดยอดแล้ว" : summary.status === "overdue" ? "มีงวดค้างชำระ" : "กำลังติดตาม"}</strong></div></div>
    ${debt.note ? `<h2>หมายเหตุเดิม</h2><div class="note">${reportText(debt.note)}</div>` : ""}
    <h2>ตารางกำหนดคืน</h2><table><thead><tr><th>งวด</th><th>ครบกำหนด</th><th>ยอดตามงวด</th><th>รับแล้ว</th><th>สถานะ</th></tr></thead><tbody>${scheduleRows}</tbody></table>
    <h2>ประวัติรับชำระ</h2><table><thead><tr><th>รายการ</th><th>วันที่รับ</th><th>จำนวนเงิน</th><th>หมายเหตุ</th><th>รายการหลักฐานใน Drive</th></tr></thead><tbody>${paymentRows || `<tr><td colspan="5">ยังไม่มีประวัติรับชำระ</td></tr>`}</tbody></table>
    <h2>หลักฐานตอนยืม</h2><div class="evidence-index">${loanEvidence.length ? loanEvidence.map(reportText).join("<br>") : "ไม่มีไฟล์หลักฐานแนบ"}</div>
    ${eventRows ? `<h2>บันทึกเพิ่มเติม</h2><ul class="event-list">${eventRows}</ul>` : ""}
    <p class="footer">รายงานนี้สรุปจากข้อมูลที่บันทึกในแอป · ชื่อไฟล์หลักฐานแสดงเป็นสารบัญ ไฟล์ต้นฉบับยังจัดเก็บใน Google Drive</p></body></html>`;
  reportWindow.document.open();
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
  return true;
}

function DebtDetailDialog({ debt, onClose, onPay, onAddEvent, onEdit, paying, onLoadEvidence, onOpenEvidence, onOpenPaymentProof }) {
  const [showAll, setShowAll] = useState(false);
  const [exportError, setExportError] = useState("");
  const today = getTodayDate();
  const summary = summarizeDebt(debt, today);
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
            <span>{summary.cancelled ? "ยกเลิกรายการแล้ว" : summary.complete ? "คืนครบแล้ว" : "ยอดคงเหลือ"}</span>
            <strong>{thaiMoney(summary.remainingAmount)}</strong>
            <small>ยอดตามสัญญา {thaiMoney(summary.totalAmount)} · รับเงินจริง {thaiMoney(summary.receivedAmount)} · ครบ {summary.paidCount}/{summary.installmentCount} งวด</small>
          </div>
          {summary.earlyClose && <div className="debt-event-warning"><Icon name="check" size={17} /><span>ปิดหนี้ก่อนกำหนดเมื่อ {formatDate(summary.earlyClose.paidAt)} · รับจริง {thaiMoney(summary.earlyCloseAmount)}</span></div>}
          {summary.cancelled && <div className="debt-event-warning cancel"><Icon name="info" size={17} /><span>ยกเลิกรายการแล้ว · {debt.events?.find((event) => event.type === "cancellation")?.note || "เก็บประวัติต้นฉบับไว้"}</span></div>}
          <div className="debt-detail-actions">
            <button className="secondary-button" type="button" onClick={() => setExportError(openDebtReport(debt, summary) ? "" : "อนุญาตป๊อปอัปของแอปนี้เพื่อเปิดรายงาน PDF")}><Icon name="download" size={16} />ส่งออกประวัติ PDF</button>
            {!summary.cancelled && <button className="secondary-button" type="button" onClick={onEdit}><Icon name="edit" size={16} />แก้ไขข้อมูล</button>}
            {!summary.complete && !summary.cancelled && <button className="primary-button" type="button" onClick={() => onPay({ eventType: "earlyClose", installmentNumber: 0, amount: summary.remainingAmount, remainingAmount: summary.remainingAmount })}><Icon name="check" size={16} />ปิดยอดก่อนกำหนด</button>}
            {!summary.cancelled && <button className="secondary-button" type="button" onClick={() => onAddEvent("clarification")}><Icon name="edit" size={16} />เพิ่มบันทึกชี้แจง</button>}
            {!summary.cancelled && !summary.complete && summary.paymentEventCount === 0 && <button className="danger-button" type="button" onClick={() => onAddEvent("cancellation")}><Icon name="info" size={16} />ยกเลิกรายการ</button>}
          </div>
          {exportError && <div className="debt-form-error" role="status"><Icon name="info" size={16} />{exportError}</div>}
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
              {shownSchedule.map((payment) => {
                const overdue = !summary.cancelled && !payment.paid && payment.dueDate < today;
                const dueToday = !summary.cancelled && !payment.paid && payment.dueDate === today;
                const scheduleLabel = summary.cancelled
                  ? "รายการยกเลิก"
                  : payment.paid
                  ? payment.settledByEarlyClose ? "ปิดยอดก่อนกำหนด" : "รับเงิน " + formatDate(payment.paidAt)
                  : overdue
                    ? "เลยกำหนด " + daysBetweenDebtDates(payment.dueDate, today) + " วัน"
                    : dueToday
                      ? "ครบกำหนดวันนี้"
                      : getMonthLabel(payment.month);
                const latestPayment = payment.paymentEvents?.[payment.paymentEvents.length - 1] || (payment.evidence?.length || payment.signature ? payment : null);
                return (
                  <div className={"debt-schedule-row" + (summary.cancelled ? " cancelled" : payment.paid ? " paid" : overdue ? " overdue" : dueToday ? " due-today" : "")} key={payment.installmentNumber}>
                    <span className="debt-schedule-index">{payment.paid ? <Icon name="check" size={15} /> : String(payment.installmentNumber).padStart(2, "0")}</span>
                    <span className="debt-schedule-copy"><strong>งวดที่ {payment.installmentNumber}</strong><small>{formatDate(payment.dueDate)} · {scheduleLabel}{payment.paidAmount > 0 && payment.remainingAmount > 0 ? " · รับแล้ว " + thaiMoney(payment.paidAmount) : ""}</small></span>
                    <strong className="debt-schedule-amount">{summary.cancelled ? "—" : thaiMoney(payment.amount)}</strong>
                    {summary.cancelled
                      ? <span className="debt-schedule-amount">ยกเลิก</span>
                      : payment.paid
                      ? latestPayment ? <button className="debt-proof-link" type="button" onClick={() => onOpenPaymentProof(latestPayment)}><Icon name="image" size={15} />หลักฐาน</button> : <span className="debt-schedule-amount">รับครบ</span>
                      : <button className="debt-pay-button" type="button" onClick={() => onPay({ ...payment, eventType: "installment", amount: payment.remainingAmount, remainingAmount: payment.remainingAmount })} disabled={Boolean(paying) || summary.cancelled}>{paying === debt.id + ":" + payment.installmentNumber ? "กำลังบันทึก…" : payment.paidAmount > 0 ? "รับเพิ่ม" : "รับชำระ"}</button>}
                  </div>
                );
              })}
            </div>
          </section>
          {(debt.payments?.length > 0 || debt.events?.length > 0) && (
            <section className="debt-detail-section">
              <div className="debt-detail-section-heading"><div><h3>ประวัติรับชำระและบันทึก</h3><small>รายการต่อท้ายเรียงจากใหม่ไปเก่า</small></div></div>
              <div className="debt-event-history">
                {[...(debt.payments || []).map((payment) => ({ ...payment, historyKind: "payment" })), ...(debt.events || []).map((event) => ({ ...event, historyKind: event.type }))].sort((left, right) => String(right.paidAt || right.createdAt || "").localeCompare(String(left.paidAt || left.createdAt || ""))).map((event) => (
                  <div className="debt-event-history-row" key={event.eventId || event.id || "legacy-payment-" + event.installmentNumber + "-" + event.paidAt}>
                    <span className="debt-event-history-icon"><Icon name={event.historyKind === "cancellation" ? "info" : event.historyKind === "clarification" || event.historyKind === "correction" ? "edit" : "check"} size={16} /></span>
                    <span><strong>{event.historyKind === "cancellation" ? "ยกเลิกรายการ" : event.historyKind === "clarification" ? "บันทึกชี้แจง" : event.historyKind === "correction" ? "แก้ไขข้อมูลรายการ" : event.eventType === "earlyClose" ? "ปิดยอดก่อนกำหนด" : "รับเงินงวดที่ " + event.installmentNumber}</strong><small>{formatDate(event.paidAt || event.createdAt)}{event.note ? " · " + event.note : ""}</small>{event.historyKind === "correction" && event.changes && <small className="debt-correction-summary">{Object.entries(event.changes).map(([key, value]) => `${debtCorrectionLabels[key] || key}: ${displayCorrectionValue(key, value)}`).join(" · ")}</small>}</span>
                    {event.historyKind === "payment" && <><strong>{thaiMoney(event.amount)}</strong><button className="debt-proof-link" type="button" onClick={() => onOpenPaymentProof(event)}><Icon name="image" size={15} />หลักฐาน</button></>}
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="debt-record-lock"><Icon name="shield" size={16} /><span>แก้ไขได้โดยเก็บประวัติเดิมไว้ · ลบรายการและหลักฐานต้นฉบับไม่ได้</span></div>
        </div>
        <footer className="debt-detail-footer"><button className="secondary-button" type="button" onClick={onClose}>ปิดรายละเอียด</button></footer>
      </section>
    </div>
  );
}

function displayCorrectionValue(key, value) {
  if (key === "principal") return thaiMoney(value);
  if (key === "loanDate") return formatDate(value);
  if (key === "hasInterest") return value ? "มี" : "ไม่มี";
  if (key === "interestRate") return value + "%";
  if (key === "installments") return value + " งวด";
  if (key === "priority") return priorityChoices.find((item) => item.value === value)?.label || value;
  return value || "—";
}

function PaymentEvidenceDialog({ debt, payment, onClose, onLoadEvidence, onOpenEvidence }) {
  const paymentTitle = payment.eventType === "earlyClose" ? "ปิดยอดก่อนกำหนด" : "งวดที่ " + payment.installmentNumber;
  return (
    <div className="debt-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="debt-proof-dialog" role="dialog" aria-modal="true" aria-labelledby="debt-proof-title">
        <header className="debt-dialog-header"><div className="debt-dialog-heading"><span className="debt-dialog-mark repayment"><Icon name="image" size={20} /></span><div><small>หลักฐานการรับเงินคืน</small><h2 id="debt-proof-title">{paymentTitle} · {debt.borrower}</h2></div></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><Icon name="close" size={19} /></button></header>
        <div className="debt-proof-body">
          <div className="debt-proof-summary"><strong>{thaiMoney(payment.amount)}</strong><span>รับเงินวันที่ {formatDate(payment.paidAt)}</span>{payment.note && <small>{payment.note}</small>}</div>
          <div className="debt-evidence-grid">
            {(payment.evidence || []).map((media, index) => <EvidenceThumbnail key={(payment.eventId || payment.installmentNumber) + "-payment-" + index} debtId={debt.id} kind="payment-photo" index={index} installmentNumber={payment.installmentNumber} paymentId={payment.eventId || ""} media={media} label={"ภาพ " + (index + 1)} onLoad={onLoadEvidence} onOpen={onOpenEvidence} />)}
            {payment.signature && <EvidenceThumbnail debtId={debt.id} kind="payment-signature" installmentNumber={payment.installmentNumber} paymentId={payment.eventId || ""} media={payment.signature} label="ลายเซ็น" onLoad={onLoadEvidence} onOpen={onOpenEvidence} />}
          </div>
        </div>
        <footer className="debt-detail-footer"><button className="secondary-button" type="button" onClick={onClose}>ปิด</button></footer>
      </section>
    </div>
  );
}

export default function DebtCollectionView({ debts, storageMode, syncReady, syncError, saving, paying, onRetrySync, onCreate, onRecordPayment, onRecordEvent, onLoadEvidence, onSettings }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortPriority, setSortPriority] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState("");
  const [eventDialogType, setEventDialogType] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [proofPayment, setProofPayment] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const selectedDebt = debts.find((debt) => debt.id === selectedDebtId) || null;
  useDebtModalScrollLock(Boolean(createOpen || selectedDebt || proofPayment || lightbox));
  const today = getTodayDate();
  const currentMonth = getCurrentMonthValue();
  const summaryByDebtId = useMemo(() => new Map(debts.map((debt) => [debt.id, summarizeDebt(debt, today)])), [debts, today]);
  const activeDebts = debts.filter((debt) => !summaryByDebtId.get(debt.id)?.complete && !summaryByDebtId.get(debt.id)?.cancelled);
  const overdueDebts = activeDebts.filter((debt) => summaryByDebtId.get(debt.id)?.overdueCount > 0);
  const dueThisMonthDebts = activeDebts.filter((debt) => summaryByDebtId.get(debt.id)?.dueThisMonthCount > 0);
  const cancelledDebts = debts.filter((debt) => summaryByDebtId.get(debt.id)?.cancelled);
  const completedCount = debts.filter((debt) => summaryByDebtId.get(debt.id)?.complete).length;
  const outstandingTotal = activeDebts.reduce((sum, debt) => sum + summaryByDebtId.get(debt.id).remainingAmount, 0);
  const overdueTotal = overdueDebts.reduce((sum, debt) => sum + summaryByDebtId.get(debt.id).overdueAmount, 0);
  const overdueInstallmentCount = overdueDebts.reduce((sum, debt) => sum + summaryByDebtId.get(debt.id).overdueCount, 0);
  const dueThisMonth = activeDebts.reduce((sum, debt) => sum + summaryByDebtId.get(debt.id).dueThisMonthAmount, 0);
  const dueThisMonthCount = activeDebts.reduce((sum, debt) => sum + summaryByDebtId.get(debt.id).dueThisMonthCount, 0);
  const dueSoonCount = activeDebts.reduce((sum, debt) => sum + summaryByDebtId.get(debt.id).dueSoonCount, 0);
  const dueSoonAmount = activeDebts.reduce((sum, debt) => sum + summaryByDebtId.get(debt.id).dueSoonAmount, 0);

  const visibleDebts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return debts.filter((debt) => {
      const summary = summaryByDebtId.get(debt.id) || summarizeDebt(debt, today);
      if (filter === "dueThisMonth" && summary.dueThisMonthCount === 0) return false;
      if (filter === "overdue" && summary.overdueCount === 0) return false;
      if (filter === "complete" && !summary.complete) return false;
      if (filter === "cancelled" && !summary.cancelled) return false;
      return !query || [debt.lender, debt.borrower, debt.note, ...(debt.events || []).map((event) => event.note)].some((value) => String(value || "").toLocaleLowerCase().includes(query));
    }).sort((left, right) => {
      const leftSummary = summaryByDebtId.get(left.id) || summarizeDebt(left, today);
      const rightSummary = summaryByDebtId.get(right.id) || summarizeDebt(right, today);
      if (leftSummary.cancelled !== rightSummary.cancelled) return leftSummary.cancelled ? 1 : -1;
      if (leftSummary.complete !== rightSummary.complete) return leftSummary.complete ? 1 : -1;
      if ((leftSummary.overdueCount > 0) !== (rightSummary.overdueCount > 0)) return leftSummary.overdueCount > 0 ? -1 : 1;
      if (sortPriority) {
        const rank = { high: 0, normal: 1, low: 2 };
        const difference = rank[left.priority] - rank[right.priority];
        if (difference) return difference;
      }
      return String(leftSummary.nextPayment?.dueDate || "").localeCompare(String(rightSummary.nextPayment?.dueDate || ""));
    });
  }, [debts, filter, search, sortPriority, summaryByDebtId, today]);

  const syncBlocked = storageMode === "google" && !syncReady;

  async function openPaymentProof(payment) {
    setProofPayment(payment);
  }

  async function recordEvent(input) {
    return onRecordEvent(input);
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

      {(overdueInstallmentCount > 0 || dueSoonCount > 0) && <section className="debt-reminder-panel" aria-label="เตือนรายการทวงหนี้ในแอป" role="status">
        <span className="debt-reminder-icon"><Icon name="clock" size={19} /></span>
        <div><strong>เตือนติดตามรายการ</strong><small>{overdueInstallmentCount > 0 ? overdueInstallmentCount + " งวดค้าง " + thaiMoney(overdueTotal) : "ไม่มีงวดค้าง"}{dueSoonCount > 0 ? " · " + dueSoonCount + " งวดครบกำหนดใน 7 วัน " + thaiMoney(dueSoonAmount) : ""}</small></div>
        {overdueInstallmentCount > 0 && <button className="text-button" type="button" onClick={() => setFilter("overdue")}>ดูงวดค้าง</button>}
        {dueSoonCount > 0 && <button className="text-button" type="button" onClick={() => setFilter("dueThisMonth")}>ดูงวดใกล้ถึง</button>}
      </section>}

      <section className="debt-summary-grid" aria-label="สรุปยอดทวงหนี้">
        <DebtSummaryCard icon="wallet" title="ยอดคงค้างทั้งหมด" value={thaiMoney(outstandingTotal)} caption={activeDebts.length + " รายการที่ยังไม่คืนครบ"} tone="green" />
        <DebtSummaryCard icon="clock" title="เลยกำหนด" value={thaiMoney(overdueTotal)} caption={overdueInstallmentCount + " งวดที่ยังไม่ชำระ"} tone="rose" />
        <DebtSummaryCard icon="calendar" title="ครบกำหนดเดือนนี้" value={thaiMoney(dueThisMonth)} caption={dueThisMonthCount + " งวด · " + getMonthLabel(currentMonth)} tone="blue" />
        <DebtSummaryCard icon="handCoins" title="คืนครบแล้ว" value={String(completedCount) + " รายการ"} caption="เก็บประวัติและหลักฐานไว้" tone="lilac" />
      </section>

      <section className="debt-list-panel">
        <div className="debt-list-heading">
          <div><h3>รายการติดตาม</h3><span>{visibleDebts.length} จาก {debts.length} รายการ</span></div>
          <label className="debt-search"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อหรือหมายเหตุ" aria-label="ค้นหารายการทวงหนี้" />{search && <button type="button" aria-label="ล้างคำค้น" onClick={() => setSearch("")}><Icon name="close" size={15} /></button>}</label>
        </div>
        <div className="debt-list-controls">
          <div className="debt-filter-tabs" role="tablist" aria-label="กรองสถานะ">
            {[{ value: "dueThisMonth", label: "เดือนนี้", aria: "ครบกำหนดเดือนนี้" }, { value: "overdue", label: "ค้าง", aria: "งวดค้างชำระ" }, { value: "complete", label: "คืนครบ", aria: "คืนครบแล้ว" }, { value: "cancelled", label: "ยกเลิก", aria: "รายการยกเลิก" }, { value: "all", label: "ทั้งหมด", aria: "รายการทั้งหมด" }].map((item) => <button key={item.value} className={filter === item.value ? "active" : ""} type="button" role="tab" aria-label={item.aria} aria-selected={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span>{item.value === "dueThisMonth" ? dueThisMonthDebts.length : item.value === "overdue" ? overdueDebts.length : item.value === "complete" ? completedCount : item.value === "cancelled" ? cancelledDebts.length : debts.length}</span></button>)}
          </div>
          <button className="debt-sort-button" type="button" onClick={() => setSortPriority((value) => !value)} aria-pressed={sortPriority}><Icon name="filter" size={15} />{sortPriority ? "เรียงตามความสำคัญ" : "เรียงตามกำหนดคืน"}</button>
        </div>

        {visibleDebts.length ? (
          <div className="debt-table-wrap">
            <div className="debt-table-header"><span>ผู้ยืม</span><span>ยอดคงเหลือ</span><span>กำหนดคืนถัดไป</span><span>ความสำคัญ</span><span>สถานะ</span><span aria-label="เปิดรายละเอียด" /></div>
            <div className="debt-table-body">
              {visibleDebts.map((debt) => {
                const summary = summaryByDebtId.get(debt.id) || summarizeDebt(debt, today);
                const priority = priorityChoices.find((item) => item.value === debt.priority) || priorityChoices[1];
                const statusLabels = {
                  cancelled: "ยกเลิกแล้ว",
                  complete: "คืนครบแล้ว",
                  overdue: "เกินกำหนด " + summary.overdueCount + " งวด",
                  dueToday: "ครบกำหนดวันนี้",
                  dueThisMonth: "กำหนดเดือนนี้",
                  scheduled: "กำลังติดตาม",
                };
                const nextPayment = summary.nextPayment;
                const rowDueClass = summary.status === "cancelled" ? " cancelled" : summary.status === "overdue" ? " overdue" : summary.status === "dueToday" || summary.status === "dueThisMonth" ? " this-month" : "";
                return (
                  <button className="debt-table-row" type="button" key={debt.id} onClick={() => setSelectedDebtId(debt.id)} aria-label={"ดูรายละเอียดรายการของ " + debt.borrower}>
                    <span className="debt-row-person"><span className="debt-avatar"><Icon name="user" size={18} /></span><span><strong>{debt.borrower}</strong><small>ให้ยืมโดย {debt.lender}</small></span></span>
                    <strong className="debt-row-amount">{thaiMoney(summary.remainingAmount)}<small>จาก {thaiMoney(summary.totalAmount)}</small></strong>
                    <span className={"debt-row-due" + rowDueClass}>{summary.cancelled ? "ยกเลิกรายการ" : summary.complete ? "คืนครบแล้ว" : nextPayment ? <><strong>{formatDate(nextPayment.dueDate)}</strong><small>งวด {nextPayment.installmentNumber}/{summary.installmentCount}{nextPayment.remainingAmount < nextPayment.amount ? " · เหลือ " + thaiMoney(nextPayment.remainingAmount) : ""}</small>{summary.status === "overdue" && <em>เลยกำหนด {summary.overdueDays} วัน</em>}</> : "—"}</span>
                    <span className={"debt-priority-chip " + priority.value}><Icon name={priority.icon} size={14} />{priority.label}</span>
                    <span className={"debt-status-chip " + summary.status}><Icon name={summary.complete ? "check" : summary.cancelled ? "info" : "clock"} size={14} />{statusLabels[summary.status]}</span>
                    <Icon className="debt-row-chevron" name="chevronRight" size={17} />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="debt-empty-state">
            <span className="debt-empty-illustration"><Icon name="handCoins" size={26} /></span>
            <strong>{search ? "ไม่พบรายการที่ค้นหา" : filter === "complete" ? "ยังไม่มีรายการที่คืนครบ" : filter === "overdue" ? "ยังไม่มีงวดที่เกินกำหนด" : filter === "dueThisMonth" ? "เดือนนี้ไม่มีงวดครบกำหนด" : filter === "cancelled" ? "ยังไม่มีรายการยกเลิก" : "ยังไม่มีรายการทวงหนี้"}</strong>
            <small>{search ? "ลองค้นหาด้วยชื่อผู้ให้ยืม ผู้ยืม หรือบันทึกเพิ่มเติม" : filter === "overdue" ? "งวดที่เลยวันครบกำหนดจะแสดงอยู่ในหน้านี้" : filter === "dueThisMonth" ? "งวดที่ครบกำหนดในเดือนนี้จะแสดงอยู่ในหน้านี้" : "เพิ่มข้อมูลครั้งเดียว แล้วติดตามการคืนเงินได้ทุกงวด"}</small>
            {!search && !["complete", "cancelled"].includes(filter) && <button className="text-button" type="button" onClick={() => setCreateOpen(true)} disabled={syncBlocked}><Icon name="plus" size={16} />เพิ่มรายการทวงหนี้</button>}
          </div>
        )}
        <div className="debt-list-footnote"><Icon name="shield" size={15} /><span>แก้ไขข้อมูลได้โดยเก็บประวัติเดิมไว้ · รับชำระบางส่วน ปิดยอดก่อนกำหนด และแนบหลักฐานเป็นประวัติใหม่</span></div>
      </section>

      {createOpen && <NewDebtDialog key="new-debt" saving={saving} onClose={() => setCreateOpen(false)} onCreate={onCreate} onPreview={showImage} />}
      {selectedDebt && <DebtDetailDialog debt={selectedDebt} onClose={() => { setSelectedDebtId(""); setSelectedPayment(null); setEventDialogType(""); setEditOpen(false); }} onPay={setSelectedPayment} onAddEvent={setEventDialogType} onEdit={() => setEditOpen(true)} paying={paying} onLoadEvidence={onLoadEvidence} onOpenEvidence={showImage} onOpenPaymentProof={openPaymentProof} />}
      {selectedDebt && selectedPayment && <RepaymentDialog debt={selectedDebt} payment={selectedPayment} saving={paying === selectedDebt.id + ":" + (selectedPayment.eventType === "earlyClose" ? "close" : selectedPayment.installmentNumber)} onClose={() => setSelectedPayment(null)} onSubmit={onRecordPayment} onPreview={showImage} />}
      {selectedDebt && eventDialogType && <DebtEventDialog debt={selectedDebt} type={eventDialogType} saving={saving} onClose={() => setEventDialogType("")} onSubmit={recordEvent} />}
      {selectedDebt && editOpen && <DebtEditDialog key={selectedDebt.id + "-edit"} debt={selectedDebt} saving={saving} onClose={() => setEditOpen(false)} onSubmit={recordEvent} />}
      {selectedDebt && proofPayment && <PaymentEvidenceDialog debt={selectedDebt} payment={proofPayment} onClose={() => setProofPayment(null)} onLoadEvidence={onLoadEvidence} onOpenEvidence={showImage} />}
      {lightbox && <div className="debt-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.label} onMouseDown={(event) => event.target === event.currentTarget && setLightbox(null)} onKeyDown={(event) => event.key === "Escape" && setLightbox(null)} tabIndex={-1}><button className="debt-lightbox-close" type="button" aria-label="ปิดภาพ" onClick={() => setLightbox(null)}><Icon name="close" size={20} /></button><img src={lightbox.url} alt={lightbox.label} /><span>{lightbox.label}</span></div>}
    </div>
  );
}
