import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import CategorySelect from "./CategorySelect";
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
  getTodayDate,
  initialTransactions,
} from "./data";
import {
  addMonths,
  calculateInstallmentAmounts,
  currentInstallmentMonth,
  installmentBanks,
  installmentMonthLabel,
  nextInstallmentMonth,
  prepareInstallmentPlan,
  summarizeInstallments,
} from "./installments";
import {
  checkSession,
  getGoogleStatus,
  listTransactions,
  removeTransaction as removeGoogleTransaction,
  restoreTransaction as restoreGoogleTransaction,
  restoreHiddenTransactions as restoreGoogleHiddenTransactions,
  getEvidencePreview,
  listInstallments as listGoogleInstallments,
  listDebts as listGoogleDebts,
  saveDebt as saveGoogleDebt,
  recordDebtPayment as recordGoogleDebtPayment,
  recordDebtEvent as recordGoogleDebtEvent,
  getDebtEvidencePreview as getGoogleDebtEvidencePreview,
  listSubscriptions as listGoogleSubscriptions,
  removeInstallment as removeGoogleInstallment,
  restoreInstallment as restoreGoogleInstallment,
  removeSubscription as removeGoogleSubscription,
  restoreSubscription as restoreGoogleSubscription,
  listRecurringExpenses as listGoogleRecurringExpenses,
  listCategories as listGoogleCategories,
  saveCategory as saveGoogleCategory,
  saveRecurringExpense as saveGoogleRecurringExpense,
  removeRecurringExpense as removeGoogleRecurringExpense,
  restoreRecurringExpense as restoreGoogleRecurringExpense,
  saveInstallment as saveGoogleInstallment,
  saveSubscription as saveGoogleSubscription,
  setInstallmentPayment as setGoogleInstallmentPayment,
  saveTransaction as saveGoogleTransaction,
  signIn,
  signOut,
} from "./api";
import { readReceipt } from "./receipt-ocr";
import RecurringExpensesView from "./RecurringExpensesView";
import { recurringExpenseCategories, recurringExpenseMonthValues, summarizeFixedCommitments } from "./recurring-expenses";
import DebtCollectionView from "./DebtCollectionView";
import { makeDebtId, summarizeDebt, validateDebtEventInput, validateDebtInput, validateDebtPaymentInput } from "./debts";

const navItems = [
  { key: "overview", label: "ภาพรวม", shortLabel: "ภาพรวม", icon: "grid" },
  { key: "upload", label: "อัปโหลดสลิป", shortLabel: "อัปโหลด", icon: "upload" },
  { key: "history", label: "ประวัติรายการ", shortLabel: "ประวัติ", icon: "list" },
  { key: "installments", label: "ผ่อนสินค้า", shortLabel: "ผ่อนสินค้า", icon: "card" },
  { key: "debts", label: "ทวงหนี้", shortLabel: "ทวงหนี้", icon: "handCoins" },
  { key: "recurring", label: "รายจ่ายประจำ", shortLabel: "ประจำ", icon: "calendar" },
  { key: "subscriptions", label: "สมัครบริการ", shortLabel: "บริการ", icon: "calendar" },
  { key: "coach", label: "แนวทางการเงิน", shortLabel: "แนวทาง", icon: "sparkles" },
];

const transactionIconRules = [
  { pattern: /อาหาร/, icon: "food", tone: "food" },
  { pattern: /เดินทาง/, icon: "train", tone: "travel" },
  { pattern: /ช้อปปิ้ง|ซื้อของ/, icon: "shopping", tone: "shopping" },
  { pattern: /สุขภาพ/, icon: "health", tone: "health" },
  { pattern: /การศึกษา/, icon: "education", tone: "education" },
  { pattern: /ประกัน/, icon: "insurance", tone: "insurance" },
  { pattern: /บ้าน|ที่พัก/, icon: "home", tone: "home" },
  { pattern: /สาธารณูปโภค|โทรศัพท์|อินเทอร์เน็ต/, icon: "utilities", tone: "utilities" },
  { pattern: /บัตรเครดิต|หนี้สิน|ผ่อน/, icon: "card", tone: "debt" },
];

function getTransactionIconDetails(transaction) {
  if (transaction.type === "income") return { icon: "money", tone: "income" };
  return transactionIconRules.find(({ pattern }) => pattern.test(transaction.category || ""))
    || { icon: "receipt", tone: "other" };
}

const subscriptionCategories = ["บันเทิง", "ทำงาน", "พื้นที่เก็บข้อมูล", "สุขภาพ", "การศึกษา", "อื่นๆ"];
const categoryDefaults = {
  transactions: categoryOptions,
  recurringExpenses: recurringExpenseCategories,
  subscriptions: subscriptionCategories,
};
const subscriptionPaymentMethods = ["KBank", "SCB", "UOB", "บัตรเครดิตอื่นๆ", "Apple Pay", "Google Play", "อื่นๆ"];

function normalizeCustomCategories(input) {
  const seen = new Set();
  const categories = [];
  for (const item of Array.isArray(input) ? input : []) {
    const scope = String(item?.scope || "");
    const name = String(item?.name || "").trim();
    const key = scope + ":" + name.toLocaleLowerCase();
    if (!categoryDefaults[scope] || !name || name.length > 40 || seen.has(key)) continue;
    seen.add(key);
    categories.push({ scope, name, createdAt: String(item.createdAt || "") });
  }
  return categories;
}

function mergeCustomCategories(...sources) {
  return normalizeCustomCategories(sources.flat());
}

