import { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { BowlFood } from "@phosphor-icons/react/BowlFood";
import { CalendarDots } from "@phosphor-icons/react/CalendarDots";
import { Camera } from "@phosphor-icons/react/Camera";
import { CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { Check } from "@phosphor-icons/react/Check";
import { Clock } from "@phosphor-icons/react/Clock";
import { CreditCard } from "@phosphor-icons/react/CreditCard";
import { DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { DotsThree } from "@phosphor-icons/react/DotsThree";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FirstAidKit } from "@phosphor-icons/react/FirstAidKit";
import { FunnelSimple } from "@phosphor-icons/react/FunnelSimple";
import { GearSix } from "@phosphor-icons/react/GearSix";
import { GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { House } from "@phosphor-icons/react/House";
import { HandCoins } from "@phosphor-icons/react/HandCoins";
import { Image } from "@phosphor-icons/react/Image";
import { Info } from "@phosphor-icons/react/Info";
import { Lightbulb } from "@phosphor-icons/react/Lightbulb";
import { Lightning } from "@phosphor-icons/react/Lightning";
import { ListBullets } from "@phosphor-icons/react/ListBullets";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MoneyWavy } from "@phosphor-icons/react/MoneyWavy";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { ShoppingBag } from "@phosphor-icons/react/ShoppingBag";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { SquaresFour } from "@phosphor-icons/react/SquaresFour";
import { Train } from "@phosphor-icons/react/Train";
import { Trash } from "@phosphor-icons/react/Trash";
import { TrendDown } from "@phosphor-icons/react/TrendDown";
import { TrendUp } from "@phosphor-icons/react/TrendUp";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { User } from "@phosphor-icons/react/User";
import { Wallet } from "@phosphor-icons/react/Wallet";
import { X } from "@phosphor-icons/react/X";

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
  handCoins: HandCoins,
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
  camera: Camera,
  user: User,
  shield: ShieldCheck,
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
