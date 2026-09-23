"use client";

import { useEffect, useRef, useState } from "react";

interface TrackTile {
  id: string;
  image: string;
  track: string;
  artist: string;
  trackPlays: number;
  artistPlays: number;
}

interface TileState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  grabbed: boolean;
  // Explicitly tracked, not inferred from position/speed each frame - only
  // set true by an actual grab or throw, and cleared once that tile settles.
  // Ambient physics (gravity, collisions, being shoved by another dragged
  // tile) never sets this, so untouched tiles are always consistently behind
  // content instead of flickering in front based on noisy pile jostling.
  elevated: boolean;
}

interface DragInfo {
  index: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  history: { x: number; y: number; t: number }[];
  moved: boolean;
}

const DRAG_THRESHOLD = 4;

const TILE_COUNT_TARGET = 20;
const TILE_SIZE = 52;
// Tiles collide as circles of this radius. Rotation velocity is never fully
// damped to zero (tiles keep a gentle spin), so at any moment a tile could be
// at any angle - including 45 degrees, where its corners reach out to
// TILE_SIZE * sqrt(2) / 2 from center. The radius has to cover that worst
// case or corners visibly poke through a same-size gap between centers.
const COLLISION_RADIUS = TILE_SIZE * 0.72;
const GRAVITY = 0.35;
const FLOOR_RESTITUTION = 0.55;
const WALL_RESTITUTION = 0.8;
const TILE_COLLISION_RESTITUTION = 0.5;
const MAX_VELOCITY = 45;
const THROW_VELOCITY_SCALE = 0.9;

