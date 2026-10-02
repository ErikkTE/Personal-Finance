const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

const NUMBER_TOKEN = String.raw`(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d{1,2})?`;
const CURRENCY_PATTERN = new RegExp(String.raw`(?:฿|THB)\s*(${NUMBER_TOKEN})|(${NUMBER_TOKEN})\s*(?:บาท|THB|฿)`, "gi");
const NUMBER_PATTERN = new RegExp(String.raw`(?<![\d/])${NUMBER_TOKEN}(?!\d)`, "g");
const AMOUNT_LABEL_PATTERN = /ยอดชำระสุทธิ|ยอดเงินสุทธิ|ยอดสุทธิ|จำนวนเงิน|ยอดชำระ|ยอดรับชำระ|ยอดโอน|ยอดเงิน|รวมทั้งสิ้น|ยอดรวม|รวมเงิน|grand\s*total|net\s*amount|total\s*due|transfer\s*amount|\bamount\b|\btotal\b|\bpaid\b/i;
const FEE_PATTERN = /ค่าธรรมเนียม|ค่าบริการ|commission|\bfee\b|\bvat\b|\btax\b/i;
const NON_AMOUNT_CONTEXT_PATTERN = /วันที่|เวลา|เลขที่รายการ|เลขที่อ้างอิง|reference|transaction\s*(?:id|no|number)|บัญชี|account|พร้อมเพย์|qr\s*code/i;
const ENGLISH_MONTH_PATTERN = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function normalizeDigits(value) {
  return String(value || "").replace(/[๐-๙]/g, (digit) => String(THAI_DIGITS.indexOf(digit)));
}

function parseNumber(value) {
  const amount = Number(String(value || "").replaceAll(",", "").replaceAll(" ", ""));
  return Number.isFinite(amount) && amount > 0 && amount < 100_000_000 ? amount : null;
}

function parseAmount(lines) {
  const candidates = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previousLine = lines[index - 1] || "";
    const nextLine = lines[index + 1] || "";
    if (FEE_PATTERN.test(line) || FEE_PATTERN.test(previousLine)) continue;

    const hasExplicitLabel = AMOUNT_LABEL_PATTERN.test(line);
    const hasPreviousLabel = AMOUNT_LABEL_PATTERN.test(previousLine);
    const hasCurrency = /฿|\bTHB\b|บาท/i.test(line) || /^\s*(?:บาท|THB|฿)\s*$/i.test(nextLine);
    const hasNonAmountContext = NON_AMOUNT_CONTEXT_PATTERN.test(line);
    if (hasNonAmountContext && !hasCurrency && !hasExplicitLabel) continue;

    const addCandidate = (rawValue, currencyEvidence = false) => {
      const amount = parseNumber(rawValue);
      if (!amount) return;

      const grouped = /,|\s\d{3}/.test(rawValue);
      const decimal = /\.\d{1,2}$/.test(rawValue);
      let score = 0;
      if (currencyEvidence || hasCurrency) score += 100;
      if (hasExplicitLabel) score += 90;
      else if (hasPreviousLabel) score += 65;
      if (grouped) score += 30;
      if (decimal) score += 30;
      if (hasNonAmountContext && !currencyEvidence && !hasExplicitLabel) score -= 100;
      if (score >= 25) candidates.push({ amount, score, index });
    };

    for (const match of line.matchAll(CURRENCY_PATTERN)) {
      addCandidate(match[1] || match[2], true);
    }

    for (const match of line.matchAll(NUMBER_PATTERN)) {
      addCandidate(match[0]);
    }

    if (hasExplicitLabel && !NUMBER_PATTERN.test(line) && nextLine) {
      NUMBER_PATTERN.lastIndex = 0;
      for (const match of nextLine.matchAll(NUMBER_PATTERN)) addCandidate(match[0]);
    }
    NUMBER_PATTERN.lastIndex = 0;
  }

  candidates.sort((left, right) => right.score - left.score || right.amount - left.amount);
  return candidates[0]?.amount ?? null;
}

