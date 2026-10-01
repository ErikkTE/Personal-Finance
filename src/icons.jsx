const paths = {
  grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  upload: ["M12 16V4", "m7 9 5-5 5 5", "M5 20h14"],
  list: ["M8 6h12", "M8 12h12", "M8 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  sparkles: ["m12 3-1.5 5.5L5 10l5.5 1.5L12 17l1.5-5.5L19 10l-5.5-1.5z", "m19 16-.5 2.5L16 19l2.5.5L19 22l.5-2.5L22 19l-2.5-.5z"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4V19a2 2 0 1 1-4 0v-.2A2 2 0 0 0 5.8 17.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.6 11H1.5a2 2 0 1 1 0-4h.2a2 2 0 0 0 1.4-3.4L3 3.5A2 2 0 1 1 5.8.7l.1.1A2 2 0 0 0 9.3-.6V-.7a2 2 0 1 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 20.9 7h.2a2 2 0 1 1 0 4h-.2a2 2 0 0 0-1.5 4Z"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  user: ["M20 21a8 8 0 0 0-16 0", "M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"],
  chevronLeft: ["m15 18-6-6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  wallet: ["M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", "M4 9h16", "M16 14h.01"],
  arrowUp: ["M12 19V5", "m6 11 6-6 6 6"],
  card: ["M3 6h18v12H3z", "M3 10h18", "M7 15h3"],
  chart: ["M4 19V5", "M4 19h16", "m8 15 3-4 3 2 4-7"],
  check: ["m5 12 4 4L19 6"],
  clock: ["M12 7v5l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  edit: ["m4 20 4.5-1 9.9-9.9a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z", "m13.5 7.5 3 3"],
  close: ["m6 6 12 12", "m18 6-12 12"],
  calendar: ["M5 4h14v16H5z", "M8 2v4", "M16 2v4", "M5 9h14"],
  search: ["m20 20-4.5-4.5", "M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z"],
  filter: ["M4 6h16", "M7 12h10", "M10 18h4"],
  download: ["M12 4v11", "m7 11 5 5 5-5", "M5 20h14"],
  restore: ["M3 12a9 9 0 1 0 2.64-6.36L3 8", "M3 4v4h4", "M12 8v4l3 2"],
  info: ["M12 16v-4", "M12 8h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  lightbulb: ["M9 18h6", "M10 22h4", "M8.5 14.5C7.6 13.6 7 12.4 7 11a5 5 0 0 1 10 0c0 1.4-.6 2.6-1.5 3.5-.8.8-1.5 1.4-1.5 2.5h-4c0-1.1-.7-1.7-1.5-2.5Z"],
  image: ["M4 5h16v14H4z", "m4 16 4-4 3 3 2-2 5 5", "M9 9h.01"],
  plus: ["M12 5v14", "M5 12h14"],
};

export function Icon({ name, size = 20, strokeWidth = 1.8, className = "" }) {
  const iconPaths = paths[name] || paths.info;
  return (
    <svg
      aria-hidden="true"
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths.map((path, index) => (
        <path key={`${name}-${index}`} d={path} />
      ))}
    </svg>
  );
}
