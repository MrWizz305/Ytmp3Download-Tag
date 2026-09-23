import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface Entry {
  name: string;
  artist?: string;
  playcount: number;
  rank: number;
}

interface StatsResponse {
  topArtists: Entry[];
  topTracks: Entry[];
}

const EMPTY: StatsResponse = { topArtists: [], topTracks: [] };

async function fetchLastfm(
  method: string,
  apiKey: string,
  username: string,
  limit: number,
): Promise<unknown> {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", method);
  url.searchParams.set("user", username);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("period", "overall");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

function parseArtists(data: unknown): Entry[] {
  const list = (data as { topartists?: { artist?: unknown[] } })?.topartists?.artist ?? [];
  return list.map((raw, i) => {
    const a = raw as { name?: string; playcount?: string; ["@attr"]?: { rank?: string } };
    return {
      name: a.name ?? "",
      playcount: Number(a.playcount) || 0,
      rank: Number(a["@attr"]?.rank) || i + 1,
    };
  });
}

function parseTracks(data: unknown): Entry[] {
  const list = (data as { toptracks?: { track?: unknown[] } })?.toptracks?.track ?? [];
  return list.map((raw, i) => {
    const t = raw as {
      name?: string;
      artist?: { name?: string };
      playcount?: string;
      ["@attr"]?: { rank?: string };
    };
    return {
      name: t.name ?? "",
      artist: t.artist?.name,
      playcount: Number(t.playcount) || 0,
      rank: Number(t["@attr"]?.rank) || i + 1,
    };
  });
}

export async function GET() {
  const apiKey = process.env.LASTFM_API_KEY;
  const username = process.env.LASTFM_USERNAME;

  if (!apiKey || !username) {
    return NextResponse.json(EMPTY);
  }

  try {
    const [artists, tracks] = await Promise.all([
      fetchLastfm("user.gettopartists", apiKey, username, 8),
      fetchLastfm("user.gettoptracks", apiKey, username, 8),
    ]);

    return NextResponse.json({
      topArtists: parseArtists(artists),
      topTracks: parseTracks(tracks),
    } satisfies StatsResponse);
  } catch {
    return NextResponse.json(EMPTY);
  }
}
