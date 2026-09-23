import Converter from "@/components/Converter";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-xl">
        <header className="mb-10 text-center">
          <p className="label-caps mb-3">Personal use only</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            YouTube <span className="text-[var(--muted)]">→</span> MP3
          </h1>
          <p className="mt-4 text-[var(--muted)] text-base sm:text-lg">
            Paste a link, set the tags, get a finished MP3.
          </p>
        </header>
        <Converter />
        <footer className="mt-16 text-center label-caps opacity-60">
          No ads · No tracking · Your own audio
        </footer>
      </div>
    </main>
  );
}