function validIsoDate(year, month, day) {
  if (year > 2500) year -= 543;
  if (year < 100) year = year >= 50 ? 2500 + year - 543 : 2000 + year;
  if (year < 2000 || year > 2200) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(lines) {
  const text = lines.join("\n");
  const ymd = text.match(/\b(20\d{2}|25\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (ymd) return validIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  // OCR can insert a stray digit between repeated Thai initials, e.g. ต3ต.ค.
  const thaiDateText = text.replace(/([\u0E01-\u0E2E])\d\1(?=\s*\.?\s*[\u0E01-\u0E2E])/g, "$1");
  const thaiDate = thaiDateText.match(/(?<![\d\u0E00-\u0E7F])(\d{1,2})\s*(มกราคม|ม\s*\.?\s*ค\.?|กุมภาพันธ์|ก\s*\.?\s*พ\.?|มีนาคม|มี\s*\.?\s*ค\.?|เมษายน|เม\s*\.?\s*ย\.?|พฤษภาคม|พ\s*\.?\s*ค\.?|มิถุนายน|มิ\s*\.?\s*ย\.?|กรกฎาคม|ก\s*\.?\s*ค\.?|สิงหาคม|ส\s*\.?\s*ค\.?|กันยายน|ก\s*\.?\s*ย\.?|ตุลาคม|ต\s*\.?\s*ค\.?|พฤศจิกายน|พ\s*\.?\s*ย\.?|ธันวาคม|ธ\s*\.?\s*ค\.?)\s*(\d{2,4})(?!\d)/i);
  if (thaiDate) {
    const monthText = thaiDate[2].replace(/[.\s]/g, "");
    const month = [
      /^(?:มกราคม|มค)$/i, /^(?:กุมภาพันธ์|กพ)$/i, /^(?:มีนาคม|มีค)$/i,
      /^(?:เมษายน|เมย)$/i, /^(?:พฤษภาคม|พค)$/i, /^(?:มิถุนายน|มิย)$/i,
      /^(?:กรกฎาคม|กค)$/i, /^(?:สิงหาคม|สค)$/i, /^(?:กันยายน|กย)$/i,
      /^(?:ตุลาคม|ตค)$/i, /^(?:พฤศจิกายน|พย)$/i, /^(?:ธันวาคม|ธค)$/i,
    ].findIndex((pattern) => pattern.test(monthText)) + 1;
    if (month) return validIsoDate(Number(thaiDate[3]), month, Number(thaiDate[1]));
  }

  const englishMonthFirst = text.match(new RegExp(`\\b(${ENGLISH_MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{2,4})\\b`, "i"));
  if (englishMonthFirst) {
    const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .findIndex((prefix) => englishMonthFirst[1].toLowerCase().startsWith(prefix)) + 1;
    if (monthIndex) return validIsoDate(Number(englishMonthFirst[3]), monthIndex, Number(englishMonthFirst[2]));
  }

  const englishDayFirst = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${ENGLISH_MONTH_PATTERN})\\.?[,]?\\s+(\\d{2,4})\\b`, "i"));
  if (englishDayFirst) {
    const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .findIndex((prefix) => englishDayFirst[2].toLowerCase().startsWith(prefix)) + 1;
    if (monthIndex) return validIsoDate(Number(englishDayFirst[3]), monthIndex, Number(englishDayFirst[1]));
  }

  const dmy = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (!dmy) return null;
  return validIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
}

function cleanName(value) {
  return String(value || "")
    .replace(/^[\s:：|\-]+|[\s|]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 100);
}

function parseMerchant(lines) {
  const merchantLabel = /^(?:ชื่อร้าน|ร้านค้า|merchant|paid\s+to|transfer\s+to|ชื่อบัญชีผู้รับ|ชื่อผู้รับเงิน|ชื่อผู้รับ|ผู้รับเงิน|ผู้รับ|ชำระให้|โอนให้)\s*[:：-]?\s*(.+)$/i;
  const standaloneMerchantLabel = /^(?:ชื่อร้าน|ร้านค้า|merchant|paid\s+to|transfer\s+to|ชื่อบัญชีผู้รับ|ชื่อผู้รับเงิน|ชื่อผู้รับ|ผู้รับเงิน|ผู้รับ|ชำระให้|โอนให้)\s*[:：-]?$/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(merchantLabel);
    if (match?.[1]) return cleanName(match[1]);
    if (standaloneMerchantLabel.test(line) && lines[index + 1]) return cleanName(lines[index + 1]);
  }

  const skipLine = /(?:ใบเสร็จ|ใบกำกับภาษี|tax\s*invoice|receipt|สลิป|payment\s*(?:slip|successful)|transaction|reference|สำเร็จ|เลขที่|วันที่|เวลา|สาขา|โทรศัพท์|โทร\.|ที่อยู่|จำนวนเงิน|ยอด|รวมเงิน|บาท|\b(?:make|scb|kbank|k\s*plus|kplus|uob|bbl|ktb|ttb|tmb|cimb|gsb|baac|krungthai|krungsri|bangkok\s*bank|bualuang|ayudhya|kma|mymo|truemoney|promptpay|a[\s-]?mobile)\b|ธนาคารไทยพาณิชย์|ธนาคารกสิกรไทย|ธนาคารกรุงไทย|ธนาคารกรุงเทพ|ธนาคารกรุงศรี|ธนาคารออมสิน|ธนาคารเพื่อการเกษตร|พร้อมเพย์)/i;
  const candidate = lines.find((line) => /[A-Za-z\u0E00-\u0E7F]/.test(line) && !skipLine.test(line) && line.length <= 80);
  return candidate ? cleanName(candidate) : null;
}

function parseMemo(lines) {
  const memoLabel = /(?:หมายเหตุ|บันทึก(?:ช่วยจำ)?|ข้อความถึงผู้รับ|วัตถุประสงค์|purpose|memo|note|description|message)\s*[:：-]?\s*(.*)$/i;
  const standaloneMemoLabel = /^(?:หมายเหตุ|บันทึก(?:ช่วยจำ)?|ข้อความถึงผู้รับ|วัตถุประสงค์|purpose|memo|note|description|message)\s*[:：-]?$/i;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(memoLabel);
    if (match?.[1]?.trim()) return cleanName(match[1]);
    if (standaloneMemoLabel.test(lines[index]) && lines[index + 1]) return cleanName(lines[index + 1]);
  }

  const purposeLine = lines.find((line) => /ค[่]?าเทอม|ค[่]?าเรียน|ค[่]?าเล่าเรียน|tuition|school\s*fee/i.test(line));
  if (purposeLine) {
    return cleanName(purposeLine)
      .replace(/^ค[่]?าเทอม\s*ล[ู]?ก$/i, "ค่าเทอมลูก")
      .replace(/^ค[่]?าเทอม/i, "ค่าเทอม");
  }

  const referenceIndex = lines.findIndex((line) => /เลขที่รายการ|เลขที่อ้างอิง|reference\s*(?:no|number)?|transaction\s*(?:id|no|number)/i.test(line));
  if (referenceIndex < 0) return null;

  const trailingMemo = lines.slice(referenceIndex + 1).filter((line) =>
    /[\u0E00-\u0E7F]/.test(line)
    && line.length <= 80
    && !/สแกน|ตรวจสอบ|qr\s*code|ค่าธรรมเนียม|บาท|ธนาคาร|make\s*by|kbank|สำเร็จ/i.test(line)
    && !/\d{4,}/.test(line)
  );
  return trailingMemo.length ? cleanName(trailingMemo[trailingMemo.length - 1]) : null;
}

function parseCategory(text) {
  const categoryRules = [
    ["การศึกษา", /ค[่]?าเทอม|ค[่]?าเรียน|ค[่]?าเล่าเรียน|tuition|school\s*fee|education/i],
    ["หนี้สิน/ผ่อนชำระ", /spaylater|pay\s*later|ผ่อนชำระ|สินเชื่อ|installment/i],
    ["บัตรเครดิต", /ชำระบัตรเครดิต|credit\s*card\s*payment/i],
    ["ค่าโทรศัพท์/อินเทอร์เน็ต", /\bais\b|\bdtac\b|\btrue(?:\s*(?:move|online))?\b|ค่าโทรศัพท์|ค่าอินเทอร์เน็ต|internet\s*bill/i],
    ["ค่าสาธารณูปโภค", /การไฟฟ้า|ค่าไฟ|การประปา|ค่าน้ำประปา|electricity\s*bill|water\s*bill/i],
    ["ค่าเดินทาง", /bts|mrt|grab(?:taxi)?|bolt|taxi|ทางด่วน|น้ำมันเชื้อเพลิง|ค่าทางด่วน/i],
    ["สุขภาพ", /โรงพยาบาล|คลินิก|ร้านขายยา|pharmacy|hospital|clinic/i],
    ["อาหาร", /ร้านอาหาร|อาหาร|กาแฟ|coffee|restaurant|foodpanda|grabfood|lineman/i],
    ["บ้านและที่พัก", /ค่าเช่าบ้าน|ค่าเช่าห้อง|ค่าเช่าคอนโด|ที่พัก|rent\s*payment/i],
    ["ช้อปปิ้ง", /shopee|lazada|central|big\s*c|lotus|shopping/i],
  ];
  return categoryRules.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

function parseChannel(lines) {
  const makeLogoIndex = lines.findIndex((line) => /make/i.test(line));
  if (makeLogoIndex >= 0 && lines.slice(makeLogoIndex, makeLogoIndex + 3).some((line) => /k\s*bank/i.test(line))) return "KBank";
  if (lines.some((line) => /make\s*(?:by\s*)?kbank|k\s*bank\s*make/i.test(line))) return "KBank";

  const channelOptions = [
    ["SCB", /\bSCB\b|ไทยพาณิชย์|SCB\s*Easy/i],
    ["KBank", /\bk\s*bank\b|\bkbank\b|กสิกรไทย|กสิกร|\bk\s*plus\b|\bkplus\b/i],
    ["Krungthai", /\bKTB\b|Krungthai|กรุงไทย|เป๋าตัง|NEXT/i],
    ["Bangkok Bank", /\bBBL\b|Bangkok\s*Bank|ธนาคารกรุงเทพ|บัวหลวง|Bualuang/i],
    ["Krungsri", /Krungsri|Ayudhya|กรุงศรี|KMA/i],
    ["ttb", /\bttb\b|\bTMB\b|ธนชาต|ทหารไทย|ttb\s*touch/i],
    ["UOB", /\bUOB\b|ยูโอบี/i],
    ["CIMB Thai", /\bCIMB(?:\s*Thai)?\b|ซีไอเอ็มบี/i],
    ["GSB", /\bGSB\b|ออมสิน|My\s*Mo/i],
    ["BAAC", /\bBAAC\b|ธ\s*\.?\s*ก\s*\.?\s*ส|เพื่อการเกษตร|A[\s-]?Mobile/i],
    ["TrueMoney", /True\s*Money|TrueMoney|ทรูมันนี่/i],
    ["Shopee", /Shopee|SPayLater/i],
    ["พร้อมเพย์", /PromptPay|พร้อมเพย์/i],
    ["เงินสด", /เงินสด|cash/i],
    ["บัตรเครดิต", /บัตรเครดิต|credit\s*card/i],
  ];
  const channelLabel = /ช่องทาง|ชำระผ่าน|จากบัญชี|บัญชีต้นทาง|โอนจาก|แอปธนาคาร|mobile\s*banking|banking\s*app|payment\s*method|from\s*account|transfer\s*from/i;

  for (let index = 0; index < lines.length; index += 1) {
    if (!channelLabel.test(lines[index])) continue;
    const source = `${lines[index]} ${lines[index + 1] || ""}`;
    const match = channelOptions.find(([, pattern]) => pattern.test(source));
    if (match) return match[0];
  }

  const headerText = lines.slice(0, 6).join(" ");
  const headerChannel = channelOptions.find(([, pattern]) => pattern.test(headerText));
  if (headerChannel) return headerChannel[0];
  return null;
}

function parseEmvQrAmount(payload) {
  const value = String(payload || "").trim();
  const crcIndex = value.lastIndexOf("6304");
  if (crcIndex < 0 || crcIndex + 8 !== value.length) return null;

  let crc = 0xffff;
  for (let index = 0; index < crcIndex + 4; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  if (crc.toString(16).padStart(4, "0").toUpperCase() !== value.slice(crcIndex + 4).toUpperCase()) return null;

  const tags = new Map();
  let offset = 0;
  while (offset + 4 <= value.length) {
    const tag = value.slice(offset, offset + 2);
    const length = Number(value.slice(offset + 2, offset + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(length)) return null;
    const contentStart = offset + 4;
    const contentEnd = contentStart + length;
    if (contentEnd > value.length) return null;
    tags.set(tag, value.slice(contentStart, contentEnd));
    offset = contentEnd;
  }

  if (offset !== value.length || tags.get("53") !== "764") return null;
  const rawAmount = tags.get("54");
  if (!rawAmount || !/^\d+(?:\.\d{1,2})?$/.test(rawAmount)) return null;
  return parseNumber(rawAmount);
}

function mergeOcrResults(results, qrInfo = { detected: false, amount: null }) {
  const preferred = [...results].sort((left, right) =>
    right.fieldsRead - left.fieldsRead || (right.confidence || 0) - (left.confidence || 0)
  )[0];
  const conflicts = new Set();
  const pickField = (field, label) => {
    const values = [...new Set(results.map((result) => result[field]).filter((value) => value != null && value !== ""))];
    if (values.length > 1) {
      conflicts.add(label);
      return null;
    }
    return values[0] ?? null;
  };
  const date = pickField("date", "วันที่");
  let amount = pickField("amount", "ยอดเงิน");
  const name = pickField("name", "ชื่อรายการ");
  const category = pickField("category", "หมวดหมู่");
  const channel = pickField("channel", "ช่องทาง");
  const qrAmountMismatch = qrInfo.amount != null
    && results.some((result) => result.amount != null && result.amount !== qrInfo.amount);
  if (qrAmountMismatch) {
    amount = null;
    conflicts.add("ยอดเงิน");
  }
  const fieldsMissing = [
    ["วันที่", date], ["ยอดเงิน", amount], ["ชื่อรายการ", name], ["หมวดหมู่", category], ["ช่องทาง", channel],
  ].filter(([label, value]) => !value || conflicts.has(label)).map(([label]) => label);

  return {
    ...preferred,
    text: [...new Set(results.map((result) => result.text).filter(Boolean))].join("\n\n"),
    date,
    amount,
    name,
    category,
    channel,
    conflicts: [...conflicts],
    qrDetected: Boolean(qrInfo.detected),
    qrAmount: qrInfo.amount,
    qrAmountMismatch,
    ocrAmountCandidates: [...new Set(results.map((result) => result.amount).filter((value) => value != null))],
    fieldsMissing,
    fieldsRead: [date, amount, name, category, channel].filter(Boolean).length,
  };
}

async function loadImageSource(file) {
  if (typeof document === "undefined") return null;
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { image: bitmap, close: () => bitmap.close?.() };
    } catch {
      // Fall back to the browser image decoder for formats createImageBitmap cannot read.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    return { image, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function renderImageRegion(image, top, bottom, { maxEdge = 2200, upscale = true, enhance = true } = {}) {
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height) return null;
  const sourceY = Math.round(height * top);
  const sourceHeight = Math.max(1, Math.round(height * bottom) - sourceY);
  const sourceWidth = width;
  const longestEdge = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(upscale ? 1.6 : 1, maxEdge / longestEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: !enhance });
  if (!context) return null;
  if (enhance && "filter" in context) context.filter = "grayscale(1) contrast(1.25)";
  context.drawImage(image, 0, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas) {
  if (!canvas) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function prepareReceiptImages(file) {
  const loaded = await loadImageSource(file);
  if (!loaded) return { full: null, dateRegion: null, amountRegion: null, qrImageData: null };
  try {
    const fullCanvas = renderImageRegion(loaded.image, 0, 1);
    const dateCanvas = renderImageRegion(loaded.image, 0.02, 0.36);
    const amountCanvas = renderImageRegion(loaded.image, 0.38, 0.96);
    const qrCanvas = renderImageRegion(loaded.image, 0, 1, { maxEdge: 1800, upscale: false, enhance: false });
    let qrImageData = null;
    try {
      const qrContext = qrCanvas?.getContext("2d", { willReadFrequently: true });
      if (qrContext && qrCanvas) qrImageData = qrContext.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
    } catch {
      qrImageData = null;
    }
    const [full, dateRegion, amountRegion] = await Promise.all([
      canvasToBlob(fullCanvas), canvasToBlob(dateCanvas), canvasToBlob(amountCanvas),
    ]);
    return { full, dateRegion, amountRegion, qrImageData };
  } catch {
    return { full: null, dateRegion: null, amountRegion: null, qrImageData: null };
  } finally {
    loaded.close();
  }
}

async function decodeQr(qrImageData) {
  if (!qrImageData) return { detected: false, amount: null };
  try {
    const qrModule = await import("jsqr");
    const jsQR = qrModule.default || qrModule;
    const code = jsQR(qrImageData.data, qrImageData.width, qrImageData.height, { inversionAttempts: "attemptBoth" });
    return code ? { detected: true, amount: parseEmvQrAmount(code.data) } : { detected: false, amount: null };
  } catch {
    return { detected: false, amount: null };
  }
}

function parseFocusedResult(ocrData, focus) {
  const parsed = {
    ...extractReceiptFields(ocrData.text),
    confidence: Number.isFinite(ocrData.confidence) ? Math.round(ocrData.confidence) : null,
  };
  for (const field of ["date", "amount", "name", "category", "channel"]) {
    if (!focus.includes(field)) parsed[field] = null;
  }
  parsed.fieldsRead = focus.filter((field) => parsed[field] != null).length;
  return parsed;
}

export function extractReceiptFields(rawText) {
  const normalizedText = normalizeDigits(rawText).replace(/\r/g, "").normalize("NFC");
  const lines = normalizedText.split("\n").map((line) => line.trim()).filter(Boolean);
  const date = parseDate(lines);
  const amount = parseAmount(lines);
  const memo = parseMemo(lines);
  const name = memo || parseMerchant(lines);
  const category = parseCategory(`${normalizedText}\n${memo || ""}`);
  const channel = parseChannel(lines);
  const fieldsMissing = [
    ["วันที่", date],
    ["ยอดเงิน", amount],
    ["ชื่อรายการ", name],
    ["หมวดหมู่", category],
    ["ช่องทาง", channel],
  ].filter(([, value]) => !value).map(([label]) => label);

  return {
    text: normalizedText.trim(),
    date,
    amount,
    name,
    category,
    channel,
    fieldsMissing,
    confidence: null,
    fieldsRead: [date, amount, name, category, channel].filter(Boolean).length,
  };
}

export async function readReceipt(file, onProgress = () => {}) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("ระบบอ่านอัตโนมัติรองรับไฟล์รูปภาพเท่านั้น");
  }

  onProgress({ status: "preparing receipt image", progress: 3 });
  const images = await prepareReceiptImages(file);
  onProgress({ status: "reading receipt QR", progress: 8 });
  const qrInfo = await decodeQr(images.qrImageData);

  const { createWorker, PSM } = await import("tesseract.js");
  let progressRange = [8, 38];
  const worker = await createWorker(["tha", "eng"], 1, {
    logger: (message) => {
      const passProgress = Math.max(0, Math.min(100, Math.round((message.progress || 0) * 100)));
      const progress = progressRange[0] + Math.round((progressRange[1] - progressRange[0]) * (passProgress / 100));
      onProgress({ status: message.status, progress });
    },
  });

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const firstPass = await worker.recognize(file);
    const first = parseFocusedResult(firstPass.data, ["date", "amount", "name", "category", "channel"]);

    progressRange = [38, 66];
    onProgress({ status: "recognizing text", progress: progressRange[0] });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const secondPass = await worker.recognize(images.full || file);
    const second = parseFocusedResult(secondPass.data, ["date", "amount", "name", "category", "channel"]);
    const results = [first, second];
    const merged = mergeOcrResults(results, qrInfo);
    const cropPlans = [];
    if (!merged.date && images.dateRegion) cropPlans.push({ image: images.dateRegion, field: "date" });
    if (!merged.amount && images.amountRegion) cropPlans.push({ image: images.amountRegion, field: "amount" });

    for (let index = 0; index < cropPlans.length; index += 1) {
      const plan = cropPlans[index];
      const start = 66 + Math.round((31 * index) / cropPlans.length);
      const end = 66 + Math.round((31 * (index + 1)) / cropPlans.length);
      progressRange = [start, end];
      onProgress({ status: plan.field === "date" ? "recognizing date region" : "recognizing amount region", progress: start });
      const cropPass = await worker.recognize(plan.image);
      results.push(parseFocusedResult(cropPass.data, [plan.field]));
    }

    onProgress({ status: "recognizing text", progress: 100 });
    return mergeOcrResults(results, qrInfo);
  } finally {
    await worker.terminate();
  }
}
