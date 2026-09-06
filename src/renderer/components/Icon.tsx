import type { SVGProps } from "react";

export type IconName =
  | "arrow"
  | "back"
  | "check"
  | "close"
  | "copy"
  | "diamond"
  | "download"
  | "file"
  | "folder"
  | "gamepad"
  | "map"
  | "plus"
  | "relic"
  | "search"
  | "trash"
  | "spark";

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="m9 18 6-6-6-6" />,
    back: <path d="m15 18-6-6 6-6" />,
    check: <path d="m3 8 3 3 7-7" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    diamond: <><path d="m12 3.5 8 7.5-8 9.5L4 11l8-7.5Z" /><path d="m4 11 8 2 8-2M8.5 7l3.5 6 3.5-6" /></>,
    download: <><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 14.5V20h14v-5.5" /></>,
    file: <><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5a1.5 1.5 0 0 1 1-1.5Z" /><path d="M14 3.5V8h4" /></>,
    folder: <><path d="M3.5 7.5h6l2 2h9v9.5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5Z" /><path d="M3.5 8V5A1.5 1.5 0 0 1 5 3.5h5l2 2h7A1.5 1.5 0 0 1 20.5 7v2.5" /></>,
    gamepad: <><path d="M8 8.5h8a4 4 0 0 1 3.8 2.8l1.1 3.6a3 3 0 0 1-5 3l-1.4-1.4h-5l-1.4 1.4a3 3 0 0 1-5-3l1.1-3.6A4 4 0 0 1 8 8.5Z" /><path d="M7 11.5v4M5 13.5h4M16.5 12.5h.01M18.5 14.5h.01" /></>,
    map: <><path d="m3.5 6 5-2 7 2.5 5-2V18l-5 2-7-2.5-5 2V6Z" /><path d="M8.5 4v13.5M15.5 6.5V20" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    relic: <><circle cx="12" cy="12" r="7.5" /><path d="M12 7.5v9M7.5 12h9" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    trash: <><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>,
    spark: <><path d="m12 2 1.4 6.6L20 10l-6.6 1.4L12 18l-1.4-6.6L4 10l6.6-1.4L12 2Z" /><path d="m18.5 16 .6 2.4 2.4.6-2.4.6-.6 2.4-.6-2.4-2.4-.6 2.4-.6.6-2.4Z" /></>
  };
  return <svg viewBox={name === "check" ? "0 0 16 16" : "0 0 24 24"} aria-hidden="true" {...props}>{paths[name]}</svg>;
}
