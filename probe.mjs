import { getSeasonGroups } from "./src/lib/taso.ts";

const groups = await getSeasonGroups("spljp26", "VL");
console.log("groups fetched:", groups.length);
for (const g of groups) {
  const t = g.teams ?? [];
  const sum = (k) => t.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  console.log(
    `  ${g.group_id} ${g.group_name}: teams=${t.length} Σpts=${sum("points")} Σplayed=${sum("matches_played")}`
  );
}
