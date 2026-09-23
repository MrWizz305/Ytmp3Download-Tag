"use client";

import { useEffect, useState } from "react";

interface Entry {
  name: string;
  artist?: string;
  playcount: number;
  rank: number;
}

interface StatsData {
  topArtists: Entry[];
  topTracks: Entry[];
}

function StatList({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No listening activity yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {entries.map((entry) => (
        <li key={entry.rank} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="truncate">
            <span className="text-[var(--muted)] mr-2">{entry.rank}.</span>
            {entry.name}
            {entry.artist && <span className="text-[var(--muted)]"> — {entry.artist}</span>}
          </span>
          <span className="text-[var(--muted)] flex-none">{entry.playcount}</span>
        </li>
      ))}
    </ol>
  );
}

export default function LastfmStats() {
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lastfm-stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: StatsData | null) => {
        if (!cancelled && json) setData(json);
      })
      .catch(() => {
        // purely decorative - fail silently
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || data.topArtists.length === 0) return null;

  return (
    <div className="card p-5 flex flex-col gap-4 mt-6">
      <p className="font-semibold">You&apos;ve been listening to...</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <p className="label-caps mb-2">Top artists</p>
          <StatList entries={data.topArtists} />
        </div>
        <div>
          <p className="label-caps mb-2">Top songs</p>
          <StatList entries={data.topTracks} />
        </div>
      </div>
    </div>
  );
}
