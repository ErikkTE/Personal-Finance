export const monthOptions = [
  { value: "2026-09", label: "กันยายน 2569" },
  { value: "2026-10", label: "ตุลาคม 2569" },
  { value: "2026-11", label: "พฤศจิกายน 2569" },
  { value: "2026-12", label: "ธันวาคม 2569" },
];

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

export const initialTransactions = [
  {
    id: "TX-0001",
    date: "2026-09-30",
    budgetMonth: "2026-10",
    type: "income",
    category: "เงินเดือน",
    name: "เงินเดือน",
    amount: 62000,
    channel: "SCB",
    nature: "คงที่",
    status: "ยืนยันแล้ว",
    note: "เงินเดือนออกปลายเดือน จัดสรรเป็นงบเดือนถัดไป",
    evidenceName: "สลิปเงินเดือน",
  },
  {
    id: "TX-0002",
    date: "2026-09-30",
    budgetMonth: "2026-10",
    type: "expense",
    category: "หนี้สิน/ผ่อนชำระ",
    name: "ชำระคืน SPayLater",
    amount: 2212.67,
    channel: "Shopee",
    nature: "ประจำยอดเปลี่ยน",
    status: "ยืนยันแล้ว",
    note: "ชำระหลังเงินเดือน จัดเป็นภาระของเดือนตุลาคม",
    evidenceName: "IMG_7967.png",
  },
  {
    id: "TX-0003",
    date: "2026-09-30",
    budgetMonth: "2026-10",
    type: "expense",
    category: "บัตรเครดิต",
    name: "ชำระค่าบัตรเครดิต Card X",
    amount: 14491.34,
    channel: "SCB",
    nature: "ประจำยอดเปลี่ยน",
    status: "ยืนยันแล้ว",
    note: "จ่ายผ่าน SCB ไปยัง Card X",
    evidenceName: "IMG_7975.jpeg",
  },
  {
    id: "TX-0004",
    date: "2026-09-30",
    budgetMonth: "2026-10",
    type: "expense",
    category: "หนี้สิน/ผ่อนชำระ",
    name: "ชำระบัตร Speedy Cash (Card X)",
    amount: 2095.41,
    channel: "SCB",
    nature: "ประจำยอดเปลี่ยน",
    status: "ยืนยันแล้ว",
    note: "จ่ายก่อนกำหนดชำระของเดือนตุลาคม",
    evidenceName: "IMG_7976.jpeg",
  },
  {
    id: "TX-0005",
    date: "2026-09-30",
    budgetMonth: "2026-10",
    type: "expense",
    category: "บัตรเครดิต",
    name: "ชำระบัตรเครดิตกสิกรไทย",
    amount: 4849.05,
    channel: "SCB",
    nature: "ประจำยอดเปลี่ยน",
    status: "ยืนยันแล้ว",
    note: "รายการปลายเดือน จัดเป็นงบเดือนตุลาคม",
    evidenceName: "IMG_7978.jpeg",
  },
  {
    id: "TX-0006",
    date: "2026-09-30",
    budgetMonth: "2026-10",
    type: "expense",
    category: "หนี้สิน/ผ่อนชำระ",
    name: "ชำระบัตรกดเงินสด UOB Cash Plus",
    amount: 1500,
    channel: "SCB",
    nature: "ประจำยอดเปลี่ยน",
    status: "ยืนยันแล้ว",
    note: "ชำระหลังได้รับเงินเดือน",
    evidenceName: "IMG_7979.jpeg",
  },
];

export const demoReceiptMap = [
  {
    match: "7967",
    name: "ชำระคืน SPayLater",
    amount: 2212.67,
    category: "หนี้สิน/ผ่อนชำระ",
    channel: "Shopee",
  },
  {
    match: "7975",
    name: "ชำระค่าบัตรเครดิต Card X",
    amount: 14491.34,
    category: "บัตรเครดิต",
    channel: "SCB",
  },
  {
    match: "7976",
    name: "ชำระบัตร Speedy Cash (Card X)",
    amount: 2095.41,
    category: "หนี้สิน/ผ่อนชำระ",
    channel: "SCB",
  },
  {
    match: "7978",
    name: "ชำระบัตรเครดิตกสิกรไทย",
    amount: 4849.05,
    category: "บัตรเครดิต",
    channel: "SCB",
  },
  {
    match: "7979",
    name: "ชำระบัตรกดเงินสด UOB Cash Plus",
    amount: 1500,
    category: "หนี้สิน/ผ่อนชำระ",
    channel: "SCB",
  },
];

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
  return monthOptions.find((month) => month.value === value)?.label || value;
}

export function deriveBudgetMonth(date, category) {
  if (!date) return "2026-10";
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
  const today = "2026-09-30";
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