function uniqueCategoryNames(...sources) {
  const names = [];
  const seen = new Set();
  for (const value of sources.flat()) {
    const name = String(value || "").trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function loadSavedCustomCategories() {
  try {
    return normalizeCustomCategories(JSON.parse(window.localStorage.getItem("personal-finance-custom-categories") || "[]"));
  } catch {
    return [];
  }
}

function loadSavedSubscriptions() {
  try {
    const saved = window.localStorage.getItem("personal-finance-subscriptions");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function loadSavedRecurringExpenses() {
  try {
    const saved = window.localStorage.getItem("personal-finance-recurring-expenses");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function loadSavedDebts() {
  try {
    const saved = window.localStorage.getItem("personal-finance-debts");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function defaultSubscriptionBillingDate() {
  const [year, month, day] = getTodayDate().split("-").map(Number);
  const firstOfNextMonth = new Date(Date.UTC(year, month, 1));
  const targetYear = firstOfNextMonth.getUTCFullYear();
  const targetMonth = firstOfNextMonth.getUTCMonth() + 1;
  const targetDay = Math.min(day, new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate());
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function subscriptionBillingDate(subscription, selectedMonth) {
  const [startYear, startMonth, day] = String(subscription.nextBillingDate || "").split("-").map(Number);
  const [year, month] = String(selectedMonth || "").split("-").map(Number);
  if (![startYear, startMonth, day, year, month].every(Number.isInteger)) return "";
  const startOrdinal = startYear * 12 + startMonth - 1;
  const selectedOrdinal = year * 12 + month - 1;
  const monthGap = selectedOrdinal - startOrdinal;
  const cycleLength = subscription.cycle === "yearly" ? 12 : 1;
  if (monthGap < 0 || monthGap % cycleLength !== 0) return "";
  const billingDay = Math.min(day, new Date(year, month, 0).getDate());
  return `${year}-${String(month).padStart(2, "0")}-${String(billingDay).padStart(2, "0")}`;
}

function nextSubscriptionBillingDate(subscription, selectedMonth) {
  const [year, month] = String(selectedMonth || "").split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return subscription.nextBillingDate || "";
  for (let offset = 0; offset <= 24; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const due = subscriptionBillingDate(subscription, value);
    if (due) return due;
  }
  return subscription.nextBillingDate || "";
}

function loadSavedInstallments() {
  try {
    const saved = window.localStorage.getItem("personal-finance-installments");
    return saved ? JSON.parse(saved).map(prepareInstallmentPlan) : [];
  } catch {
    return [];
  }
}

function loadSavedTransactions() {
  try {
    const saved = window.localStorage.getItem("personal-finance-transactions");
    return saved ? JSON.parse(saved) : initialTransactions;
  } catch {
    return initialTransactions;
  }
}

function ocrProgressLabel(status) {
  if (status === "loading tesseract core") return "กำลังเตรียมระบบอ่านข้อความ";
  if (status === "loading language traineddata") return "กำลังโหลดชุดภาษาไทยและอังกฤษ";
  if (status === "initializing api") return "กำลังเริ่มระบบ OCR";
  if (status === "preparing receipt image") return "กำลังปรับภาพในอุปกรณ์";
  if (status === "reading receipt QR") return "กำลังอ่าน QR ในอุปกรณ์";
  if (status === "recognizing date region") return "กำลังอ่านบริเวณวันที่";
  if (status === "recognizing amount region") return "กำลังอ่านบริเวณจำนวนเงิน";
  if (status === "recognizing text") return "กำลังอ่านข้อความจากรูป";
  return "กำลังเตรียมอ่านสลิป";
}

function App() {
  const [activeView, setActiveView] = useState("overview");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [transactions, setTransactions] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [debts, setDebts] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [customCategories, setCustomCategories] = useState(loadSavedCustomCategories);
  const [installmentMonth, setInstallmentMonth] = useState(currentInstallmentMonth);
  const [installmentSync, setInstallmentSync] = useState({ ready: false, error: "กำลังตรวจการเชื่อมต่อ" });
  const [debtSync, setDebtSync] = useState({ ready: false, error: "กำลังตรวจการเชื่อมต่อ" });
  const [subscriptionSync, setSubscriptionSync] = useState({ ready: false, error: "กำลังตรวจการเชื่อมต่อ" });
  const [recurringExpenseSync, setRecurringExpenseSync] = useState({ ready: false, error: "กำลังตรวจการเชื่อมต่อ" });
  const [savingInstallment, setSavingInstallment] = useState(false);
  const [savingDebt, setSavingDebt] = useState(false);
  const [payingDebt, setPayingDebt] = useState("");
  const [savingRecurringExpense, setSavingRecurringExpense] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState("");
  const [paidCelebrationKey, setPaidCelebrationKey] = useState("");
  const [hiddenTransactions, setHiddenTransactions] = useState([]);
  const [draft, setDraft] = useState(null);
  const [toast, setToastValue] = useState("");
  const [toastAction, setToastAction] = useState(null);
  const [toastActionBusy, setToastActionBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runtime, setRuntime] = useState({ status: "checking", mode: null });
  const [connection, setConnection] = useState({ mode: "local", state: "demo" });
  const [showSettings, setShowSettings] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [editingSubscription, setEditingSubscription] = useState(null);
  const [loginError, setLoginError] = useState("");
  const fileInputRef = useRef(null);

  function setToast(message) {
    setToastAction(null);
    setToastValue(message);
  }

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [activeView]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const syncVisualViewport = () => {
      const height = viewport.height > 0 ? viewport.height : window.innerHeight;
      document.documentElement.style.setProperty("--app-visual-viewport-height", `${height}px`);
      document.documentElement.style.setProperty("--app-visual-viewport-offset-top", `${Math.max(0, viewport.offsetTop)}px`);
    };

    syncVisualViewport();
    viewport.addEventListener("resize", syncVisualViewport);
    viewport.addEventListener("scroll", syncVisualViewport);
    return () => {
      viewport.removeEventListener("resize", syncVisualViewport);
      viewport.removeEventListener("scroll", syncVisualViewport);
      document.documentElement.style.removeProperty("--app-visual-viewport-height");
      document.documentElement.style.removeProperty("--app-visual-viewport-offset-top");
    };
  }, []);

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
      setInstallments(loadSavedInstallments());
      setDebts(loadSavedDebts());
      setSubscriptions(loadSavedSubscriptions());
      setRecurringExpenses(loadSavedRecurringExpenses());
      setInstallmentSync({ ready: false, error: "โหมดทดลองบันทึกข้อมูลเฉพาะอุปกรณ์นี้" });
      setDebtSync({ ready: false, error: "โหมดทดลองบันทึกข้อมูลเฉพาะอุปกรณ์นี้" });
      setSubscriptionSync({ ready: false, error: "โหมดทดลองบันทึกข้อมูลเฉพาะอุปกรณ์นี้" });
      setRecurringExpenseSync({ ready: false, error: "โหมดทดลองบันทึกข้อมูลเฉพาะอุปกรณ์นี้" });
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
    if (runtime.status === "ready" && runtime.mode === "local") {
      try {
        window.localStorage.setItem("personal-finance-installments", JSON.stringify(installments));
      } catch {
        setToast("พื้นที่เก็บข้อมูลแผนผ่อนในอุปกรณ์นี้เต็ม");
      }
    }
  }, [installments, runtime.status, runtime.mode]);

  useEffect(() => {
    if (runtime.status === "ready" && runtime.mode === "local") {
      try {
        window.localStorage.setItem("personal-finance-debts", JSON.stringify(debts));
      } catch {
        setToast("พื้นที่เก็บข้อมูลรายการทวงหนี้ในอุปกรณ์นี้เต็ม");
      }
    }
  }, [debts, runtime.status, runtime.mode]);

  useEffect(() => {
    if (runtime.status === "ready" && runtime.mode === "local") {
      try {
        window.localStorage.setItem("personal-finance-subscriptions", JSON.stringify(subscriptions));
      } catch {
        setToast("พื้นที่เก็บข้อมูลรายการสมัครบริการในอุปกรณ์นี้เต็ม");
      }
    }
  }, [subscriptions, runtime.status, runtime.mode]);

  useEffect(() => {
    if (runtime.status === "ready" && runtime.mode === "local") {
      try {
        window.localStorage.setItem("personal-finance-recurring-expenses", JSON.stringify(recurringExpenses));
      } catch {
        setToast("พื้นที่เก็บข้อมูลรายจ่ายประจำในอุปกรณ์นี้เต็ม");
      }
    }
  }, [recurringExpenses, runtime.status, runtime.mode]);

  useEffect(() => {
    try {
      window.localStorage.setItem("personal-finance-custom-categories", JSON.stringify(customCategories));
    } catch {
      setToast("หมวดหมู่ที่เพิ่มใหม่ยังบันทึกในอุปกรณ์นี้ไม่ได้");
    }
  }, [customCategories]);

  useEffect(() => {
    if (!toast) return undefined;
    if (toastActionBusy) return undefined;
    const hasAction = toastAction?.message === toast;
    const timeout = window.setTimeout(() => {
      setToastValue("");
      setToastAction(null);
    }, hasAction ? 6000 : 3600);
    return () => window.clearTimeout(timeout);
  }, [toast, toastAction, toastActionBusy]);

  const summary = useMemo(() => getSummary(transactions, selectedMonth), [transactions, selectedMonth]);
  const fixedCommitmentSummary = useMemo(() => summarizeFixedCommitments({
    fixedExpenses: recurringExpenses,
    installments,
    subscriptions,
    month: selectedMonth,
    subscriptionBillingDate,
  }), [recurringExpenses, installments, subscriptions, selectedMonth]);
  const monthChoices = useMemo(
    () => getMonthOptions(transactions, [
      selectedMonth,
      ...(draft?.budgetMonth ? [draft.budgetMonth] : []),
      ...(activeView === "recurring" ? recurringExpenseMonthValues(recurringExpenses, getCurrentMonthValue()) : []),
    ]),
    [transactions, draft?.budgetMonth, selectedMonth, activeView, recurringExpenses]
  );
  const transactionNameOptions = useMemo(() => {
    const usage = new Map();
    for (const transaction of [...transactions, ...hiddenTransactions]) {
      const name = String(transaction.name || "").trim();
      if (!name) continue;
      const entry = usage.get(name) || { name, count: 0, latestDate: "" };
      entry.count += 1;
      if (transaction.date > entry.latestDate) entry.latestDate = transaction.date;
      usage.set(name, entry);
    }
    return [...usage.values()]
      .sort((left, right) => right.count - left.count || right.latestDate.localeCompare(left.latestDate) || left.name.localeCompare(right.name, "th"))
      .map((item) => item.name);
  }, [transactions, hiddenTransactions]);
  const transactionCategoryOptions = useMemo(() => uniqueCategoryNames(
    categoryDefaults.transactions,
    customCategories.filter((item) => item.scope === "transactions").map((item) => item.name),
    transactions.map((item) => item.category),
    hiddenTransactions.map((item) => item.category)
  ), [customCategories, transactions, hiddenTransactions]);
  const recurringCategoryOptions = useMemo(() => uniqueCategoryNames(
    categoryDefaults.recurringExpenses,
    customCategories.filter((item) => item.scope === "recurringExpenses").map((item) => item.name),
    recurringExpenses.map((item) => item.category)
  ), [customCategories, recurringExpenses]);
  const subscriptionCategoryOptions = useMemo(() => uniqueCategoryNames(
    categoryDefaults.subscriptions,
    customCategories.filter((item) => item.scope === "subscriptions").map((item) => item.name),
    subscriptions.map((item) => item.category)
  ), [customCategories, subscriptions]);

  async function addCustomCategory(scope, inputName) {
    const name = String(inputName || "").trim();
    if (!categoryDefaults[scope] || !name || name.length > 40 || /^[=+\-@]/.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
      setToast("ชื่อหมวดหมู่ต้องมี 1–40 ตัวอักษร");
      return false;
    }
    const exists = uniqueCategoryNames(categoryDefaults[scope], customCategories.filter((item) => item.scope === scope).map((item) => item.name))
      .some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (exists) {
      setToast("มีหมวดหมู่นี้อยู่แล้ว");
      return false;
    }

    try {
      const category = runtime.mode === "google"
        ? await saveGoogleCategory({ scope, name })
        : { scope, name, createdAt: new Date().toISOString() };
      setCustomCategories((current) => mergeCustomCategories(current, [category]));
      setToast("เพิ่มหมวดหมู่ “" + name + "” แล้ว");
      return category.name || name;
    } catch (error) {
      setToast(error.message || "บันทึกหมวดหมู่ไม่สำเร็จ");
      return false;
    }
  }

  async function loadGoogleWorkspace() {
    setRuntime({ status: "syncing", mode: "google" });
    const [health, remoteTransactions] = await Promise.all([getGoogleStatus(), listTransactions()]);
    setTransactions(remoteTransactions.filter((item) => item.status !== "ลบแล้ว"));
    setHiddenTransactions(remoteTransactions.filter((item) => item.status === "ลบแล้ว"));
    const [installmentResult, debtResult, subscriptionResult, recurringExpenseResult, categoryResult] = await Promise.allSettled([
      listGoogleInstallments(),
      listGoogleDebts(),
      listGoogleSubscriptions(),
      listGoogleRecurringExpenses(),
      listGoogleCategories(),
    ]);
    if (categoryResult.status === "fulfilled") {
      setCustomCategories((current) => mergeCustomCategories(current, categoryResult.value));
    }
    if (installmentResult.status === "fulfilled") {
      setInstallments(installmentResult.value.map(prepareInstallmentPlan));
      setInstallmentSync({ ready: true, error: "" });
    } else {
      setInstallments([]);
      setInstallmentSync({ ready: false, error: installmentResult.reason?.message || "Apps Script ยังไม่รองรับข้อมูลผ่อนชำระ" });
    }
    if (debtResult.status === "fulfilled") {
      setDebts(debtResult.value);
      setDebtSync({ ready: true, error: "" });
    } else {
      setDebts([]);
      setDebtSync({ ready: false, error: debtResult.reason?.message || "Apps Script ยังไม่รองรับรายการทวงหนี้" });
    }
    if (subscriptionResult.status === "fulfilled") {
      setSubscriptions(subscriptionResult.value);
      setSubscriptionSync({ ready: true, error: "" });
    } else {
      setSubscriptions([]);
      setSubscriptionSync({ ready: false, error: subscriptionResult.reason?.message || "Apps Script ยังไม่รองรับรายการสมัครบริการ" });
    }
    if (recurringExpenseResult.status === "fulfilled") {
      setRecurringExpenses(recurringExpenseResult.value);
      setRecurringExpenseSync({ ready: true, error: "" });
    } else {
      setRecurringExpenses([]);
      setRecurringExpenseSync({ ready: false, error: recurringExpenseResult.reason?.message || "Apps Script ยังไม่รองรับรายจ่ายประจำ" });
    }
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
    setInstallments([]);
    setDebts([]);
    setSubscriptions([]);
    setRecurringExpenses([]);
    setInstallmentSync({ ready: false, error: "กรุณาเข้าสู่ระบบเพื่อโหลดข้อมูลผ่อนชำระ" });
    setDebtSync({ ready: false, error: "กรุณาเข้าสู่ระบบเพื่อโหลดรายการทวงหนี้" });
    setSubscriptionSync({ ready: false, error: "กรุณาเข้าสู่ระบบเพื่อโหลดข้อมูลสมัครบริการ" });
    setRecurringExpenseSync({ ready: false, error: "กรุณาเข้าสู่ระบบเพื่อโหลดรายจ่ายประจำ" });
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

  async function retryInstallmentSync() {
    if (runtime.mode !== "google") return;
    setInstallmentSync({ ready: false, error: "กำลังโหลดจาก Google Sheets" });
    try {
      const remoteInstallments = await listGoogleInstallments();
      setInstallments(remoteInstallments.map(prepareInstallmentPlan));
      setInstallmentSync({ ready: true, error: "" });
    } catch (error) {
      setInstallmentSync({ ready: false, error: error.message || "Apps Script ยังไม่รองรับข้อมูลผ่อนชำระ" });
    }
  }

  async function retryDebtSync() {
    if (runtime.mode !== "google") return;
    setDebtSync({ ready: false, error: "กำลังโหลดจาก Google Sheets" });
    try {
      setDebts(await listGoogleDebts());
      setDebtSync({ ready: true, error: "" });
    } catch (error) {
      setDebtSync({ ready: false, error: error.message || "Apps Script ยังไม่รองรับรายการทวงหนี้" });
    }
  }

  async function retrySubscriptionSync() {
    if (runtime.mode !== "google") return;
    setSubscriptionSync({ ready: false, error: "กำลังโหลดจาก Google Sheets" });
    try {
      setSubscriptions(await listGoogleSubscriptions());
      setSubscriptionSync({ ready: true, error: "" });
    } catch (error) {
      setSubscriptionSync({ ready: false, error: error.message || "Apps Script ยังไม่รองรับรายการสมัครบริการ" });
    }
  }

  async function retryRecurringExpenseSync() {
    if (runtime.mode !== "google") return;
    setRecurringExpenseSync({ ready: false, error: "กำลังโหลดจาก Google Sheets" });
    try {
      setRecurringExpenses(await listGoogleRecurringExpenses());
      setRecurringExpenseSync({ ready: true, error: "" });
    } catch (error) {
      setRecurringExpenseSync({ ready: false, error: error.message || "Apps Script ยังไม่รองรับรายจ่ายประจำ" });
    }
  }

  async function createInstallment(input) {
    if (runtime.mode === "google" && !installmentSync.ready) {
      setToast("ยังบันทึกข้ามอุปกรณ์ไม่ได้ กรุณาอัปเดต Apps Script ให้รองรับข้อมูลผ่อนก่อน");
      return false;
    }
    const plan = prepareInstallmentPlan(input);
    setSavingInstallment(true);
    try {
      const saved = runtime.mode === "google" ? await saveGoogleInstallment(plan) : plan;
      const normalized = prepareInstallmentPlan(saved);
      setInstallments((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)]);
      setToast(runtime.mode === "google" ? "บันทึกแผนผ่อนและตารางงวดไป Google Sheets แล้ว" : "บันทึกแผนผ่อนไว้ในอุปกรณ์นี้แล้ว");
      return true;
    } catch (error) {
      setToast(error.message || "บันทึกแผนผ่อนไม่สำเร็จ");
      return false;
    } finally {
      setSavingInstallment(false);
    }
  }

  async function createSubscription(input) {
    if (runtime.mode === "google" && !subscriptionSync.ready) {
      setToast("ยังบันทึกข้ามอุปกรณ์ไม่ได้ กรุณาอัปเดต Apps Script ให้รองรับรายการสมัครบริการก่อน");
      return false;
    }
    const existing = subscriptions.find((item) => item.id === input.id);
    const subscription = {
      ...input,
      id: input.id || globalThis.crypto?.randomUUID?.() || `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: existing?.createdAt || input.createdAt || new Date().toISOString(),
    };
    setSavingInstallment(true);
    try {
      const saved = runtime.mode === "google" ? await saveGoogleSubscription(subscription) : subscription;
      setSubscriptions((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setToast(runtime.mode === "google" ? "บันทึกรายการสมัครบริการลง Google Sheets แล้ว" : "บันทึกรายการสมัครบริการไว้ในอุปกรณ์นี้แล้ว");
      return true;
    } catch (error) {
      setToast(error.message || "บันทึกรายการสมัครบริการไม่สำเร็จ");
      return false;
    } finally {
      setSavingInstallment(false);
    }
  }

  async function saveRecurringExpense(input) {
    if (runtime.mode === "google" && !recurringExpenseSync.ready) {
      setToast("ยังบันทึกข้ามอุปกรณ์ไม่ได้ กรุณาอัปเดตและเผยแพร่ Apps Script ให้รองรับรายจ่ายประจำก่อน");
      return false;
    }
    const existing = recurringExpenses.find((item) => item.id === input.id);
    const expense = {
      ...input,
      id: input.id || globalThis.crypto?.randomUUID?.() || `FIXED-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    setSavingRecurringExpense(true);
    try {
      const saved = runtime.mode === "google" ? await saveGoogleRecurringExpense(expense) : expense;
      setRecurringExpenses((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setToast(runtime.mode === "google" ? "บันทึกรายจ่ายประจำลง Google Sheets แล้ว" : "บันทึกรายจ่ายประจำไว้ในอุปกรณ์นี้แล้ว");
      return true;
    } catch (error) {
      const message = error.message || "บันทึกรายจ่ายประจำไม่สำเร็จ";
      setToast(message);
      return { ok: false, error: message };
    } finally {
      setSavingRecurringExpense(false);
    }
  }

  async function toggleInstallmentPayment(planId, installmentNumber, paid) {
    const key = `${planId}:${installmentNumber}`;
    if (updatingPayment) return;
    if (runtime.mode === "google" && !installmentSync.ready) {
      setToast("ยังเปลี่ยนสถานะชำระไม่ได้ กรุณาอัปเดต Apps Script ก่อน");
      return;
    }
    const originalPlans = installments;
    const celebrationKey = `${planId}:${installmentNumber}`;
    if (paid) {
      setPaidCelebrationKey(celebrationKey);
      window.setTimeout(() => setPaidCelebrationKey((current) => current === celebrationKey ? "" : current), 900);
    } else {
      setPaidCelebrationKey("");
    }
    setUpdatingPayment(key);
    setInstallments((current) => current.map((plan) => plan.id !== planId ? plan : {
      ...plan,
      schedule: plan.schedule.map((payment) => payment.installmentNumber !== installmentNumber ? payment : {
        ...payment,
        paid,
        paidAt: paid ? new Date().toISOString() : "",
      }),
    }));
    try {
      if (runtime.mode === "google") {
        const saved = await setGoogleInstallmentPayment({ id: planId, installmentNumber, paid });
        setInstallments((current) => current.map((plan) => plan.id === planId ? prepareInstallmentPlan(saved) : plan));
      }
      setToast(paid ? "ทำเครื่องหมายว่าชำระงวดนี้แล้ว" : "ยกเลิกสถานะชำระของงวดนี้แล้ว");
    } catch (error) {
      setInstallments(originalPlans);
      setToast(error.message || "อัปเดตสถานะชำระไม่สำเร็จ");
    } finally {
      setUpdatingPayment("");
    }
  }

  async function createDebt(input) {
    if (runtime.mode === "google" && !debtSync.ready) {
      setToast("ยังบันทึกทวงหนี้ข้ามอุปกรณ์ไม่ได้ กรุณาอัปเดต Apps Script ก่อน");
      return false;
    }
    let debtInput;
    try {
      debtInput = validateDebtInput({ ...input, id: input.id || makeDebtId() });
    } catch (error) {
      setToast(error.message || "ตรวจข้อมูลหนี้ไม่สำเร็จ");
      return false;
    }
    setSavingDebt(true);
    try {
      const created = {
        ...debtInput,
        createdAt: new Date().toISOString(),
        payments: [],
        events: [],
      };
      const saved = runtime.mode === "google" ? await saveGoogleDebt(created) : created;
      setDebts((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setToast(runtime.mode === "google" ? "บันทึกรายการทวงหนี้และหลักฐานลง Google Sheets/Drive แล้ว" : "บันทึกรายการทดลองไว้ในอุปกรณ์นี้แล้ว");
      return true;
    } catch (error) {
      setToast(error.message || "บันทึกรายการทวงหนี้ไม่สำเร็จ · ลองใหม่ได้โดยไม่สร้างรายการซ้ำ");
      return false;
    } finally {
      setSavingDebt(false);
    }
  }

  async function recordDebtPayment(input) {
    if (payingDebt) return false;
    if (runtime.mode === "google" && !debtSync.ready) {
      setToast("ยังบันทึกหลักฐานการชำระข้ามอุปกรณ์ไม่ได้ กรุณาอัปเดต Apps Script ก่อน");
      return false;
    }
    const debt = debts.find((item) => item.id === input.id);
    if (!debt) {
      setToast("ไม่พบรายการทวงหนี้นี้แล้ว กรุณาโหลดรายการใหม่");
      return false;
    }
    const busyKey = input.id + ":" + (input.eventType === "earlyClose" ? "close" : input.installmentNumber);
    setPayingDebt(busyKey);
    try {
      let saved;
      if (runtime.mode === "google") {
        saved = await recordGoogleDebtPayment(input);
      } else {
        const payment = validateDebtPaymentInput(input, debt);
        const payments = [...(debt.payments || []), payment];
        saved = { ...debt, payments };
        const summary = summarizeDebt(saved);
        Object.assign(saved, {
          totalAmount: summary.totalAmount,
          paidAmount: summary.paidAmount,
          remainingAmount: summary.remainingAmount,
          paidCount: summary.paidCount,
          complete: summary.complete,
        });
      }
      setDebts((current) => current.map((item) => item.id === saved.id ? saved : item));
      setToast(saved.complete ? "ปิดยอดหนี้เรียบร้อย · เก็บหลักฐานและลายเซ็นไว้แล้ว" : "บันทึกรับชำระแล้ว · ยอดคงเหลืออัปเดตเรียบร้อย");
      return true;
    } catch (error) {
      setToast(error.message || "บันทึกการชำระไม่สำเร็จ · ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
      return false;
    } finally {
      setPayingDebt("");
    }
  }

  async function recordDebtEvent(input) {
    if (savingDebt || payingDebt) throw new Error("มีรายการทวงหนี้กำลังบันทึกอยู่ กรุณารอสักครู่แล้วลองอีกครั้ง");
    if (runtime.mode === "google" && !debtSync.ready) {
      const message = "ยังบันทึกประวัติข้ามอุปกรณ์ไม่ได้ กรุณาตรวจการเชื่อมต่อ Google Sheets ก่อน";
      setToast(message);
      throw new Error(message);
    }
    const debt = debts.find((item) => item.id === input.debtId);
    if (!debt) {
      const message = "ไม่พบรายการทวงหนี้นี้แล้ว กรุณาโหลดรายการใหม่";
      setToast(message);
      throw new Error(message);
    }
    setSavingDebt(true);
    try {
      const event = validateDebtEventInput(input, debt);
      const saved = runtime.mode === "google" ? await recordGoogleDebtEvent(event) : {
        ...debt,
        ...(event.type === "correction" ? event.changes : {}),
        events: [...(debt.events || []), event],
      };
      setDebts((current) => current.map((item) => item.id === saved.id ? saved : item));
      setToast(event.type === "cancellation" ? "บันทึกการยกเลิกพร้อมเหตุผลแล้ว · เก็บต้นฉบับไว้ในประวัติ" : event.type === "correction" ? "แก้ไขรายการแล้ว · เก็บรายละเอียดก่อนและหลังไว้ในประวัติ" : "เพิ่มบันทึกชี้แจงไว้กับรายการเดิมแล้ว");
      return true;
    } catch (error) {
      const message = error.message || "บันทึกประวัติไม่สำเร็จ";
      setToast(message);
      throw new Error(message);
    } finally {
      setSavingDebt(false);
    }
  }

  async function loadDebtEvidence(reference) {
    if (runtime.mode === "google") return getGoogleDebtEvidencePreview(reference);
    const debt = debts.find((item) => item.id === reference.id);
    if (!debt) throw new Error("ไม่พบรายการทวงหนี้");
    const payment = reference.paymentId
      ? (debt.payments || []).find((item) => item.eventId === reference.paymentId)
      : (debt.payments || []).find((item) => Number(item.installmentNumber) === Number(reference.installmentNumber));
    let media = null;
    if (reference.kind === "loan-photo") media = debt.loanEvidence?.[reference.index];
    else if (reference.kind === "loan-signature") media = debt.lenderSignature;
    else if (reference.kind === "payment-photo") media = payment?.evidence?.[reference.index];
    else if (reference.kind === "payment-signature") media = payment?.signature;
    if (!media?.base64) throw new Error("ไม่พบไฟล์หลักฐานในอุปกรณ์นี้");
    const binary = atob(media.base64.replace(/^data:[^,]*,/, ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: media.mimeType || "image/jpeg" });
    return { url: URL.createObjectURL(blob), mimeType: blob.type };
  }

  function openUpload() {
    fileInputRef.current?.click();
  }

  function openTransaction(transaction) {
    const isPending = transaction.status === "รอตรวจสอบ";
    setDraft({
      ...transaction,
      fileName: transaction.evidenceName || transaction.fileName || "",
      transactionId: transaction.id,
      isPending,
      isExisting: !isPending,
    });
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
    const nextDraft = {
      ...createDraftFromFile(file),
      sourceFile: file,
      ocrStatus: file.type.startsWith("image/") ? "reading" : "unsupported",
      ocrProgress: 0,
      ocrPhase: "",
      ocrText: "",
      ocrFieldsRead: 0,
      ocrMissingFields: [],
      ocrAmountCandidates: [],
      qrDetected: false,
      qrAmount: null,
      ocrQrAmountMismatch: false,
    };
    setDraft(nextDraft);
    if (!file.type.startsWith("image/")) return;

    readReceipt(file, ({ status, progress }) => {
      setDraft((current) => current?.sourceFile === file
        ? { ...current, ocrProgress: progress, ocrPhase: status }
        : current);
    }).then((result) => {
      setDraft((current) => {
        if (current?.sourceFile !== file) return current;
        const date = result.date || current.date;
        const category = result.category || current.category;
        const fieldsRead = result.fieldsRead || 0;
        return {
          ...current,
          date,
          budgetMonth: deriveBudgetMonth(date, category),
          name: result.name || current.name,
          amount: result.amount ? String(result.amount) : current.amount,
          category,
          channel: result.channel || current.channel,
          ocrStatus: result.text ? (fieldsRead ? "done" : "unrecognized") : "empty",
          ocrProgress: 100,
          ocrPhase: "recognizing text",
          ocrText: result.text,
          ocrFieldsRead: fieldsRead,
          ocrMissingFields: result.fieldsMissing || [],
          ocrAmountCandidates: result.ocrAmountCandidates || [],
          qrDetected: Boolean(result.qrDetected),
          qrAmount: result.qrAmount ?? null,
          ocrQrAmountMismatch: Boolean(result.qrAmountMismatch),
        };
      });
    }).catch(() => {
      setDraft((current) => current?.sourceFile === file
        ? { ...current, ocrStatus: "failed", ocrPhase: "", ocrProgress: 0 }
        : current);
    });
  }

  function attachPendingEvidence(selectedFile) {
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
    setDraft((current) => current?.isPending ? {
      ...current,
      sourceFile: file,
      fileName: file.name,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    } : current);
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
    if (draft?.ocrStatus === "reading") {
      setToast("รอให้ระบบอ่านข้อความจากสลิปก่อน แล้วตรวจข้อมูลอีกครั้งครับ");
      return;
    }
    const amount = Number(String(draft?.amount ?? "").replaceAll(",", ""));
    if (!draft?.date) {
      setToast("กรุณาระบุวันที่จากสลิปก่อนยืนยันรายการ");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || !String(draft.name || "").trim()) {
      setToast("กรุณาตรวจสอบจำนวนเงินและชื่อรายการก่อนยืนยัน");
      return;
    }

    const transactionId = draft.transactionId || globalThis.crypto?.randomUUID?.() || `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!draft.transactionId) {
      setDraft((current) => current ? { ...current, transactionId } : current);
    }

    const newTransaction = {
      id: transactionId,
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
      return true;
    } catch (error) {
      setToast(error.message || "ลบรายการไม่สำเร็จ");
      return false;
    }
  }

  async function confirmDeleteTarget() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    let succeeded = false;
    const target = deleteTarget;
    const deletedItem = target.type === "transaction"
      ? transactions.find((item) => item.id === target.id) || hiddenTransactions.find((item) => item.id === target.id)
      : target.type === "installment"
        ? installments.find((item) => item.id === target.id)
        : target.type === "subscription"
          ? subscriptions.find((item) => item.id === target.id)
          : recurringExpenses.find((item) => item.id === target.id);
    try {
      if (target.type === "transaction") {
        succeeded = await removeTransaction(target.id);
        if (succeeded && draft?.transactionId === target.id) setDraft(null);
      } else if (target.type === "installment") {
        if (runtime.mode === "google") await removeGoogleInstallment(target.id);
        setInstallments((current) => current.filter((item) => item.id !== target.id));
        succeeded = true;
      } else if (target.type === "subscription") {
        if (runtime.mode === "google") await removeGoogleSubscription(target.id);
        setSubscriptions((current) => current.filter((item) => item.id !== target.id));
        setSelectedSubscription(null);
        succeeded = true;
      } else if (target.type === "recurringExpense") {
        if (runtime.mode === "google") await removeGoogleRecurringExpense(target.id);
        setRecurringExpenses((current) => current.filter((item) => item.id !== target.id));
        succeeded = true;
      }
      if (succeeded) {
        const message = target.type === "transaction"
          ? runtime.mode === "google" ? "ซ่อนรายการจากแอปแล้ว · เก็บข้อมูลไว้ในชีต" : "ลบรายการทดลองออกจากเครื่องแล้ว"
          : target.type === "installment"
            ? runtime.mode === "google" ? "ซ่อนแผนผ่อนแล้ว" : "ลบแผนผ่อนออกจากอุปกรณ์นี้แล้ว"
            : target.type === "subscription"
              ? runtime.mode === "google" ? "ซ่อนบริการแล้ว" : "ลบบริการออกจากอุปกรณ์นี้แล้ว"
              : runtime.mode === "google" ? "ซ่อนรายจ่ายประจำแล้ว" : "ลบรายจ่ายประจำออกจากอุปกรณ์นี้แล้ว";
        setToastValue(message);
        setToastAction(deletedItem ? { type: target.type, item: deletedItem, message } : null);
      }
    } catch (error) {
      setToast(error.message || "ลบรายการไม่สำเร็จ");
    } finally {
      setDeleteBusy(false);
      if (succeeded) setDeleteTarget(null);
    }
  }

  async function undoLastDelete() {
    const action = toastAction;
    if (!action || toastActionBusy) return;
    setToastActionBusy(true);
    try {
      if (runtime.mode === "google") {
        if (action.type === "transaction") await restoreGoogleTransaction(action.item.id);
        else if (action.type === "installment") await restoreGoogleInstallment(action.item.id);
        else if (action.type === "subscription") await restoreGoogleSubscription(action.item.id);
        else if (action.type === "recurringExpense") await restoreGoogleRecurringExpense(action.item.id);
      }

      if (action.type === "transaction") {
        setTransactions((current) => current.some((item) => item.id === action.item.id) ? current : [action.item, ...current]);
        setHiddenTransactions((current) => current.filter((item) => item.id !== action.item.id));
        if (action.item.budgetMonth) setSelectedMonth(action.item.budgetMonth);
      } else if (action.type === "installment") {
        setInstallments((current) => current.some((item) => item.id === action.item.id) ? current : [action.item, ...current]);
      } else if (action.type === "subscription") {
        setSubscriptions((current) => current.some((item) => item.id === action.item.id) ? current : [action.item, ...current]);
      } else if (action.type === "recurringExpense") {
        setRecurringExpenses((current) => current.some((item) => item.id === action.item.id) ? current : [action.item, ...current]);
      }

      setToastAction(null);
      setToast("คืนรายการกลับมาแล้ว");
    } catch (error) {
      setToast(error.message || "คืนรายการไม่สำเร็จ ลองอีกครั้งได้ครับ");
    } finally {
      setToastActionBusy(false);
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

  function navigateFromOverview(view) {
    if (view === "installments") setInstallmentMonth(selectedMonth);
    setActiveView(view);
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
          <div className="active-view" key={activeView}>
          {activeView === "overview" && (
            <Overview
              summary={summary}
              transactions={transactions}
              commitments={fixedCommitmentSummary}
              selectedMonth={selectedMonth}
              onUpload={openUpload}
              onNavigate={navigateFromOverview}
              onSelectTransaction={openTransaction}
            />
          )}
          {activeView === "upload" && <UploadView onUpload={openUpload} transactions={transactions} onReview={openTransaction} storageMode={runtime.mode} />}
          {activeView === "history" && (
            <HistoryView
              transactions={transactions}
              selectedMonth={selectedMonth}
              onSelectTransaction={openTransaction}
              connection={connection}
              hiddenTransactions={hiddenTransactions.filter((item) => item.budgetMonth === selectedMonth)}
              onRestoreMonth={restoreHiddenForMonth}
              categoryOptions={transactionCategoryOptions}
            />
          )}
          {activeView === "installments" && (
            <InstallmentsView
              plans={installments}
              month={installmentMonth}
              onMonthChange={setInstallmentMonth}
              storageMode={runtime.mode}
              syncReady={installmentSync.ready}
              syncError={installmentSync.error}
              onRetrySync={retryInstallmentSync}
              saving={savingInstallment}
              updatingPayment={updatingPayment}
              paidCelebrationKey={paidCelebrationKey}
              onCreate={createInstallment}
              onUpdate={createInstallment}
              onTogglePayment={toggleInstallmentPayment}
              onDelete={(plan) => setDeleteTarget({ type: "installment", id: plan.id, name: plan.name })}
              onSettings={() => setShowSettings(true)}
            />
          )}
          {activeView === "debts" && (
            <DebtCollectionView
              debts={debts}
              storageMode={runtime.mode}
              syncReady={debtSync.ready}
              syncError={debtSync.error}
              saving={savingDebt}
              paying={payingDebt}
              onRetrySync={retryDebtSync}
              onCreate={createDebt}
              onRecordPayment={recordDebtPayment}
              onRecordEvent={recordDebtEvent}
              onLoadEvidence={loadDebtEvidence}
              onSettings={() => setShowSettings(true)}
            />
          )}
          {activeView === "subscriptions" && (
            <SubscriptionsView
              subscriptions={subscriptions}
              selectedMonth={selectedMonth}
              storageMode={runtime.mode}
              syncReady={subscriptionSync.ready}
              syncError={subscriptionSync.error}
              onRetrySync={retrySubscriptionSync}
              saving={savingInstallment}
              onCreate={createSubscription}
              onSelect={setSelectedSubscription}
              onDelete={(subscription) => setDeleteTarget({ type: "subscription", id: subscription.id, name: subscription.name })}
              onSettings={() => setShowSettings(true)}
              categoryOptions={subscriptionCategoryOptions}
              onAddCategory={addCustomCategory}
              editingSubscription={editingSubscription}
              onCloseEdit={() => setEditingSubscription(null)}
            />
          )}
          {activeView === "recurring" && (
            <RecurringExpensesView
              summary={fixedCommitmentSummary}
              selectedMonth={selectedMonth}
              storageMode={runtime.mode}
              syncReady={recurringExpenseSync.ready}
              syncError={recurringExpenseSync.error}
              onRetrySync={retryRecurringExpenseSync}
              saving={savingRecurringExpense}
              onSave={saveRecurringExpense}
              onDelete={(expense) => setDeleteTarget({ type: "recurringExpense", id: expense.id, name: expense.name })}
              onNavigate={setActiveView}
              onSettings={() => setShowSettings(true)}
              categoryOptions={recurringCategoryOptions}
              onAddCategory={addCustomCategory}
            />
          )}
          {activeView === "coach" && <CoachView summary={summary} selectedMonth={selectedMonth} />}
          </div>
        </main>
      </div>
      <MobileNav activeView={activeView} onNavigate={setActiveView} onUpload={openUpload} />
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
        <ReviewModal draft={draft} monthChoices={monthChoices} transactionNameOptions={transactionNameOptions} categoryOptions={transactionCategoryOptions} onAddCategory={addCustomCategory} saving={saving} storageMode={runtime.mode} onChange={updateDraft} onAttachEvidence={attachPendingEvidence} onClose={closeDraft} onConfirm={confirmDraft} onRequestDelete={() => setDeleteTarget({ type: "transaction", id: draft.transactionId, name: draft.name })} />
      )}
      {selectedSubscription && <SubscriptionDetailModal subscription={selectedSubscription} selectedMonth={selectedMonth} onClose={() => setSelectedSubscription(null)} onEdit={() => { setEditingSubscription(selectedSubscription); setSelectedSubscription(null); }} onDelete={() => setDeleteTarget({ type: "subscription", id: selectedSubscription.id, name: selectedSubscription.name })} />}
      {deleteTarget && <DeleteConfirmDialog target={deleteTarget} storageMode={runtime.mode} busy={deleteBusy} onCancel={() => !deleteBusy && setDeleteTarget(null)} onConfirm={confirmDeleteTarget} />}
      {showSettings && <ConnectionDialog connection={connection} onClose={() => setShowSettings(false)} onLogout={handleLogout} onRetry={retryGoogleConnection} />}
      {toast && <div className="toast" role="status" aria-live="polite"><Icon name="check" size={17} /><span className="toast-message">{toast}</span>{toastAction?.message === toast && <button className="toast-undo-button" type="button" onClick={undoLastDelete} disabled={toastActionBusy}>{toastActionBusy ? "กำลังคืน…" : "เลิกทำ"}</button>}</div>}
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
            <span className="nav-label-full">{item.label}</span>
            <span className="nav-label-compact">{item.shortLabel}</span>
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
        <button className="nav-item muted" type="button" title="ตั้งค่าและการเชื่อมต่อ" aria-label="ตั้งค่าและการเชื่อมต่อ" onClick={onSettings}><Icon name="settings" size={19} /><span className="nav-label-full">ตั้งค่าและการเชื่อมต่อ</span><span className="nav-label-compact">ตั้งค่า</span></button>
      </div>
    </aside>
  );
}

function MobileNav({ activeView, onNavigate, onUpload }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAddButtonRef = useRef(null);
  const firstQuickAddActionRef = useRef(null);
  const primaryItems = navItems.filter((item) => ["overview", "history", "recurring"].includes(item.key));
  const moreItems = navItems.filter((item) => ["installments", "debts", "subscriptions", "upload", "coach"].includes(item.key));
  const moreActive = moreItems.some((item) => item.key === activeView);

  useEffect(() => {
    if (quickAddOpen) firstQuickAddActionRef.current?.focus();
  }, [quickAddOpen]);

  function closeQuickAdd() {
    setQuickAddOpen(false);
    window.requestAnimationFrame(() => quickAddButtonRef.current?.focus());
  }

  function keepQuickAddFocusInside(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeQuickAdd();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = [...(event.currentTarget.querySelectorAll("button:not(:disabled)") || [])];
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && first && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && last && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <nav className="mobile-nav" aria-label="เมนูมือถือ">
        {primaryItems.slice(0, 2).map((item) => (
          <button key={item.key} className={activeView === item.key ? "active" : ""} type="button" onClick={() => onNavigate(item.key)} aria-label={item.label} aria-current={activeView === item.key ? "page" : undefined}>
            <Icon name={item.icon} size={20} />
            <span>{({ overview: "ภาพรวม", history: "รายการ" })[item.key]}</span>
          </button>
        ))}
        <button ref={quickAddButtonRef} className="mobile-add-button" type="button" onClick={() => { setMoreOpen(false); setQuickAddOpen(true); }} aria-label="เพิ่มรายการหรือจัดการรายการประจำ" aria-haspopup="dialog" aria-expanded={quickAddOpen}>
          <Icon name="plus" size={23} /><span>เพิ่ม</span>
        </button>
        <button className={activeView === "recurring" ? "active" : ""} type="button" onClick={() => onNavigate("recurring")} aria-label="รายจ่ายประจำ" aria-current={activeView === "recurring" ? "page" : undefined}>
          <Icon name="calendar" size={20} /><span>ประจำ</span>
        </button>
        <div className="mobile-more-wrap">
          <button className={moreActive ? "active" : ""} type="button" aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={() => setMoreOpen((open) => !open)} aria-label="เมนูเพิ่มเติม">
            <Icon name="more" size={20} /><span>เพิ่มเติม</span>
          </button>
          {moreOpen && <>
            <button className="mobile-more-backdrop" type="button" aria-label="ปิดเมนูเพิ่มเติม" onClick={() => setMoreOpen(false)} />
            <div className="mobile-more-menu" id="mobile-more-menu" role="menu" aria-label="หน้าจอเพิ่มเติม">
              {moreItems.map((item) => (
                <button key={item.key} type="button" role="menuitem" className={activeView === item.key ? "active" : ""} onClick={() => { setMoreOpen(false); onNavigate(item.key); }}>
                  <Icon name={item.icon} size={18} /><span>{item.label}</span><Icon name="chevronRight" size={16} />
                </button>
              ))}
            </div>
          </>}
        </div>
      </nav>
      {quickAddOpen && <>
        <button className="quick-add-backdrop" type="button" tabIndex={-1} aria-label="ปิดเมนูเพิ่มรายการ" onClick={closeQuickAdd} />
        <section className="quick-add-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-add-title" onKeyDown={keepQuickAddFocusInside}>
          <header className="quick-add-header">
            <div><span>ทางลัด</span><h2 id="quick-add-title">ต้องการทำอะไร?</h2><p>เลือกเพิ่มหลักฐานหรือไปจัดการรายการประจำ</p></div>
            <button className="icon-button" type="button" aria-label="ปิด" onClick={closeQuickAdd}><Icon name="close" size={19} /></button>
          </header>
          <div className="quick-add-options">
            <button ref={firstQuickAddActionRef} className="quick-add-option upload" type="button" onClick={() => { closeQuickAdd(); onUpload(); }}>
              <span className="quick-add-icon"><Icon name="upload" size={20} /></span><span><strong>เพิ่มจากสลิปหรือใบเสร็จ</strong><small>ตรวจข้อมูลก่อนบันทึก</small></span><Icon name="chevronRight" size={17} />
            </button>
            <button className="quick-add-option installment" type="button" onClick={() => { closeQuickAdd(); onNavigate("installments"); }}>
              <span className="quick-add-icon"><Icon name="card" size={20} /></span><span><strong>จัดการรายการผ่อน</strong><small>เพิ่มแผนและดูงวดชำระ</small></span><Icon name="chevronRight" size={17} />
            </button>
            <button className="quick-add-option subscription" type="button" onClick={() => { closeQuickAdd(); onNavigate("subscriptions"); }}>
              <span className="quick-add-icon"><Icon name="calendar" size={20} /></span><span><strong>จัดการบริการรายเดือน</strong><small>เพิ่มบริการและดูรอบเรียกเก็บ</small></span><Icon name="chevronRight" size={17} />
            </button>
            <button className="quick-add-option recurring-fixed" type="button" onClick={() => { closeQuickAdd(); onNavigate("recurring"); }}>
              <span className="quick-add-icon"><Icon name="home" size={20} /></span><span><strong>เพิ่มรายจ่ายคงที่</strong><small>ตั้งยอดและเดือนสิ้นสุดได้</small></span><Icon name="chevronRight" size={17} />
            </button>
          </div>
        </section>
      </>}
    </>
  );
}

function Topbar({ activeView, selectedMonth, monthChoices, connection, onMonthChange, onUpload, onSettings }) {
  const title = navItems.find((item) => item.key === activeView)?.label || "ภาพรวม";
  const monthIndex = monthChoices.findIndex((item) => item.value === selectedMonth);
  const connected = connection.mode === "google" && connection.state === "connected";
  return (
    <header className={`topbar topbar-${activeView}`}>
      <div className="mobile-brand"><div className="brand-mark"><Icon name="wallet" size={18} /></div><strong>การเงินส่วนตัว</strong></div>
      <div className="topbar-title"><h1>{title}</h1><span>อัปเดตล่าสุดเมื่อสักครู่</span></div>
      <div className="topbar-actions">
        <button className={`connection-chip ${connected ? "connected" : "demo"}`} type="button" onClick={onSettings} aria-label={connected ? "เชื่อมต่อ Google Sheets และ Drive แล้ว เปิดตั้งค่าการเชื่อมต่อ" : "โหมดทดลอง เปิดตั้งค่าการเชื่อมต่อ"}>
          <span className="connection-dot"><Icon name={connected ? "check" : "info"} size={14} /></span>
          <span className="connection-label">{connected ? "Google เชื่อมต่อแล้ว" : "โหมดทดลอง"}</span>
        </button>
        <button className="icon-button settings-button" type="button" aria-label="ตั้งค่าและการเชื่อมต่อ" onClick={onSettings}><Icon name="settings" size={19} /></button>
      </div>
      {!["installments", "debts"].includes(activeView) && (
        <>
          <div className="month-control">
            <button className="icon-button small" aria-label="เดือนก่อนหน้า" disabled={monthIndex <= 0} onClick={() => onMonthChange(monthChoices[Math.max(0, monthIndex - 1)].value)}><Icon name="chevronLeft" size={18} /></button>
            <select value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)} aria-label="เลือกเดือนงบประมาณ">
              {monthChoices.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
            </select>
            <button className="icon-button small" aria-label="เดือนถัดไป" disabled={monthIndex >= monthChoices.length - 1} onClick={() => onMonthChange(monthChoices[Math.min(monthChoices.length - 1, monthIndex + 1)].value)}><Icon name="chevronRight" size={18} /></button>
          </div>
          <button className="top-upload" onClick={onUpload}><Icon name="upload" size={17} />อัปโหลดสลิป</button>
        </>
      )}
    </header>
  );
}

function Overview({ summary, transactions, commitments, selectedMonth, onUpload, onNavigate, onSelectTransaction }) {
  const monthTransactions = summary.monthTransactions;
  return (
    <div className="page-stack overview-page-stack">
      <section className="page-intro overview-intro">
        <div className="overview-intro-copy">
          <span className="overview-eyebrow">สรุปประจำเดือน</span>
          <h2>ภาพรวมการเงิน</h2>
          <p>ติดตามรายรับ รายจ่าย และกำหนดชำระของเดือน {getMonthLabel(selectedMonth)}</p>
        </div>
        <img className="overview-garden-art" src="/illustrations/finance-window.avif" alt="" aria-hidden="true" />
        <button className="secondary-button" onClick={() => onNavigate("history")}><Icon name="list" size={17} />ดูประวัติทั้งหมด</button>
      </section>

      <section className="budget-snapshot" aria-label="สรุปยอดเดือน">
        <article className="balance-hero">
          <div className="balance-copy">
            <div className="balance-hero-heading"><span className="balance-hero-icon"><Icon name="wallet" size={20} /></span><span>ผลต่างที่บันทึก</span><span className="balance-month-chip">{getMonthLabel(selectedMonth)}</span></div>
            <strong>฿ {formatNumber(summary.balance)}</strong>
            <small>รายรับ − รายจ่ายที่บันทึก · ไม่รวมบิลในอนาคต</small>
          </div>
          <img className="balance-illustration" src="/illustrations/finance-wallet.avif" alt="" aria-hidden="true" />
        </article>
        <div className="snapshot-side">
          <MetricCard label="รายรับ" value={`฿ ${formatNumber(summary.income)}`} detail="เงินเข้าที่บันทึกแล้ว" icon="arrowUp" tone="blue" />
          <MetricCard label="รายจ่าย" value={`฿ ${formatNumber(summary.expenses)}`} detail={`${monthTransactions.filter((item) => item.type === "expense").length} รายการในเดือนนี้`} icon="arrowDown" tone="coral" />
          <article className="debt-ratio-card"><div className="metric-top"><div className="metric-icon"><Icon name="chart" size={19} /></div><span>ยอดชำระหนี้ต่อรายรับ</span></div><div className="debt-ratio-value"><strong>{summary.hasIncome ? `${summary.debtRatio}%` : "—"}</strong><small>{summary.hasIncome ? "เทียบกับรายรับที่บันทึก" : "เพิ่มรายรับเพื่อคำนวณ"}</small></div><div className="progress-track"><div className="progress-fill" style={{ width: `${summary.hasIncome ? Math.min(summary.debtRatio, 100) : 0}%` }} /></div><button className="text-button" type="button" onClick={() => onNavigate("installments")}>ดูรายการผ่อน <Icon name="chevronRight" size={15} /></button></article>
        </div>
      </section>

      <section className="dashboard-lower">
        <div className="overview-side-stack">
          <UpcomingPaymentPanel commitments={commitments} selectedMonth={selectedMonth} onNavigate={onNavigate} />
          <button className="upload-banner overview-upload-banner" type="button" onClick={onUpload}>
            <div className="upload-banner-icon"><Icon name="upload" size={22} /></div>
            <div className="upload-banner-copy"><strong>เพิ่มสลิปหรือใบเสร็จ</strong><span>ตรวจข้อมูลก่อนบันทึก</span></div>
            <span className="banner-action">เลือกไฟล์ <Icon name="chevronRight" size={17} /></span>
          </button>
          <AiSummary summary={summary} onOpen={() => onNavigate("coach")} />
        </div>
        <div className="panel transaction-panel overview-transactions">
          <div className="panel-header"><div><h3>รายการทั้งหมดในเดือน {getMonthLabel(selectedMonth)}</h3><span>{monthTransactions.length} รายการ</span></div><button className="text-button" onClick={() => onNavigate("history")}>ค้นหาและกรอง <Icon name="chevronRight" size={16} /></button></div>
          <TransactionTable transactions={monthTransactions} onSelect={onSelectTransaction} />
        </div>
      </section>
      {transactions.some((item) => item.status === "รอตรวจสอบ") && <PendingNotice count={transactions.filter((item) => item.status === "รอตรวจสอบ").length} onOpen={() => onNavigate("upload")} />}
    </div>
  );
}

function UpcomingPaymentPanel({ commitments, selectedMonth, onNavigate }) {
  const dueItems = commitments.entries.filter((entry) => !entry.paid).map((entry) => {
    const view = entry.type === "fixed" ? "recurring" : entry.type === "subscription" ? "subscriptions" : "installments";
    const icon = entry.type === "fixed" ? getTransactionIconDetails({ type: "expense", category: entry.category }).icon : entry.type === "subscription" ? "calendar" : "card";
    return {
      key: entry.id,
      name: entry.name,
      source: `${entry.category} · ${entry.detail}`,
      sortDate: entry.dueDate || `${selectedMonth}-32`,
      date: entry.dueDate ? `วันที่ ${Number(entry.dueDate.slice(-2))}` : installmentMonthLabel(selectedMonth, { short: true }),
      amount: entry.amount,
      view,
      icon,
    };
  }).sort((left, right) => left.sortDate.localeCompare(right.sortDate));
  const hasTrackedPlans = commitments.count > 0;

  return (
    <section className="panel upcoming-panel" aria-label="รายการที่คาดว่าจะชำระในเดือนนี้">
      <div className="panel-header upcoming-header"><div><h3>กำหนดชำระเดือนนี้</h3><span>{dueItems.length ? `${dueItems.length} รายการที่ต้องเตรียม` : "แผนผ่อนและบริการรายเดือน"}</span></div><span className="upcoming-count">{dueItems.length}</span></div>
      {dueItems.length ? <div className="upcoming-list">
        {dueItems.slice(0, 5).map((item) => <button className="upcoming-row" key={item.key} type="button" onClick={() => onNavigate(item.view)}>
          <span className={`upcoming-icon ${item.view}`}><Icon name={item.icon} size={17} /></span>
          <span className="upcoming-copy"><strong>{item.name}</strong><small>{item.source}</small><small className="upcoming-date">{item.date}</small></span>
          <span className="upcoming-amount">฿ {formatNumber(item.amount)}</span>
        </button>)}
        {dueItems.length > 5 && <button className="text-button upcoming-more" type="button" onClick={() => onNavigate("recurring")}>ดูอีก {dueItems.length - 5} รายการ <Icon name="chevronRight" size={15} /></button>}
      </div> : <div className="upcoming-empty"><span><Icon name={hasTrackedPlans ? "calendar" : "plus"} size={16} /></span><strong>{hasTrackedPlans ? "ไม่มีรายการคงเหลือที่ต้องเตรียม" : "ยังไม่มีรายการประจำที่ติดตาม"}</strong><small>{hasTrackedPlans ? "อาจชำระครบแล้ว หรือเลือกเดือนอื่นเพื่อดูรายการ" : "เพิ่มบิลประจำ แผนผ่อน หรือบริการ เพื่อดูยอดรวม"}</small><div><button className="text-button" type="button" onClick={() => onNavigate("recurring")}>ดูรายจ่ายประจำ</button><button className="text-button" type="button" onClick={() => onNavigate("installments")}>เพิ่มแผนผ่อน</button></div></div>}
    </section>
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
        <TransactionRow transaction={transaction} key={transaction.id} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TransactionRow({ transaction, onSelect }) {
  const { icon, tone } = getTransactionIconDetails(transaction);
  return (
    <button className="table-row table-body" onClick={() => onSelect(transaction)}>
          <span className="date-cell" data-label="วันที่">{formatDate(transaction.date)}</span>
          <span className="name-cell" data-label="รายการ"><span className={`row-icon transaction-icon-${tone}`}><Icon name={icon} size={19} /></span><span>{transaction.name}</span></span>
          <span className={transaction.type === "income" ? "amount income-text" : "amount"} data-label="จำนวนเงิน">{transaction.type === "income" ? "+" : "-"}฿ {formatNumber(transaction.amount)}</span>
          <span data-label="หมวดหมู่"><span className="category-text">{transaction.category}</span></span>
          <span data-label="สถานะ"><Status status={transaction.status} /></span>
    </button>
  );
}

function Status({ status }) {
  const isConfirmed = status === "ยืนยันแล้ว";
  return <span className={`status ${isConfirmed ? "confirmed" : "pending"}`}><Icon name={isConfirmed ? "check" : "clock"} size={13} />{status}</span>;
}

function AiSummary({ summary, onOpen }) {
  return (
    <aside className="ai-summary panel">
      <div className="ai-heading"><div className="ai-symbol"><Icon name="sparkles" size={19} /></div><div><h3>สรุปภาระที่บันทึก</h3><span>คำนวณจากรายการเดือนนี้ · ไม่ได้ใช้ AI</span></div></div>
      <div className="ai-message"><strong>{summary.hasIncome ? `ยอดชำระหนี้ ${summary.debtRatio}% ของรายรับ` : "ยังไม่มีรายรับให้คำนวณสัดส่วน"}</strong><p>ยอดชำระหนี้ที่บันทึก <b>฿ {formatNumber(summary.debt)}</b>{summary.hasIncome ? ` จากรายรับ ฿ ${formatNumber(summary.income)}` : " · เพิ่มรายการรายรับเพื่อแสดงสัดส่วน"}</p></div>
      <div className="ai-divider" />
      <div className="ai-next"><Icon name="lightbulb" size={18} /><span>ผลต่างรายรับและรายจ่ายที่บันทึก <b>฿ {formatNumber(summary.balance)}</b> ยังไม่รวมบิลที่ถึงกำหนดในอนาคต</span></div>
      <button className="text-button" onClick={onOpen}>ดูแนวทางการเงิน <Icon name="chevronRight" size={16} /></button>
    </aside>
  );
}

function PendingNotice({ count, onOpen }) {
  return <button className="pending-notice" onClick={onOpen}><span className="pending-dot"><Icon name="clock" size={16} /></span><span><strong>มี {count} รายการรอตรวจสอบ</strong><small>ตรวจข้อมูลจากรูปก่อนบันทึกจริง</small></span><Icon name="chevronRight" size={18} /></button>;
}

function UploadView({ onUpload, transactions, onReview, storageMode }) {
  const saveDestination = storageMode === "google" ? "พร้อมส่งไป Google Sheets/Drive" : "บันทึกไว้ในอุปกรณ์นี้หลังยืนยัน";
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
        <div className="process-card panel"><h3>ขั้นตอนของรายการ</h3><ProcessStep number="01" title="อัปโหลดหลักฐาน" detail="รูปสลิปหรือใบเสร็จ" active /><ProcessStep number="02" title="ตรวจสอบข้อมูล" detail="วันที่ จำนวนเงิน หมวดหมู่ และเดือนงบประมาณ" /><ProcessStep number="03" title="ยืนยันรายการ" detail={saveDestination} /></div>
      </section>
      <section className="panel pending-panel"><div className="panel-header"><div><h3>รายการรอตรวจสอบ</h3><span>รายการเหล่านี้ยังไม่กระทบยอดรวม</span></div><span className="count-label">{pending.length} รายการ</span></div>{pending.length ? pending.map((item) => <button className="pending-row" key={item.id} onClick={() => onReview(item)}><span className="row-icon pending"><Icon name="image" size={16} /></span><span className="pending-name"><strong>{item.name}</strong><small>{item.fileName || "หลักฐานที่อัปโหลด"}</small></span><span className="pending-amount">{item.amount ? `฿ ${formatNumber(item.amount)}` : "รอกรอกจำนวนเงิน"}</span><Status status="รอตรวจสอบ" /><Icon name="chevronRight" size={17} /></button>) : <div className="empty-state"><Icon name="check" size={22} /><strong>ไม่มีรายการค้างอยู่</strong><span>รายการใหม่จะมาอยู่ตรงนี้ก่อนยืนยัน</span></div>}</section>
    </div>
  );
}

function ProcessStep({ number, title, detail, active }) {
  return <div className={`process-step ${active ? "active" : ""}`}><span className="step-number">{number}</span><span><strong>{title}</strong><small>{detail}</small></span>{active && <span className="step-current">ตอนนี้</span>}</div>;
}

function HistoryView({ transactions, selectedMonth, connection, onSelectTransaction, hiddenTransactions, onRestoreMonth, categoryOptions: availableCategories }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");
  const [restoring, setRestoring] = useState(false);
  const categories = ["ทั้งหมด", ...availableCategories];
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
      <div className="history-footnote"><Icon name="info" size={16} /><span>{connection.mode === "google" ? "แตะรายการเพื่อดูรายละเอียดและนำออกจากแอปได้ · ข้อมูลที่นำออกยังเก็บในชีต" : "แตะรายการเพื่อดูรายละเอียดและลบออกจากอุปกรณ์นี้ได้"}</span></div>
    </div>
  );
}

function InstallmentsView({ plans, month, onMonthChange, storageMode, syncReady, syncError, onRetrySync, saving, updatingPayment, paidCelebrationKey, onCreate, onUpdate, onTogglePayment, onDelete, onSettings }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const summary = summarizeInstallments(plans, month);
  const duePlans = [...new Map(summary.dueThisMonth.map(({ plan }) => [plan.id, plan])).values()];
  const dueSources = [...new Set(duePlans.map((plan) => installmentBanks.find((item) => item.value === plan.bank)?.label || plan.bank))];
  const canSave = storageMode !== "google" || syncReady;

  return (
    <div className="page-stack installment-page">
      <section className="page-intro">
        <div>
          <span className="installment-kicker"><Icon name="card" size={15} />จัดการแผนชำระ</span>
          <h2>ผ่อนสินค้าด้วยบัตรเครดิต</h2>
          <p>ดูยอดที่ต้องจ่ายแต่ละเดือน และทำเครื่องหมายเมื่อชำระแล้ว</p>
        </div>
        <button className="primary-button installment-add-button" type="button" onClick={() => { setEditingPlan(null); setFormOpen(true); }} disabled={!canSave} title={!canSave ? "อัปเดตการเชื่อมต่อก่อนบันทึกแผนผ่อน" : undefined}>
          <Icon name="plus" size={18} />เพิ่มรายการผ่อน
        </button>
      </section>

      {storageMode === "google" && !syncReady && (
        <section className="installment-sync-notice" role="status">
          <span className="installment-sync-icon"><Icon name="info" size={18} /></span>
          <div><strong>ยังซิงก์ข้อมูลผ่อนไม่ได้</strong><span>{syncError || "ตรวจสอบ Apps Script แล้วลองโหลดใหม่"}</span></div>
          <button className="secondary-button" type="button" onClick={onRetrySync}>ลองเชื่อมต่ออีกครั้ง</button>
        </section>
      )}
      {storageMode !== "google" && (
        <section className="installment-sync-notice local" role="status">
          <span className="installment-sync-icon"><Icon name="info" size={18} /></span>
          <div><strong>ข้อมูลทดลองในอุปกรณ์นี้</strong><span>ลงชื่อเข้าใช้ Google เพื่อซิงก์แผนผ่อนและสถานะชำระกับอุปกรณ์อื่น</span></div>
          <button className="secondary-button" type="button" onClick={onSettings}>การเชื่อมต่อ</button>
        </section>
      )}

      <section className="installment-month-panel panel" aria-label="สรุปรายการผ่อนประจำเดือน">
        <div className="installment-month-topline">
          <div className="installment-month-heading">
            <span className="installment-month-icon"><Icon name="calendar" size={19} /></span>
            <div><small>สรุปประจำเดือน</small><strong>{installmentMonthLabel(month)}</strong></div>
          </div>
          <div className="installment-month-controls">
            <button className="icon-button" type="button" aria-label="ดูเดือนก่อนหน้า" onClick={() => onMonthChange(addMonths(month, -1))}><Icon name="chevronLeft" size={18} /></button>
            <button className="icon-button" type="button" aria-label="ดูเดือนถัดไป" onClick={() => onMonthChange(addMonths(month, 1))}><Icon name="chevronRight" size={18} /></button>
          </div>
        </div>
        <div className="installment-month-summary" aria-live="polite">
          <strong>{duePlans.length}<span> รายการ</span></strong>
          <div>
            <span>{duePlans.length ? `ต้องผ่อนจาก ${dueSources.length} แหล่ง` : "ไม่มีรายการที่ต้องผ่อนเดือนนี้"}</span>
            {dueSources.length > 0 && <small>{dueSources.join(" · ")}</small>}
          </div>
        </div>
      </section>

      {plans.length ? (
        <section className="installment-plan-list" aria-label="รายการผ่อนสินค้า">
          {plans.map((plan, index) => (
            <InstallmentPlanCard
              key={plan.id}
              plan={plan}
              index={index}
              updatingPayment={updatingPayment}
              paidCelebrationKey={paidCelebrationKey}
              onTogglePayment={onTogglePayment}
              canDelete={canSave}
              canEdit={canSave}
              onEdit={() => { setEditingPlan(plan); setFormOpen(true); }}
              onDelete={() => onDelete(plan)}
            />
          ))}
        </section>
      ) : (
        <section className="installment-empty panel">
          <div className="installment-empty-icon"><Icon name="card" size={25} /></div>
          <strong>ยังไม่มีรายการผ่อน</strong>
          <span>เพิ่มสินค้าใบแรก แล้วระบบจะสร้างตารางยอดชำระรายเดือนให้</span>
          <button className="secondary-button" type="button" onClick={() => { setEditingPlan(null); setFormOpen(true); }} disabled={!canSave}><Icon name="plus" size={16} />เพิ่มรายการผ่อน</button>
        </section>
      )}

      {formOpen && <InstallmentFormModal key={editingPlan?.id || "new"} plan={editingPlan} saving={saving} onClose={() => { setFormOpen(false); setEditingPlan(null); }} onSave={async (form) => {
        const saved = editingPlan ? await onUpdate(form) : await onCreate(form);
        if (saved) { setFormOpen(false); setEditingPlan(null); }
      }} />}
    </div>
  );
}

function InstallmentPlanCard({ plan, index, updatingPayment, paidCelebrationKey, onTogglePayment, canDelete, canEdit, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const bank = installmentBanks.find((item) => item.value === plan.bank) || { label: plan.bank || "ไม่ระบุ", short: "?", tone: "loan" };
  const paidCount = plan.schedule.filter((payment) => payment.paid).length;
  const progress = plan.schedule.length ? Math.round((paidCount / plan.schedule.length) * 100) : 0;
  const amounts = calculateInstallmentAmounts(plan);
  const monthlyAmount = plan.schedule[0]?.amount || (plan.months ? amounts.installmentTotal / plan.months : 0);
  const detailsId = `installment-details-${index}`;

  function toggleDetails() {
    if (expanded) setScheduleExpanded(false);
    setExpanded(!expanded);
  }

  return (
    <article className="installment-plan-card panel" style={{ "--plan-index": index }}>
      <button className={`installment-plan-head ${expanded ? "is-expanded" : ""}`} type="button" aria-label={`${expanded ? "ซ่อน" : "ดู"}รายละเอียด ${plan.name}`} aria-controls={detailsId} aria-expanded={expanded} onClick={toggleDetails}>
        <span className={`installment-bank-mark bank-${bank.tone}`} aria-label={bank.label}>{bank.short}</span>
        <span className="installment-plan-title">
          <span className="installment-plan-bank">{bank.label} · เริ่ม {installmentMonthLabel(plan.startMonth, { short: true })}</span>
          <span className="installment-plan-name">{plan.name}</span>
        </span>
        <span className="installment-plan-amount"><strong>฿ {formatNumber(monthlyAmount)}</strong><span>ต่อเดือน</span></span>
        <span className={`installment-expand ${expanded ? "is-expanded" : ""}`} aria-hidden="true"><Icon name="chevronRight" size={18} /></span>
      </button>
      {expanded && (
        <div id={detailsId} className="installment-plan-details">
          <div className="installment-progress-row">
            <div className="installment-progress-track"><span style={{ width: `${progress}%` }} /></div>
            <span>ชำระแล้ว {paidCount} จาก {plan.schedule.length} งวด</span>
            <strong>{progress}%</strong>
          </div>
          <div className="installment-detail-grid">
            <div><span>ราคาสินค้า</span><strong>฿ {formatNumber(plan.price)}</strong></div>
            <div><span>เงินดาวน์</span><strong>฿ {formatNumber(amounts.downPayment)}</strong></div>
            <div><span>ยอดหลังหักเงินดาวน์</span><strong>฿ {formatNumber(amounts.financedAmount)}</strong></div>
            <div><span>ดอกเบี้ยรวม ({formatNumber(plan.interestRate)}%)</span><strong>฿ {formatNumber(amounts.interestAmount)}</strong></div>
            <div><span>ยอดผ่อนรวม</span><strong>฿ {formatNumber(amounts.installmentTotal)}</strong></div>
            <div className="installment-detail-total"><span>รวมจ่ายทั้งหมด</span><strong>฿ {formatNumber(amounts.totalAmount)}</strong></div>
          </div>
          <button className="installment-schedule-toggle" type="button" aria-expanded={scheduleExpanded} onClick={() => setScheduleExpanded((value) => !value)}>
            <span>{scheduleExpanded ? "ซ่อนตารางผ่อน" : `ดูตารางผ่อนทั้งหมด (${plan.schedule.length} งวด)`}</span>
            <Icon name="chevronRight" size={16} />
          </button>
          {scheduleExpanded && (
            <div className="installment-schedule-wrap">
              <div className="installment-schedule-title"><div><h4>ตารางชำระรายเดือน</h4><span>เริ่มชำระ {installmentMonthLabel(plan.startMonth)} · ปรับเศษสตางค์ในงวดสุดท้าย</span></div></div>
              <div className="installment-schedule-table" role="table" aria-label={`ตารางผ่อน ${plan.name}`}>
                <div className="installment-schedule-row installment-schedule-head" role="row"><span role="columnheader">งวด</span><span role="columnheader">เดือน</span><span role="columnheader">จำนวนเงิน</span><span role="columnheader">สถานะ</span></div>
                {plan.schedule.map((payment) => {
                  const key = `${plan.id}:${payment.installmentNumber}`;
                  const isUpdating = updatingPayment === key;
                  return (
                    <div className={`installment-schedule-row ${payment.paid ? "paid" : ""} ${paidCelebrationKey === key ? "paid-confirming" : ""}`} role="row" key={payment.installmentNumber}>
                      <span data-label="งวด" role="cell">งวดที่ {payment.installmentNumber}</span>
                      <span data-label="เดือน" role="cell">{installmentMonthLabel(payment.month)}</span>
                      <strong data-label="จำนวนเงิน" role="cell">฿ {formatNumber(payment.amount)}</strong>
                      <span data-label="สถานะ" role="cell">
                        <button className={`payment-toggle ${payment.paid ? "is-paid" : ""} ${paidCelebrationKey === key ? "paid-confirming" : ""}`} type="button" disabled={Boolean(updatingPayment)} aria-pressed={payment.paid} onClick={() => onTogglePayment(plan.id, payment.installmentNumber, !payment.paid)}>
                          <span className="payment-check"><Icon name={payment.paid ? "check" : "clock"} size={13} /></span>
                          {isUpdating ? "กำลังบันทึก…" : payment.paid ? "ชำระแล้ว" : "ทำเครื่องหมายว่าจ่ายแล้ว"}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="installment-delete-row"><button className="secondary-button installment-edit-button" type="button" onClick={onEdit} disabled={!canEdit} title={!canEdit ? "รอการเชื่อมต่อ Apps Script เพื่อบันทึกการแก้ไข" : undefined}><Icon name="edit" size={15} />แก้ไขข้อมูล</button><span>นำแผนนี้ออกจากรายการผ่อน</span><button className="danger-button" type="button" onClick={onDelete} disabled={!canDelete} title={!canDelete ? "รอการเชื่อมต่อ Apps Script เพื่อบันทึกการลบ" : undefined}><Icon name="trash" size={15} />ลบแผนผ่อน</button></div>
        </div>
      )}
    </article>
  );
}

function SubscriptionsView({ subscriptions, selectedMonth, storageMode, syncReady, syncError, onRetrySync, saving, onCreate, onSelect, onDelete, onSettings, categoryOptions: availableCategories, onAddCategory, editingSubscription, onCloseEdit }) {
  const [formOpen, setFormOpen] = useState(false);
  const canSave = storageMode !== "google" || syncReady;
  const monthlyDue = useMemo(() => subscriptions.map((subscription) => ({
    ...subscription,
    dueDate: subscriptionBillingDate(subscription, selectedMonth),
  })).filter((subscription) => subscription.dueDate), [subscriptions, selectedMonth]);
  const totalDue = monthlyDue.reduce((sum, subscription) => sum + Number(subscription.amount || 0), 0);
  const monthlyEquivalent = subscriptions.reduce((sum, subscription) => sum + Number(subscription.amount || 0) / (subscription.cycle === "yearly" ? 12 : 1), 0);
  const orderedSubscriptions = useMemo(() => subscriptions.map((subscription) => {
    const dueDate = subscriptionBillingDate(subscription, selectedMonth);
    const nextDate = nextSubscriptionBillingDate(subscription, selectedMonth);
    return { ...subscription, dueDate, nextDate };
  }).sort((left, right) => {
    if (left.dueDate && !right.dueDate) return -1;
    if (!left.dueDate && right.dueDate) return 1;
    return String(left.nextDate || "9999").localeCompare(String(right.nextDate || "9999")) || left.name.localeCompare(right.name, "th");
  }), [subscriptions, selectedMonth]);

  return (
    <div className="page-stack subscriptions-page">
      <section className="page-intro">
        <div><h2>ค่าสมัครบริการ</h2><p>ดูแอปที่เรียกเก็บในเดือน {getMonthLabel(selectedMonth)} พร้อมรอบต่ออายุและช่องทางชำระ</p></div>
        <button className="primary-button subscription-add-button" type="button" onClick={() => setFormOpen(true)} disabled={!canSave} title={!canSave ? "อัปเดต Apps Script ก่อนบันทึกรายการข้ามอุปกรณ์" : undefined}><Icon name="plus" size={18} />เพิ่มบริการ</button>
      </section>

      {storageMode === "google" && !syncReady && <section className="installment-sync-notice" role="status"><span className="installment-sync-icon"><Icon name="info" size={18} /></span><div><strong>ยังซิงก์รายการสมัครบริการไม่ได้</strong><span>{syncError || "อัปเดต Apps Script เพื่อเปิดใช้รายการนี้"}</span></div><button className="secondary-button" type="button" onClick={onRetrySync}>ลองเชื่อมต่ออีกครั้ง</button></section>}
      {storageMode !== "google" && <section className="installment-sync-notice local" role="status"><span className="installment-sync-icon"><Icon name="info" size={18} /></span><div><strong>ข้อมูลทดลองในอุปกรณ์นี้</strong><span>รายการสมัครบริการจะบันทึกไว้ในเครื่องนี้ จนกว่าจะเชื่อมต่อ Google Sheets</span></div><button className="secondary-button" type="button" onClick={onSettings}>การเชื่อมต่อ</button></section>}

      <section className="subscription-summary" aria-label="สรุปค่าสมัครบริการรายเดือน">
        <article className="subscription-summary-main"><span className="subscription-summary-icon"><Icon name="calendar" size={19} /></span><div><small>ครบกำหนดเดือนนี้</small><strong>฿ {formatNumber(totalDue)}</strong><span>{monthlyDue.length} บริการ · {getMonthLabel(selectedMonth)}</span></div></article>
        <article><small>บริการที่ติดตาม</small><strong>{subscriptions.length} <span>รายการ</span></strong><span>รวมรายเดือนและรายปี</span></article>
        <article><small>เฉลี่ยต่อเดือน</small><strong>฿ {formatNumber(monthlyEquivalent)}</strong><span>เฉลี่ยค่าสมัครรายปี ÷ 12 เดือน</span></article>
      </section>

      <section className="panel subscription-list-panel">
        <div className="panel-header subscription-list-header"><div><h3>รายการสมัครบริการ</h3><span>{orderedSubscriptions.length} รายการ · แตะเพื่อดูรายละเอียด</span></div><strong className="subscription-month-total">฿ {formatNumber(totalDue)} <small>เดือนนี้</small></strong></div>
        {orderedSubscriptions.length ? <div className="subscription-list">{orderedSubscriptions.map((subscription) => <SubscriptionRow key={subscription.id} subscription={subscription} selectedMonth={selectedMonth} onSelect={() => onSelect(subscription)} onDelete={() => onDelete(subscription)} />)}</div> : <div className="subscription-empty"><span><Icon name="calendar" size={22} /></span><strong>ยังไม่มีบริการที่ติดตาม</strong><small>เพิ่มชื่อแอปหรือบริการ แล้วระบบจะแสดงเดือนที่เรียกเก็บให้อัตโนมัติ</small><button className="secondary-button" type="button" onClick={() => setFormOpen(true)} disabled={!canSave}><Icon name="plus" size={16} />เพิ่มบริการแรก</button></div>}
      </section>

      {(formOpen || editingSubscription) && <SubscriptionFormModal key={editingSubscription?.id || "new"} subscription={editingSubscription} saving={saving} categoryOptions={availableCategories} onAddCategory={onAddCategory} onClose={() => { setFormOpen(false); onCloseEdit?.(); }} onSave={async (form) => { const saved = await onCreate(form); if (saved) { setFormOpen(false); onCloseEdit?.(); } }} />}
    </div>
  );
}

function SubscriptionRow({ subscription, selectedMonth, onSelect, onDelete }) {
  const initials = subscription.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <div className={`subscription-row ${subscription.dueDate ? "is-due" : ""}`}>
      <button className="subscription-row-main" type="button" onClick={onSelect} aria-label={`ดูรายละเอียด ${subscription.name}`}>
        <span className="subscription-app-mark">{initials || "A"}</span>
        <span className="subscription-row-copy"><strong>{subscription.name}</strong><small>{subscription.category || "อื่นๆ"} · {subscription.paymentMethod}</small><span className={`subscription-due-label ${subscription.dueDate ? "due-now" : ""}`}>{subscription.dueDate ? `เรียกเก็บ ${formatDate(subscription.dueDate)}` : `รอบถัดไป ${formatDate(subscription.nextDate)}`}</span></span>
        <span className="subscription-row-amount"><strong>฿ {formatNumber(subscription.amount)}</strong><small>{subscription.cycle === "yearly" ? "รายปี" : "รายเดือน"}</small></span>
        <span className="subscription-row-chevron"><Icon name="chevronRight" size={17} /></span>
      </button>
      <button className="icon-button subscription-delete-button" type="button" onClick={onDelete} aria-label={`ลบ ${subscription.name}`} title={`ลบ ${subscription.name}`}><Icon name="trash" size={17} /></button>
    </div>
  );
}

function SubscriptionFormModal({ subscription, saving, categoryOptions: availableCategories, onAddCategory, onClose, onSave }) {
  const [form, setForm] = useState(() => subscription ? { ...subscription, amount: String(subscription.amount) } : { name: "", amount: "", cycle: "monthly", nextBillingDate: defaultSubscriptionBillingDate(), category: "บันเทิง", paymentMethod: "KBank", note: "" });
  function change(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  async function submit(event) {
    event.preventDefault();
    await onSave({ ...form, amount: Number(form.amount), id: form.id || globalThis.crypto?.randomUUID?.() || `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
  }
  return (
    <div className="modal-backdrop subscription-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="subscription-form-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-form-title">
        <header className="modal-header"><div><span className="modal-kicker">บริการที่เรียกเก็บเป็นประจำ</span><h2 id="subscription-form-title">{subscription ? "แก้ไขรายการสมัครบริการ" : "เพิ่มรายการสมัครบริการ"}</h2></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose} disabled={saving}><Icon name="close" size={19} /></button></header>
        <form onSubmit={submit}>
          <div className="review-form subscription-form-body">
            <label>ชื่อแอปหรือบริการ<input autoFocus required maxLength={120} placeholder="เช่น iCloud+, Netflix, YouTube Premium" value={form.name} onChange={(event) => change("name", event.target.value)} /></label>
            <div className="form-two-col"><label>ยอดเรียกเก็บ (บาท)<input type="number" min="0.01" max="100000000" step="0.01" required placeholder="เช่น 99" value={form.amount} onChange={(event) => change("amount", event.target.value)} /></label><label>รอบเรียกเก็บ<select value={form.cycle} onChange={(event) => change("cycle", event.target.value)}><option value="monthly">รายเดือน</option><option value="yearly">รายปี</option></select></label></div>
            <div className="form-two-col"><label>วันเรียกเก็บครั้งถัดไป<input type="date" required value={form.nextBillingDate} onChange={(event) => change("nextBillingDate", event.target.value)} /></label><CategorySelect label="หมวดหมู่" scope="subscriptions" value={form.category} options={availableCategories} onChange={(value) => change("category", value)} onAddCategory={onAddCategory} /></div>
            <label>ช่องทางชำระ<select value={form.paymentMethod} onChange={(event) => change("paymentMethod", event.target.value)}>{subscriptionPaymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label>หมายเหตุ<textarea rows="2" maxLength={500} placeholder="เช่น แพ็กเกจครอบครัว หรือบัญชีที่ใช้" value={form.note} onChange={(event) => change("note", event.target.value)} /></label>
          </div>
          <footer className="modal-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>ยกเลิก</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : <><Icon name="check" size={17} />{subscription ? "บันทึกการแก้ไข" : "บันทึกรายการ"}</>}</button></footer>
        </form>
      </section>
    </div>
  );
}

function SubscriptionDetailModal({ subscription, selectedMonth, onClose, onEdit, onDelete }) {
  const dueDate = subscriptionBillingDate(subscription, selectedMonth);
  const nextDate = nextSubscriptionBillingDate(subscription, selectedMonth);
  return (
    <div className="modal-backdrop subscription-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="subscription-detail-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-detail-title">
        <header className="modal-header"><div><span className="modal-kicker">รายละเอียดบริการ</span><h2 id="subscription-detail-title">{subscription.name}</h2></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><Icon name="close" size={19} /></button></header>
        <div className="subscription-detail-content">
          <div className="subscription-detail-amount"><span><Icon name="calendar" size={18} /></span><div><small>{dueDate ? `ครบกำหนด ${getMonthLabel(selectedMonth)}` : `ไม่มีรอบเรียกเก็บใน ${getMonthLabel(selectedMonth)}`}</small><strong>฿ {formatNumber(subscription.amount)}</strong></div><em>{subscription.cycle === "yearly" ? "รายปี" : "รายเดือน"}</em></div>
          <dl className="subscription-detail-list"><div><dt>วันที่เรียกเก็บ</dt><dd>{dueDate ? formatDate(dueDate) : `ครั้งถัดไป ${formatDate(nextDate)}`}</dd></div><div><dt>หมวดหมู่</dt><dd>{subscription.category || "อื่นๆ"}</dd></div><div><dt>ช่องทางชำระ</dt><dd>{subscription.paymentMethod}</dd></div>{subscription.note && <div><dt>หมายเหตุ</dt><dd>{subscription.note}</dd></div>}</dl>
        </div>
        <footer className="modal-footer subscription-detail-footer"><button className="danger-button" type="button" onClick={onDelete}><Icon name="trash" size={16} />ลบบริการ</button><div className="subscription-detail-actions"><button className="secondary-button" type="button" onClick={onEdit}><Icon name="edit" size={15} />แก้ไข</button><button className="secondary-button" type="button" onClick={onClose}>ปิด</button></div></footer>
      </section>
    </div>
  );
}

function InstallmentFormModal({ plan, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    id: plan?.id || "",
    name: plan?.name || "",
    price: plan ? String(plan.price) : "",
    downPayment: plan ? String(plan.downPayment) : "0",
    interestRate: plan ? String(plan.interestRate) : "0",
    months: plan ? String(plan.months) : "10",
    bank: plan?.bank || "กสิกรไทย",
    startMonth: plan?.startMonth || nextInstallmentMonth(),
    schedule: plan?.schedule || [],
    createdAt: plan?.createdAt || "",
  }));
  const [formError, setFormError] = useState("");
  const hasPaidPayments = Boolean(plan?.schedule.some((payment) => payment.paid));
  const price = Number(form.price);
  const downPayment = Number(form.downPayment || 0);
  const rate = Number(form.interestRate);
  const months = Number(form.months);
  const amounts = calculateInstallmentAmounts({ price: price || 0, downPayment, interestRate: rate });
  const regularPayment = months > 0 ? Math.floor((amounts.installmentTotal / months) * 100) / 100 : 0;

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (hasPaidPayments && months < Math.max(...plan.schedule.filter((payment) => payment.paid).map((payment) => payment.installmentNumber))) {
      setFormError("จำนวนงวดต้องไม่ต่ำกว่างวดที่ชำระไปแล้ว");
      return;
    }
    const id = form.id || globalThis.crypto?.randomUUID?.() || `INS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const refreshed = prepareInstallmentPlan({ ...form, id, price, downPayment, interestRate: rate, months, schedule: [] });
    const paidPayments = new Map((plan?.schedule || []).filter((payment) => payment.paid).map((payment) => [payment.installmentNumber, payment]));
    const schedule = refreshed.schedule.map((payment) => paidPayments.get(payment.installmentNumber) || payment);
    await onSave({ ...refreshed, createdAt: plan?.createdAt || refreshed.createdAt, schedule });
  }

  return (
    <div className="modal-backdrop installment-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="installment-form-modal" role="dialog" aria-modal="true" aria-labelledby="installment-form-title">
        <header className="modal-header">
          <div><span className="modal-kicker">แผนผ่อนสินค้า</span><h2 id="installment-form-title">{plan ? "แก้ไขรายการผ่อน" : "เพิ่มรายการผ่อน"}</h2></div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose} disabled={saving}><Icon name="close" size={19} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="installment-form-body">
            <div className="review-form installment-fields">
              <label>ชื่อรายการสินค้า<input autoFocus maxLength={120} required placeholder="เช่น iPad Air, โทรศัพท์" value={form.name} onChange={(event) => change("name", event.target.value)} /></label>
              <div className="form-two-col">
                <label>ราคาสินค้า (บาท)<input type="number" min="0.01" max="100000000" step="0.01" required placeholder="เช่น 25000" value={form.price} disabled={hasPaidPayments} onChange={(event) => change("price", event.target.value)} /></label>
                <label>เงินดาวน์ (บาท)<input type="number" min="0" max={price > 0 ? Math.max(0, price - 0.01) : 0} step="0.01" required value={form.downPayment} disabled={hasPaidPayments} onChange={(event) => change("downPayment", event.target.value)} /><small className="installment-field-hint">หักออกจากราคาก่อนคำนวณดอกเบี้ย</small></label>
              </div>
              <div className="form-two-col">
                <label>ดอกเบี้ยรวมตลอดแผน (%)<input type="number" min="0" max="100" step="0.01" required value={form.interestRate} disabled={hasPaidPayments} onChange={(event) => change("interestRate", event.target.value)} /><small className="installment-field-hint">เริ่มต้น 0% · คิดจากยอดหลังหักเงินดาวน์</small></label>
                <label>จำนวนเดือน<input type="number" min="1" max="60" step="1" required value={form.months} disabled={hasPaidPayments} onChange={(event) => change("months", event.target.value)} /></label>
              </div>
              {hasPaidPayments && <p className="installment-edit-note"><Icon name="info" size={15} />แก้ชื่อหรือธนาคารได้ ส่วนยอดและจำนวนงวดล็อกไว้เพื่อรักษาประวัติงวดที่ชำระแล้ว</p>}
              <div className="installment-start-month" aria-live="polite"><span className="installment-start-icon"><Icon name="calendar" size={16} /></span><span><small>เริ่มชำระงวดแรก</small><strong>{installmentMonthLabel(form.startMonth)}</strong></span></div>
              <fieldset className="installment-bank-picker">
                <legend>ธนาคาร / สินเชื่อ</legend>
                <div>{installmentBanks.map((bank) => <button key={bank.value} className={`installment-bank-choice ${form.bank === bank.value ? "selected" : ""}`} type="button" disabled={saving} aria-pressed={form.bank === bank.value} onClick={() => change("bank", bank.value)}><span className={`installment-bank-mark bank-${bank.tone}`}>{bank.short}</span><span>{bank.label}</span><span className="bank-choice-check"><Icon name="check" size={13} /></span></button>)}</div>
              </fieldset>
            </div>
            <aside className="installment-live-preview" aria-live="polite">
              <span className="installment-preview-icon"><Icon name="chart" size={19} /></span>
              <small>ประมาณการยอดผ่อน</small>
              <strong>฿ {formatNumber(regularPayment)}<em> / เดือน</em></strong>
              <div><span>เงินดาวน์ (ชำระวันนี้)</span><b>฿ {formatNumber(amounts.downPayment)}</b></div>
              <div><span>ยอดหลังหักเงินดาวน์</span><b>฿ {formatNumber(amounts.financedAmount)}</b></div>
              <div><span>ดอกเบี้ยรวม</span><b>฿ {formatNumber(amounts.interestAmount)}</b></div>
              <div><span>ยอดผ่อนรวม</span><b>฿ {formatNumber(amounts.installmentTotal)}</b></div>
              <div className="preview-total"><span>รวมจ่ายทั้งหมด</span><b>฿ {formatNumber(amounts.totalAmount)}</b></div>
              <p>คิดดอกเบี้ยจากยอดคงเหลือหลังหักเงินดาวน์ แบ่งจ่ายรายเดือนและปรับเศษสตางค์ในงวดสุดท้าย</p>
            </aside>
          </div>
          {formError && <div className="installment-form-error" role="alert"><Icon name="info" size={15} />{formError}</div>}
          <footer className="modal-footer">
            <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button className="primary-button" type="submit" disabled={saving || !form.name.trim() || !(price > 0) || downPayment < 0 || downPayment >= price || !(months > 0)}><Icon name={saving ? "clock" : "check"} size={16} />{saving ? "กำลังบันทึก…" : plan ? "บันทึกการแก้ไข" : "บันทึกแผนผ่อน"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function CoachView({ summary, selectedMonth }) {
  const ratio = summary.debtRatio;
  const description = summary.hasIncome
    ? `ยอดชำระหนี้ที่บันทึก ฿ ${formatNumber(summary.debt)} คิดเป็น ${ratio}% ของรายรับที่บันทึกไว้ ตัวเลขนี้ไม่รวมยอดหนี้คงค้างหรือรายการที่ยังไม่ได้บันทึก`
    : "เดือนนี้ยังไม่มีรายรับที่บันทึก จึงยังคำนวณสัดส่วนไม่ได้";
  const balanceGuidance = summary.hasIncome
    ? `ผลต่างรายรับและรายจ่ายที่บันทึก ฿ ${formatNumber(summary.balance)} · ยังไม่รวมบิลที่ถึงกำหนดในอนาคต ควรตรวจยอดก่อนวางแผนเงินสำรอง`
    : "บันทึกรายรับและรายจ่ายก่อน เพื่อให้เห็นผลต่างของรายการในเดือนนี้";
  return (
    <div className="page-stack">
      <section className="page-intro"><div><h2>แนวทางการเงิน</h2><p>สรุปจากรายการที่บันทึกไว้ในเดือน {getMonthLabel(selectedMonth)}</p></div><span className="beta-label"><Icon name="sparkles" size={15} />คำนวณจากรายการ</span></section>
      <section className="coach-hero"><div className="coach-orb"><Icon name="sparkles" size={28} /></div><div><span className="coach-kicker">ข้อมูลเดือนนี้</span><h3>{summary.hasIncome ? "สัดส่วนที่บันทึกไว้" : "ข้อมูลยังไม่พอคำนวณ"}</h3><p>{description}</p></div><div className="coach-number"><strong>{summary.hasIncome ? `${ratio}%` : "—"}</strong><span>ยอดชำระหนี้ต่อรายรับ</span></div></section>
      <section className="coach-grid"><AdviceCard icon="wallet" title="ดูผลต่างที่บันทึก" tone="green" text={balanceGuidance} /><AdviceCard icon="card" title="รวมวันครบกำหนด" tone="blue" text="เพิ่มแผนผ่อนหรือบริการรายเดือน เพื่อดูยอดและวันชำระที่ต้องเตรียมในแต่ละเดือน" /><AdviceCard icon="sparkles" title="ตรวจข้อมูลจากสลิป" tone="amber" text="ระบบอ่านข้อความเบื้องต้นจากรูปบนอุปกรณ์ ข้อมูลยังไม่ถูกบันทึกจนกว่าจะตรวจสอบและยืนยัน" /></section>
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

function getDriveThumbnailUrl(evidenceUrl) {
  try {
    const url = new URL(evidenceUrl);
    if (!['drive.google.com', 'docs.google.com'].includes(url.hostname)) return '';
    const fileId = url.pathname.match(/\/d\/([-A-Za-z0-9_]+)/)?.[1] || url.searchParams.get('id');
    return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200` : '';
  } catch {
    return '';
  }
}

function SavedEvidencePreview({ transactionId, evidenceUrl }) {
  const [preview, setPreview] = useState({ state: "loading", url: "", mimeType: "" });

  useEffect(() => {
    const controller = new AbortController();
    let previewUrl = "";
    setPreview({ state: "loading", url: "", mimeType: "" });
    getEvidencePreview(transactionId, controller.signal)
      .then((result) => {
        previewUrl = result.url;
        setPreview({ state: "ready", url: result.url, mimeType: result.mimeType });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const thumbnailUrl = getDriveThumbnailUrl(evidenceUrl);
        setPreview(thumbnailUrl
          ? { state: "fallback", url: thumbnailUrl, mimeType: "image/*" }
          : { state: "failed", url: "", mimeType: "" });
      });

    return () => {
      controller.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [transactionId, evidenceUrl]);

  if (preview.state === "loading") {
    return <div className="preview-empty"><Icon name="image" size={27} /><span>กำลังโหลดภาพหลักฐานจาก Drive…</span></div>;
  }
  if (preview.state === "failed") {
    return <div className="preview-empty"><Icon name="image" size={27} /><span>แสดงภาพหลักฐานไม่ได้<br />กดเปิดไฟล์ใน Drive เพื่อตรวจสอบ</span></div>;
  }
  if (preview.mimeType === "application/pdf") {
    return <iframe className="evidence-pdf-preview" src={preview.url} title="หลักฐาน PDF ใน Google Drive" />;
  }
  return <img src={preview.url} alt="หลักฐานรายการจาก Google Drive" onError={() => setPreview((current) => ({ ...current, state: "failed", url: "" }))} />;
}

function ReviewModal({ draft, monthChoices, transactionNameOptions, categoryOptions: availableCategories, onAddCategory, saving, storageMode, onChange, onAttachEvidence, onClose, onConfirm, onRequestDelete }) {
  const isPending = Boolean(draft.isPending);
  const isExisting = Boolean(draft.isExisting) && !isPending;
  const isOcrProcessing = draft.ocrStatus === "reading";
  const fieldsDisabled = isExisting || isOcrProcessing;
  const imageSaveMessage = storageMode === "google"
    ? "รูปจะส่งไป Drive เมื่อกดยืนยันเท่านั้น"
    : "โหมดทดลองจะบันทึกเฉพาะข้อมูลในอุปกรณ์และไม่ส่งภาพไป Drive";
  const reviewMessage = draft.isDemoDetected
    ? "ระบบจำลองตรวจพบข้อมูลจากรูปตัวอย่าง โปรดตรวจสอบความถูกต้องก่อนยืนยัน"
    : draft.ocrStatus === "reading"
      ? `${ocrProgressLabel(draft.ocrPhase)}${draft.ocrProgress > 0 ? ` ${draft.ocrProgress}%` : "…"} ประมวลผลบนอุปกรณ์นี้ ${imageSaveMessage}`
      : draft.ocrStatus === "done"
        ? `OCR อ่านข้อมูลได้ ${draft.ocrFieldsRead} ช่อง${draft.ocrMissingFields?.length ? ` · อ่านไม่ชัดหรือผลไม่ตรงกัน: ${draft.ocrMissingFields.join(", ")}` : ""} ผล OCR ยังไม่ใช่การยืนยันจากธนาคาร โปรดตรวจสอบก่อนบันทึก ${imageSaveMessage}`
        : draft.ocrStatus === "empty" || draft.ocrStatus === "unrecognized"
          ? "อ่านข้อความได้ไม่พอสำหรับเติมข้อมูล ช่องที่อ่านไม่ได้กรุณากรอกเอง แล้วตรวจสอบก่อนบันทึก"
          : draft.ocrStatus === "unsupported"
            ? "OCR รองรับเฉพาะไฟล์รูปภาพในตอนนี้ ไฟล์ PDF กรุณากรอกข้อมูลเอง"
            : draft.ocrStatus === "failed"
              ? "OCR อ่านรูปนี้ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วกรอกข้อมูลเองได้เลย"
            : "เลือกรูปสลิปเพื่อให้ OCR อ่านข้อมูลเบื้องต้น";
  const qrReviewMessage = !draft.qrDetected
    ? ""
    : draft.ocrQrAmountMismatch
      ? `ยอด OCR (${(draft.ocrAmountCandidates || []).map((amount) => formatNumber(amount)).join(" / ")} บาท) ไม่ตรงกับยอดใน QR (${formatNumber(draft.qrAmount)} บาท) ระบบเว้นยอดไว้ให้ตรวจสอบเอง · QR นี้ยังไม่ได้ยืนยันกับธนาคาร`
      : draft.qrAmount != null
        ? `อ่าน QR ในอุปกรณ์ได้ พบยอด ${formatNumber(draft.qrAmount)} บาทในข้อมูล QR · ใช้ประกอบการตรวจเท่านั้น ยังไม่ได้ยืนยันกับธนาคาร`
        : "อ่านพบ QR ในอุปกรณ์แล้ว แต่ไม่ได้ตรวจสอบธุรกรรมกับธนาคาร";
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="modal-header"><div><span className="modal-kicker">{isPending ? "ดำเนินการบันทึกต่อ" : isExisting ? "รายละเอียดรายการ" : "ตรวจสอบข้อมูลจากสลิป"}</span><h2 id="review-title">{isExisting || isPending ? draft.name : "รายการใหม่จากหลักฐาน"}</h2></div><button className="icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><Icon name="close" size={21} /></button></div>
        <div className="review-body">
          <div className="receipt-preview">{draft.previewUrl ? <img src={draft.previewUrl} alt="ตัวอย่างหลักฐานที่อัปโหลด" /> : draft.evidenceUrl && draft.transactionId && storageMode === "google" ? <SavedEvidencePreview transactionId={draft.transactionId} evidenceUrl={draft.evidenceUrl} /> : <div className="preview-empty"><Icon name="image" size={27} /><span>{draft.fileName || "ไม่มีภาพตัวอย่าง"}</span></div>}{draft.evidenceUrl && <a className="evidence-link" href={draft.evidenceUrl} target="_blank" rel="noreferrer">เปิดหลักฐานใน Google Drive</a>}<span className="preview-status" aria-live="polite"><Icon name={draft.ocrStatus === "done" ? "check" : "info"} size={13} />{isExisting ? "หลักฐานของรายการนี้" : isOcrProcessing ? `${ocrProgressLabel(draft.ocrPhase)}${draft.ocrProgress > 0 ? ` ${draft.ocrProgress}%` : "…"}` : draft.ocrStatus === "done" ? "อ่านข้อความแล้ว · กรุณาตรวจสอบ" : draft.ocrStatus === "unsupported" ? "ไฟล์นี้ยังอ่านอัตโนมัติไม่ได้" : draft.ocrStatus === "failed" || draft.ocrStatus === "empty" || draft.ocrStatus === "unrecognized" ? "กรุณาตรวจหรือกรอกข้อมูลเอง" : "รอตรวจสอบข้อมูล"}</span></div>
          <div className="review-form">
            {!isExisting && <div className={`review-note review-note-${draft.ocrStatus || "idle"}`} data-state={draft.ocrStatus || "idle"} role="status" aria-live="polite"><Icon name={draft.ocrStatus === "done" ? "check" : "info"} size={16} /><span>{reviewMessage}{isOcrProcessing && <span className="ocr-progress" role="progressbar" aria-label="ความคืบหน้าการอ่านข้อความ" aria-valuemin="0" aria-valuemax="100" aria-valuenow={draft.ocrProgress}><span style={{ width: `${draft.ocrProgress}%` }} /></span>}</span></div>}
            {!isExisting && qrReviewMessage && <div className={`qr-review-note${draft.ocrQrAmountMismatch ? " qr-review-note-warning" : ""}`} role="status"><Icon name={draft.ocrQrAmountMismatch ? "info" : "check"} size={15} /><span>{qrReviewMessage}</span></div>}
            {isPending && <label>แนบไฟล์ใหม่ หากระบบหารูปเดิมใน Drive ไม่พบ<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" onChange={(event) => { onAttachEvidence(event.target.files?.[0]); event.target.value = ""; }} /></label>}
            <label>วันที่เกิดรายการ<input type="date" value={draft.date || ""} onChange={(event) => onChange("date", event.target.value)} disabled={fieldsDisabled} /></label>
            <label>รายการ
              <select value={draft.name && transactionNameOptions.includes(draft.name) ? draft.name : "__custom__"} onChange={(event) => onChange("name", event.target.value === "__custom__" ? "" : event.target.value)} disabled={fieldsDisabled}>
                <option value="__custom__">พิมพ์รายการใหม่…</option>
                {transactionNameOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              {(!draft.name || !transactionNameOptions.includes(draft.name)) && <input type="text" value={draft.name || ""} onChange={(event) => onChange("name", event.target.value)} placeholder="พิมพ์ชื่อรายการ" disabled={fieldsDisabled} />}
            </label>
            <label>จำนวนเงิน (บาท)<input type="number" min="0" step="0.01" value={draft.amount ?? ""} onChange={(event) => onChange("amount", event.target.value)} disabled={fieldsDisabled} /></label>
            <div className="form-two-col"><CategorySelect label="หมวดหมู่" scope="transactions" value={draft.category || "อื่นๆ"} options={availableCategories} disabled={fieldsDisabled} onChange={(value) => onChange("category", value)} onAddCategory={onAddCategory} /><label>ช่องทางจ่าย<select value={draft.channel || "อื่นๆ"} onChange={(event) => onChange("channel", event.target.value)} disabled={fieldsDisabled}>{channelOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            <label>เดือนงบประมาณ<select value={draft.budgetMonth || getCurrentMonthValue()} onChange={(event) => onChange("budgetMonth", event.target.value)} disabled={fieldsDisabled}>{monthChoices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label>หมายเหตุ<textarea rows="2" value={draft.note || ""} onChange={(event) => onChange("note", event.target.value)} disabled={fieldsDisabled} /></label>
            {draft.ocrText && <details className="ocr-text-details"><summary>ดูข้อความที่ OCR อ่านได้</summary><pre>{draft.ocrText}</pre></details>}
          </div>
        </div>
        <div className="modal-footer review-modal-footer">{draft.transactionId && <button className="danger-button" type="button" onClick={onRequestDelete} disabled={saving}><Icon name="trash" size={16} />ลบรายการ</button>}<button className="secondary-button" type="button" onClick={onClose} disabled={saving}>{isExisting ? "ปิด" : "ยกเลิก"}</button>{!isExisting && <button className="primary-button" type="button" onClick={onConfirm} disabled={saving || isOcrProcessing}>{saving ? "กำลังบันทึก…" : isOcrProcessing ? "กำลังอ่านสลิป…" : <><Icon name="check" size={17} />{isPending ? "บันทึกต่อ" : "ยืนยันรายการ"}</>}</button>}</div>
      </section>
    </div>
  );
}

function DeleteConfirmDialog({ target, storageMode, busy, onCancel, onConfirm }) {
  const titles = {
    transaction: { type: "รายการธุรกรรม", detail: storageMode === "google" ? "รายการนี้จะถูกนำออกจากแอปและยอดสรุป ข้อมูลใน Google Sheets ยังคงอยู่ และกู้คืนได้จากหน้าประวัติ" : "รายการนี้จะถูกลบออกจากข้อมูลบนอุปกรณ์นี้" },
    installment: { type: "แผนผ่อน", detail: storageMode === "google" ? "แผนนี้และกำหนดชำระจะถูกนำออกจากแอป ข้อมูลใน Google Sheets ยังคงอยู่เป็นประวัติ" : "แผนและกำหนดชำระนี้จะถูกลบออกจากอุปกรณ์นี้" },
    subscription: { type: "รายการสมัครบริการ", detail: storageMode === "google" ? "บริการนี้จะถูกนำออกจากรายการและยอดสรุป ข้อมูลใน Google Sheets ยังคงอยู่เป็นประวัติ" : "บริการนี้จะถูกลบออกจากรายการบนอุปกรณ์นี้" },
    recurringExpense: { type: "รายจ่ายประจำ", detail: storageMode === "google" ? "รายการนี้จะถูกซ่อนจากสรุปเดือน ข้อมูลใน Google Sheets ยังเก็บไว้และกู้คืนได้ด้วยปุ่มเลิกทำ" : "รายการนี้จะถูกนำออกจากข้อมูลรายจ่ายประจำบนอุปกรณ์นี้" },
  }[target.type] || { type: "รายการ", detail: "รายการนี้จะถูกนำออกจากแอป" };
  return (
    <div className="modal-backdrop delete-confirm-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <section className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-detail">
        <span className="delete-confirm-icon"><Icon name="trash" size={21} /></span>
        <h2 id="delete-confirm-title">ยืนยันการลบ{titles.type}?</h2>
        <strong className="delete-confirm-name">{target.name || "รายการนี้"}</strong>
        <p id="delete-confirm-detail">{titles.detail}</p>
        <div className="delete-confirm-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>ยกเลิก</button><button className="danger-confirm-button" type="button" onClick={onConfirm} disabled={busy}><Icon name="trash" size={16} />{busy ? "กำลังลบ…" : "ยืนยันลบ"}</button></div>
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
