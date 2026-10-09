// Mounts the trading floor: sets its data, then loads the scene modules, which build top to bottom.
import { setInitial } from "./data.js";
export async function mountFloor(container, floor, hooks) {
  setInitial(container, floor, hooks);
  await import("./scene.js");
  const live = await import("./live.js");
  return { update: live.updateFloor };
}
