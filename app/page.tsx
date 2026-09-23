import Converter from "@/components/Converter";
import LastfmStats from "@/components/LastfmStats";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center px-6 pt-16 sm:pt-24 pb-56 sm:pb-64">
      <div className="relative z-10 w-full max-w-xl">
        <header className="mb-10 text-center">
          <h1
            className="text-2xl sm:text-3xl leading-relaxed"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            Welcome Aairav,
          </h1>
          <p className="mt-4 text-[var(--muted)] text-base sm:text-lg">
            What do you want to listen to today?
          </p>
        </header>
        <Converter />
        <LastfmStats />
      </div>
    </main>
  );
}
