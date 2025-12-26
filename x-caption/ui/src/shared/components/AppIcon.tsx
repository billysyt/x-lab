import type { CSSProperties } from "react";
import type { IconType } from "react-icons";
import { cn } from "../lib/cn";
import {
  FaBan,
  FaBars,
  FaCheck,
  FaCheckCircle,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaClosedCaptioning,
  FaClock,
  FaCloudDownloadAlt,
  FaCloudUploadAlt,
  FaCog,
  FaCut,
  FaExchangeAlt,
  FaDownload,
  FaEdit,
  FaExpand,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaFilter,
  FaFileAudio,
  FaFileImport,
  FaFolderOpen,
  FaHistory,
  FaHourglassStart,
  FaInbox,
  FaLink,
  FaMagnet,
  FaMinus,
  FaMousePointer,
  FaMicrophoneSlash,
  FaPause,
  FaPlay,
  FaPlus,
  FaRegSquare,
  FaSpinner,
  FaSortAmountDownAlt,
  FaStar,
  FaTimes,
  FaTrashAlt,
  FaThumbtack,
  FaUpload,
  FaUser,
  FaUsers,
  FaVideo,
  FaVolumeUp
} from "react-icons/fa";

const icons = {
  upload: FaUpload,
  bars: FaBars,
  history: FaHistory,
  cloudUploadAlt: FaCloudUploadAlt,
  chevronDown: FaChevronDown,
  chevronLeft: FaChevronLeft,
  chevronRight: FaChevronRight,
  filter: FaFilter,
  sort: FaSortAmountDownAlt,
  fileAudio: FaFileAudio,
  times: FaTimes,
  pause: FaPause,
  play: FaPlay,
  cursor: FaMousePointer,
  cut: FaCut,
  magnet: FaMagnet,
  link: FaLink,
  plus: FaPlus,
  users: FaUsers,
  user: FaUser,
  spinner: FaSpinner,
  check: FaCheck,
  trashAlt: FaTrashAlt,
  inbox: FaInbox,
  microphoneSlash: FaMicrophoneSlash,
  cloudDownloadAlt: FaCloudDownloadAlt,
  exclamationCircle: FaExclamationCircle,
  clock: FaClock,
  hourglassStart: FaHourglassStart,
  cog: FaCog,
  exchangeAlt: FaExchangeAlt,
  exclamationTriangle: FaExclamationTriangle,
  ban: FaBan,
  checkCircle: FaCheckCircle,
  minus: FaMinus,
  download: FaDownload,
  edit: FaEdit,
  expand: FaExpand,
  pin: FaThumbtack,
  pinOff: FaThumbtack,
  folderOpen: FaFolderOpen,
  fileImport: FaFileImport,
  windowMinimize: FaMinus,
  windowMaximize: FaRegSquare,
  video: FaVideo,
  volume: FaVolumeUp,
  captions: FaClosedCaptioning,
  sparkle: FaStar
} as const satisfies Record<string, IconType>;

export type AppIconName = keyof typeof icons;

export function AppIcon(props: {
  name: AppIconName;
  className?: string;
  style?: CSSProperties;
  size?: string | number;
  spin?: boolean;
}) {
  const Icon = icons[props.name];
  return (
    <Icon
      className={cn("stt-icon", props.spin && "animate-spin", props.className)}
      style={props.style}
      size={props.size}
      aria-hidden="true"
      focusable="false"
    />
  );
}
