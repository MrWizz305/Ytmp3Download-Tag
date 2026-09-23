import NodeID3 from "node-id3";

export interface CoverImage {
  buffer: Buffer;
  mime: string;
}

export interface TrackMetadata {
  title: string;
  album?: string;
  albumArtist?: string;
  cover?: CoverImage;
}

export function writeId3Tags(filePath: string, meta: TrackMetadata): Promise<void> {
  const tags: Record<string, unknown> = {
    title: meta.title,
  };

  if (meta.album) tags.album = meta.album;
  if (meta.albumArtist) {
    // TPE1 (artist) and TPE2 (album artist / "performerInfo") both set so the
    // track shows an artist in players that only read one or the other.
    tags.artist = meta.albumArtist;
    tags.performerInfo = meta.albumArtist;
  }
  if (meta.cover) {
    tags.image = {
      mime: meta.cover.mime,
      type: { id: 3, name: "front cover" },
      description: "Cover",
      imageBuffer: meta.cover.buffer,
    };
  }

  return new Promise((resolve, reject) => {
    NodeID3.write(tags as never, filePath, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
