// Builds DOM from data. Strings always become text nodes, so transcript text can never become markup.
function apply(n, props) {
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class" && !(n instanceof SVGElement)) n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "style") Object.assign(n.style, v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
}
function fill(n, kids) {
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k instanceof Node ? k : String(k));
  return n;
}
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  apply(n, props);
  return fill(n, kids);
}
export function svg(tag, props = {}, ...kids) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  apply(n, props);
  return fill(n, kids);
}
