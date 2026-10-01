const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

const MONEY_PATTERNS = [
  /(?:ยอดชำระสุทธิ|ยอดเงินสุทธิ|ยอดสุทธิ|สุทธิ|grand\s*total|net\s*amount|total\s*due)\D{0,24}(\d{1,3}(?:[ ,]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i,
  /(?:จำนวนเงิน(?:ที่โอน|โอน|ชำระ)?|ยอดชำระ|ยอดรับชำระ|ยอดโอน|ยอดเงิน|โอนเงิน|transfer\s*amount|\bamount\b)\D{0,24}(\d{1,3}(?:[ ,]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i,
  /(?:รวมทั้งสิ้น|ยอดรวม|รวมเงิน|\btotal\b|\bpaid\b)\D{0,24}(\d{1,3}(?:[ ,]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i,
];

const CURRENCY_PATTERN = /(?:฿|THB)\s*(\d{1,3}(?:[ ,]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|((?:\d{1,3}(?:[ ,]\d{3})*|\d+)(?:\.\d{1,2})?)\s*(?:บาท|THB|฿)/i;
const NUMBER_PATTERN = /(?:฿|THB)?\s*(\d{1,3}(?:[ ,]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;
const AMOUNT_LABEL_PATTERN = /ยอดชำระสุทธิ|ยอดเงินสุทธิ|ยอดสุทธิ|สุทธิ|จำนวนเงิน|ยอดชำระ|ยอดรับชำระ|ยอดโอน|ยอดเงิน|โอนเงิน|รวมทั้งสิ้น|ยอดรวม|รวมเงิน|grand\s*total|net\s*amount|total\s*due|transfer\s*amount|\bamount\b|\btotal\b|\bpaid\b/i;

function normalizeDigits(value) {
  return String(value || "").replace(/[๐-๙]/g, (digit) => String(THAI_DIGITS.indexOf(digit)));
}

function parseNumber(value) {
  const amount = Number(String(value || "").replaceAll(",", "").replaceAll(" ", ""));
  return Number.isFinite(amount) && amount > 0 && amount < 100_000_000 ? amount : null;
}

function parseAmount(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!AMOUNT_LABEL_PATTERN.test(line)) continue;

    for (const pattern of MONEY_PATTERNS) {
      const match = line.match(pattern);
      const amount = parseNumber(match?.[1]);
      if (amount) return amount;
    }

    if (lines[index + 1]) {
      const nextLineAmount = parseNumber(lines[index + 1].match(NUMBER_PATTERN)?.[1]);
      if (nextLineAmount) return nextLineAmount;
    }
  }

  for (const line of lines) {
    const match = line.match(CURRENCY_PATTERN);
    const amount = parseNumber(match?.[1] || match?.[2]);
    if (amount) return amount;
  }

  return null;
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

  const thaiDate = text.match(/(\d{1,2})\s*(มกราคม|ม\.ค\.?|มค|กุมภาพันธ์|ก\.พ\.?|กพ|มีนาคม|มี\.ค\.?|มีค|เมษายน|เม\.ย\.?|เมย|พฤษภาคม|พ\.ค\.?|พค|มิถุนายน|มิ\.ย\.?|มิย|กรกฎาคม|ก\.ค\.?|กค|สิงหาคม|ส\.ค\.?|สค|กันยายน|ก\.ย\.?|กย|ตุลาคม|ต\.ค\.?|ตค|พฤศจิกายน|พ\.ย\.?|พย|ธันวาคม|ธ\.ค\.?|ธค)\s*(\d{2,4})/i);
  if (thaiDate) {
    const monthText = thaiDate[2].replaceAll(".", "");
    const month = [
      /^(?:มกราคม|มค)$/i, /^(?:กุมภาพันธ์|กพ)$/i, /^(?:มีนาคม|มีค)$/i,
      /^(?:เมษายน|เมย)$/i, /^(?:พฤษภาคม|พค)$/i, /^(?:มิถุนายน|มิย)$/i,
      /^(?:กรกฎาคม|กค)$/i, /^(?:สิงหาคม|สค)$/i, /^(?:กันยายน|กย)$/i,
      /^(?:ตุลาคม|ตค)$/i, /^(?:พฤศจิกายน|พย)$/i, /^(?:ธันวาคม|ธค)$/i,
    ].findIndex((pattern) => pattern.test(monthText)) + 1;
    if (month) return validIsoDate(Number(thaiDate[3]), month, Number(thaiDate[1]));
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

  const skipLine = /(?:ใบเสร็จ|ใบกำกับภาษี|tax\s*invoice|receipt|สลิป|payment\s*(?:slip|successful)|transaction|reference|สำเร็จ|เลขที่|วันที่|เวลา|สาขา|โทรศัพท์|โทร\.|ที่อยู่|จำนวนเงิน|ยอด|รวมเงิน|บาท|\b(?:scb|kbank|k\s*plus|kplus|uob|bbl|ktb|ttb|krungthai\s*next)\b|ธนาคารไทยพาณิชย์|ธนาคารกสิกรไทย|ธนาคารกรุงไทย|พร้อมเพย์)/i;
  const candidate = lines.find((line) => /[A-Za-z\u0E00-\u0E7F]/.test(line) && !skipLine.test(line) && line.length <= 80);
  return candidate ? cleanName(candidate) : null;
}

function parseCategory(text) {
  const categoryRules = [
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
  const channelLabel = /ช่องทาง|ชำระผ่าน|จากบัญชี|บัญชีต้นทาง|payment\s*method|from\s*account/i;
  const channelOptions = [
    ["SCB", /\bSCB\b|ไทยพาณิชย์/i],
    ["KBank", /\bKBank\b|กสิกรไทย|K\s*PLUS/i],
    ["UOB", /\bUOB\b/i],
    ["Shopee", /Shopee|SPayLater/i],
    ["พร้อมเพย์", /PromptPay|พร้อมเพย์/i],
    ["เงินสด", /เงินสด|cash/i],
    ["บัตรเครดิต", /บัตรเครดิต|credit\s*card/i],
  ];

  for (let index = 0; index < lines.length; index += 1) {
    if (!channelLabel.test(lines[index])) continue;
    const source = `${lines[index]} ${lines[index + 1] || ""}`;
    const match = channelOptions.find(([, pattern]) => pattern.test(source));
    if (match) return match[0];
  }
  return null;
}

export function extractReceiptFields(rawText) {
  const normalizedText = normalizeDigits(rawText).replace(/\r/g, "").normalize("NFC");
  const lines = normalizedText.split("\n").map((line) => line.trim()).filter(Boolean);
  const date = parseDate(lines);
  const amount = parseAmount(lines);
  const name = parseMerchant(lines);
  const category = parseCategory(normalizedText);
  const channel = parseChannel(lines);

  return {
    text: normalizedText.trim(),
    date,
    amount,
    name,
    category,
    channel,
    confidence: null,
    fieldsRead: [date, amount, name, category, channel].filter(Boolean).length,
  };
}

export async function readReceipt(file, onProgress = () => {}) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("ระบบอ่านอัตโนมัติรองรับไฟล์รูปภาพเท่านั้น");
  }

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["tha", "eng"], 1, {
    logger: (message) => onProgress({
      status: message.status,
      progress: Math.max(0, Math.min(100, Math.round((message.progress || 0) * 100))),
    }),
  });

  try {
    const result = await worker.recognize(file);
    return {
      ...extractReceiptFields(result.data.text),
      confidence: Number.isFinite(result.data.confidence) ? Math.round(result.data.confidence) : null,
    };
  } finally {
    await worker.terminate();
  }
}
