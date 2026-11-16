import mark from "@/assets/logo-mark.svg";

export function Logo({ className = "", size = 36 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src={mark} alt="" width={size} height={size} className="rounded-[22%] ring-1 ring-white/15" />
      <span className="text-[1.65rem] leading-none" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
        Hotel<em className="text-brass">Pilot</em>
      </span>
    </span>
  );
}