function upsizeArtwork(url: string): string {
  return url.replace(/100x100(bb)?/, "300x300$1");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Pulled out to module scope so the linter's render-purity check (which
// flags calls to non-deterministic APIs like performance.now) doesn't treat
// this as happening during render - it's only ever invoked from pointer
// event handlers, well outside React's render cycle.
function timestamp(): number {
  return performance.now();
}

function viewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

export default function AlbumBounce() {
  const [tiles, setTiles] = useState<TrackTile[]>([]);
  const [selected, setSelected] = useState<TrackTile | null>(null);
  const elementsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const statesRef = useRef<TileState[]>([]);
  const dragRef = useRef<DragInfo | null>(null);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/bounce-tracks");
        if (!res.ok) return;
        const data = (await res.json()) as {
          tracks?: { track: string; artist: string; trackPlays: number; artistPlays: number }[];
        };
        const tracks = data.tracks ?? [];

        const results: TrackTile[] = [];
        const seenImages = new Set<string>();
        for (const t of tracks) {
          if (results.length >= TILE_COUNT_TARGET) break;
          try {
            const r = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(`${t.artist} ${t.track}`)}&entity=song&limit=1`,
            );
            if (!r.ok) continue;
            const itunes = await r.json();
            const artwork = itunes.results?.[0]?.artworkUrl100;
            if (!artwork) continue;
            const image = upsizeArtwork(artwork);
            if (seenImages.has(image)) continue;
            seenImages.add(image);
            results.push({
              id: `${t.artist}-${t.track}`,
              image,
              track: t.track,
              artist: t.artist,
              trackPlays: t.trackPlays,
              artistPlays: t.artistPlays,
            });
          } catch {
            // one track's lookup failing shouldn't stop the rest
          }
        }

        if (!cancelled) setTiles(results);
      } catch {
        // purely decorative - fail silently
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tiles.length === 0) return;

    reduceMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const bounds = viewportSize();
    statesRef.current = tiles.map(() => ({
      x: Math.random() * Math.max(bounds.width - TILE_SIZE, 0),
      y: bounds.height - TILE_SIZE - Math.random() * 80,
      vx: reduceMotionRef.current ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.5),
      vy: 0,
      rotation: Math.random() * 16 - 8,
      vr: reduceMotionRef.current ? 0 : (Math.random() - 0.5) * 0.3,
      grabbed: false,
      elevated: false,
    }));

    statesRef.current.forEach((state, i) => {
      const el = elementsRef.current[i];
      if (el) {
        el.style.transform = `translate(${state.x}px, ${state.y}px) rotate(${state.rotation}deg)`;
        el.style.zIndex = "0";
      }
    });

    if (reduceMotionRef.current) return;

    let rafId: number;

    function resolveCollisions(maxX: number, maxY: number) {
      const states = statesRef.current;
      const minDist = COLLISION_RADIUS * 2;

      for (let i = 0; i < states.length; i++) {
        for (let j = i + 1; j < states.length; j++) {
          const a = states[i];
          const b = states[j];
          // Both grabbed can't really happen (single pointer), but guard
          // anyway rather than fight two pointer-controlled positions.
          if (a.grabbed && b.grabbed) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          if (dist >= minDist) continue;

          const nx = dx / dist;
          const ny = dy / dist;
          const overlapTotal = minDist - dist;

          if (a.grabbed || b.grabbed) {
            // The grabbed tile is pointer-controlled, not physics-driven -
            // treat it as immovable and push only the other one out of its
            // way, so dragging one through the pile doesn't just clip
            // through everything else.
            const moving = a.grabbed ? b : a;
            const sign = a.grabbed ? 1 : -1;
            moving.x += sign * nx * overlapTotal;
            moving.y += sign * ny * overlapTotal;
            moving.vx = sign * nx * 3;
            moving.vy = sign * ny * 3;
            continue;
          }

          const overlap = overlapTotal / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const relVx = b.vx - a.vx;
          const relVy = b.vy - a.vy;
          const relDot = relVx * nx + relVy * ny;
          if (relDot < 0) {
            if (Math.abs(relDot) < 0.6) {
              // Slow contact (piled-up tiles being re-nudged by gravity each
              // frame) - absorb instead of bouncing, so the pile actually
              // settles rather than jittering against itself indefinitely.
              const avgVx = (a.vx + b.vx) / 2;
              const avgVy = (a.vy + b.vy) / 2;
              a.vx = avgVx;
              a.vy = avgVy;
              b.vx = avgVx;
              b.vy = avgVy;
            } else {
              const damped = relDot * TILE_COLLISION_RESTITUTION;
              a.vx += damped * nx;
              a.vy += damped * ny;
              b.vx -= damped * nx;
              b.vy -= damped * ny;
            }
          }
        }
      }

      for (const state of states) {
        if (state.grabbed) continue;
        state.x = clamp(state.x, 0, maxX);
        state.y = clamp(state.y, 0, maxY);
      }
    }

    function tick() {
      const rect = viewportSize();
      const maxX = rect.width - TILE_SIZE;
      const maxY = rect.height - TILE_SIZE;

      statesRef.current.forEach((state) => {
        if (state.grabbed) return;

        state.vy += GRAVITY;
        state.vx = clamp(state.vx, -MAX_VELOCITY, MAX_VELOCITY);
        state.vy = clamp(state.vy, -MAX_VELOCITY, MAX_VELOCITY);
        state.x += state.vx;
        state.y += state.vy;
        state.rotation += state.vr;
        // Damp rotation speed so tiles settle into a resting tilt instead of
        // spinning forever - an unbounded spin can put a tile at any angle,
        // which the collision radius has to account for at all times.
        state.vr *= 0.97;

        if (state.x <= 0) {
          state.x = 0;
          state.vx = Math.abs(state.vx) * WALL_RESTITUTION;
        } else if (state.x >= maxX) {
          state.x = maxX;
          state.vx = -Math.abs(state.vx) * WALL_RESTITUTION;
        }

        if (state.y <= 0) {
          state.y = 0;
          state.vy = Math.abs(state.vy) * WALL_RESTITUTION;
        } else if (state.y >= maxY) {
          state.y = maxY;
          state.vy = Math.abs(state.vy) > 0.6 ? -Math.abs(state.vy) * FLOOR_RESTITUTION : 0;
        }
      });

      resolveCollisions(maxX, maxY);

      statesRef.current.forEach((state, i) => {
        if (state.grabbed) return;
        const el = elementsRef.current[i];
        if (!el) return;
        el.style.transform = `translate(${state.x}px, ${state.y}px) rotate(${state.rotation}deg)`;

        // Clear the elevated flag once a thrown tile actually settles down -
        // it stays elevated for its whole flight, however it moves, and only
        // drops behind content again once it's genuinely at rest.
        if (state.elevated && Math.hypot(state.vx, state.vy) < 1) {
          state.elevated = false;
        }
        el.style.zIndex = state.elevated ? "30" : "0";
      });

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [tiles]);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, i: number) {
    const state = statesRef.current[i];
    if (!state) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    state.grabbed = true;
    state.elevated = true;

    dragRef.current = {
      index: i,
      offsetX: e.clientX - state.x,
      offsetY: e.clientY - state.y,
      startX: e.clientX,
      startY: e.clientY,
      history: [{ x: e.clientX, y: e.clientY, t: timestamp() }],
      moved: false,
    };

    const el = elementsRef.current[i];
    if (el) el.style.zIndex = "30";
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const state = statesRef.current[drag.index];
    const el = elementsRef.current[drag.index];
    if (!state || !el) return;

    const { width, height } = viewportSize();
    const maxX = width - TILE_SIZE;
    const maxY = height - TILE_SIZE;

    state.x = clamp(e.clientX - drag.offsetX, 0, maxX);
    state.y = clamp(e.clientY - drag.offsetY, 0, maxY);
    el.style.transform = `translate(${state.x}px, ${state.y}px) rotate(${state.rotation}deg)`;

    drag.history.push({ x: e.clientX, y: e.clientY, t: timestamp() });
    if (drag.history.length > 6) drag.history.shift();
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD) {
      drag.moved = true;
    }
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    if (!drag) return;

    const state = statesRef.current[drag.index];
    if (state) {
      state.grabbed = false;

      const hist = drag.history;
      if (hist.length >= 2 && !reduceMotionRef.current) {
        const first = hist[0];
        const last = hist[hist.length - 1];
        const dt = Math.max(last.t - first.t, 1);
        const scale = (16.67 / dt) * THROW_VELOCITY_SCALE;
        state.vx = clamp((last.x - first.x) * scale, -MAX_VELOCITY, MAX_VELOCITY);
        state.vy = clamp((last.y - first.y) * scale, -MAX_VELOCITY, MAX_VELOCITY);
      } else {
        state.vx = 0;
        state.vy = 0;
      }
    }

    dragRef.current = null;

    if (!drag.moved) {
      const tile = tiles[drag.index];
      if (tile) setSelected(tile);
    }
  }

  function handlePointerCancel() {
    const drag = dragRef.current;
    if (!drag) return;
    const state = statesRef.current[drag.index];
    if (state) {
      state.grabbed = false;
      state.vx = 0;
      state.vy = 0;
    }
    dragRef.current = null;
  }

  if (tiles.length === 0) return null;

  return (
    <>
      {tiles.map((tile, i) => (
        <button
          type="button"
          key={tile.id}
          ref={(el) => {
            elementsRef.current[i] = el;
          }}
          onPointerDown={(e) => handlePointerDown(e, i)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          aria-label={`${tile.track} by ${tile.artist} - view your stats`}
          className="fixed top-0 left-0 rounded-md shadow-md overflow-hidden border border-[var(--border)] bg-[var(--card)] cursor-grab active:cursor-grabbing select-none"
          style={{ width: TILE_SIZE, height: TILE_SIZE, touchAction: "none", zIndex: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tile.image} alt="" draggable={false} className="w-full h-full object-cover" />
        </button>
      ))}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="card w-full max-w-sm p-5 flex flex-col gap-4 bg-[var(--background)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4 items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.image}
                alt=""
                className="w-20 h-20 rounded-lg object-cover flex-none border border-[var(--border)]"
              />
              <div className="min-w-0">
                <p className="font-semibold leading-snug">{selected.track}</p>
                <p className="text-sm text-[var(--muted)] mt-1">{selected.artist}</p>
              </div>
            </div>

            <hr className="divider" />

            <div className="flex flex-col gap-2 text-sm">
              <p>
                You&apos;ve played this song{" "}
                <span className="font-semibold">{selected.trackPlays}</span>{" "}
                {selected.trackPlays === 1 ? "time" : "times"}.
              </p>
              <p>
                You&apos;ve played {selected.artist}{" "}
                <span className="font-semibold">{selected.artistPlays}</span>{" "}
                {selected.artistPlays === 1 ? "time" : "times"} total.
              </p>
            </div>

            <button type="button" className="btn btn-outline" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
