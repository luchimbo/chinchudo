import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./agent-utils.mjs";
loadEnv();
const p = new PrismaClient();
const r = await p.response.findFirst({
  where: { approvedBy: { not: "" } },
  include: { opportunity: { include: { channel: true } } }
});
if (r) {
  console.log(JSON.stringify({ opp: r.opportunityId, resp: r.id, channel: r.opportunity.channel.name }));
} else {
  console.log("none");
}
await p.$disconnect();
