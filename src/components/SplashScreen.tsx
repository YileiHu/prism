interface Props {
  fadeOut: boolean;
}

export default function SplashScreen({ fadeOut }: Props) {
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-base transition-opacity duration-500 ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-6 -mt-12">
        <img src="icon.png" alt="" draggable={false} className="w-20 h-20 drop-shadow-[0_0_24px_rgba(34,211,238,0.35)]" />
        <h1
          className="text-4xl font-bold tracking-[0.25em] text-primary"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          PRISM
        </h1>
        <p className="text-sm text-muted tracking-[0.3em]">个人知识管理</p>
        <div className="flex gap-2 mt-6">
          <span
            className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce"
            style={{ animationDuration: "1s" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce"
            style={{ animationDuration: "1s", animationDelay: "0.15s" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce"
            style={{ animationDuration: "1s", animationDelay: "0.3s" }}
          />
        </div>
      </div>
    </div>
  );
}
