import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { closeSiblingOpportunities } from "../publish-agent";

function database(rows: { id: string; sourceUrl: string; sourceAuthor: string }[]) {
  const updateMany = vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
  return { db: { opportunity: { findMany: vi.fn(async () => rows), updateMany } } as unknown as PrismaClient, updateMany };
}

describe("closeSiblingOpportunities", () => {
  const published = "https://www.youtube.com/watch?v=VIDEO1&lc=ROOT1";

  it("cierra el mismo hilo y a la misma persona, pero no otras preguntas del video", async () => {
    const { db, updateMany } = database([
      { id: "reply-in-thread", sourceUrl: "https://www.youtube.com/watch?v=VIDEO1&lc=ROOT1.REPLY9", sourceAuthor: "otra persona" },
      { id: "same-author", sourceUrl: "https://www.youtube.com/watch?v=VIDEO1&lc=ROOT2", sourceAuthor: "@Ana" },
      { id: "other-question", sourceUrl: "https://www.youtube.com/watch?v=VIDEO1&lc=ROOT3", sourceAuthor: "@Bruno" },
      { id: "other-video", sourceUrl: "https://www.youtube.com/watch?v=VIDEO2&lc=ROOT1", sourceAuthor: "@Ana" },
    ]);

    const closed = await closeSiblingOpportunities(db, "published", "channel", published, " @ana ");

    expect(closed).toBe(2);
    expect(updateMany.mock.calls[0][0].where.id.in).toEqual(["reply-in-thread", "same-author"]);
  });

  it("no toca nada si la URL no es de un video", async () => {
    const { db, updateMany } = database([]);
    expect(await closeSiblingOpportunities(db, "published", "channel", "https://example.com/post", "@ana")).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
