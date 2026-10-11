import {
  ArrowCounterClockwise,
  BowlFood,
  CalendarDots,
  CaretLeft,
  CaretRight,
  ChartLineUp,
  Check,
  Clock,
  CreditCard,
  DeviceMobile,
  DotsThree,
  DownloadSimple,
  FirstAidKit,
  FunnelSimple,
  GearSix,
  GraduationCap,
  House,
  Image,
  Info,
  Lightbulb,
  Lightning,
  ListBullets,
  MagnifyingGlass,
  MoneyWavy,
  PencilSimple,
  Plus,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Sparkle,
  SquaresFour,
  Train,
  Trash,
  TrendDown,
  TrendUp,
  UploadSimple,
  Wallet,
  X,
} from "@phosphor-icons/react";

const icons = {
  grid: SquaresFour,
  upload: UploadSimple,
  list: ListBullets,
  more: DotsThree,
  sparkles: Sparkle,
  settings: GearSix,
  chevronLeft: CaretLeft,
  chevronRight: CaretRight,
  wallet: Wallet,
  arrowUp: TrendUp,
  arrowDown: TrendDown,
  card: CreditCard,
  chart: ChartLineUp,
  check: Check,
  clock: Clock,
  edit: PencilSimple,
  close: X,
  calendar: CalendarDots,
  search: MagnifyingGlass,
  filter: FunnelSimple,
  download: DownloadSimple,
  restore: ArrowCounterClockwise,
  info: Info,
  lightbulb: Lightbulb,
  image: Image,
  plus: Plus,
  trash: Trash,
  food: BowlFood,
  train: Train,
  money: MoneyWavy,
  home: House,
  phone: DeviceMobile,
  receipt: Receipt,
  shopping: ShoppingBag,
  health: FirstAidKit,
  education: GraduationCap,
  insurance: ShieldCheck,
  utilities: Lightning,
};

export function Icon({ name, size = 20, strokeWidth = 1.8, className = "" }) {
  const Glyph = icons[name] || Info;

  return (
    <Glyph
      aria-hidden="true"
      className={`icon ${className}`}
      size={size}
      weight="duotone"
      strokeWidth={strokeWidth}
    />
  );
}
