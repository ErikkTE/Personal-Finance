const BANGKOK_TIME_ZONE = "Asia/Bangkok";

function bangkokDateParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: BANGKOK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
}

export function getTodayDate() {
  const { year, month, day } = bangkokDateParts();
  return `${year}-${month}-${day}`;
}

export function getCurrentMonthValue() {
  const { year, month } = bangkokDateParts();
  return `${year}-${month}`;
}

export function getMonthOptions(transactions = [], extraValues = []) {
  const currentMonth = getCurrentMonthValue();
  const [currentYear, currentIndex] = currentMonth.split("-").map(Number);
  const months = new Set([...transactions.map((item) => item.budgetMonth), ...extraValues].filter(Boolean));

  for (let offset = -12; offset <= 24; offset += 1) {
    const monthDate = new Date(currentYear, currentIndex - 1 + offset, 1);
    months.add(`${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`);
  }

  return [...months].sort().map((value) => ({ value, label: getMonthLabel(value) }));
}

export const monthOptions = getMonthOptions();

export const categoryOptions = [
  "เงินเดือน",
  "รายได้เสริม",
  "บัตรเครดิต",
  "หนี้สิน/ผ่อนชำระ",
  "ค่าสาธารณูปโภค",
  "ค่าโทรศัพท์/อินเทอร์เน็ต",
  "ค่าเดินทาง",
  "อาหาร",
  "ช้อปปิ้ง",
  "สุขภาพ",
  "ประกัน",
  "บ้านและที่พัก",
  "อื่นๆ",
];

export const channelOptions = [
  "SCB",
  "KBank",
  "UOB",
  "Shopee",
  "เงินสด",
  "พร้อมเพย์",
  "บัตรเครดิต",
  "อื่นๆ",
];

export const initialTransactions = [];
export const demoReceiptMap = [];

export const debtCategories = ["บัตรเครดิต", "หนี้สิน/ผ่อนชำระ"];

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value) {
  if (!value) return "ยังไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function getMonthLabel(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || "")) return value || "";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: BANGKOK_TIME_ZONE,
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

export function deriveBudgetMonth(date, category) {
  if (!date) return getCurrentMonthValue();
  const [year, month, day] = date.split("-").map(Number);
  const startsNextBudgetMonth = category === "เงินเดือน" || debtCategories.includes(category);
  if (!startsNextBudgetMonth || day < 25) return `${year}-${String(month).padStart(2, "0")}`;

  const nextMonth = new Date(year, month, 1);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
}

export function getSummary(transactions, selectedMonth) {
  const monthTransactions = transactions.filter((item) => item.budgetMonth === selectedMonth);
  const income = monthTransactions
    .filter((item) => item.type === "income")
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const expenses = monthTransactions
    .filter((item) => item.type === "expense")
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const debt = monthTransactions
    .filter((item) => item.type === "expense" && debtCategories.includes(item.category))
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const pending = monthTransactions.filter((item) => item.status === "รอตรวจสอบ").length;

  return {
    monthTransactions,
    income,
    expenses,
    debt,
    balance: income - expenses,
    debtRatio: income ? Math.round((debt / income) * 100) : 0,
    pending,
  };
}

export function createDraftFromFile(file) {
  const detected = demoReceiptMap.find((item) => file.name.includes(item.match));
  const today = getTodayDate();
  const category = detected?.category || "อื่นๆ";

  return {
    date: today,
    budgetMonth: deriveBudgetMonth(today, category),
    type: "expense",
    category,
    name: detected?.name || "รายการจากรูปใหม่",
    amount: detected?.amount ?? "",
    channel: detected?.channel || "SCB",
    nature: "ครั้งเดียว",
    status: "รอตรวจสอบ",
    note: detected
      ? "ตรวจพบข้อมูลจากรูปตัวอย่าง โปรดตรวจสอบก่อนยืนยัน"
      : "ยังไม่ได้เชื่อม OCR/AI จริง โปรดกรอกข้อมูลจากหลักฐานก่อนยืนยัน",
    fileName: file.name,
    fileType: file.type,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    isDemoDetected: Boolean(detected),
  };
}
