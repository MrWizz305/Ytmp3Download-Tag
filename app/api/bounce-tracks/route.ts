import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface BounceTrack {
  track: string;
  artist: string;
  trackPlays: number;
  artistPlays: number;
  rank: number;
}

async function fetchLastfm(
  method: string,
  apiKey: string,
  username: string,
  period: string,
  limit: number,
): Promise<unknown> {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", method);
  url.searchParams.set("user", username);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("period", period);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

export async function GET() {
  const apiKey = process.env.LASTFM_API_KEY;
  const username = process.env.LASTFM_USERNAME;

  if (!apiKey || !username) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    const [tracksData, artistsData] = await Promise.all([
      fetchLastfm("user.gettoptracks", apiKey, username, "overall", 40),
      fetchLastfm("user.gettopartists", apiKey, username, "overall", 100),
    ]);

    const rawTracks =
      (tracksData as { toptracks?: { track?: unknown[] } })?.toptracks?.track ?? [];
    const rawArtists =
      (artistsData as { topartists?: { artist?: unknown[] } })?.topartists?.artist ?? [];

    const artistPlaysByName = new Map<string, number>();
    for (const raw of rawArtists) {
      const a = raw as { name?: string; playcount?: string };
      if (a.name) artistPlaysByName.set(a.name.toLowerCase(), Number(a.playcount) || 0);
    }

    const tracks: BounceTrack[] = rawTracks.map((raw, i) => {
      const t = raw as {
        name?: string;
        artist?: { name?: string };
        playcount?: string;
        ["@attr"]?: { rank?: string };
      };
      const artistName = t.artist?.name ?? "";
      return {
        track: t.name ?? "",
        artist: artistName,
        trackPlays: Number(t.playcount) || 0,
        artistPlays: artistPlaysByName.get(artistName.toLowerCase()) ?? 0,
        rank: Number(t["@attr"]?.rank) || i + 1,
      };
    });

    return NextResponse.json({ tracks });
  } catch {
    return NextResponse.json({ tracks: [] });
  }
}
