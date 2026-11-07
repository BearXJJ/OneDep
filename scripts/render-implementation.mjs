import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  profiles,
  getProfileDefinition,
} from "../packages/shared/dist/deposition/index.js";
const root = resolve(import.meta.dirname, "..");
const target = resolve(root, ".local/reference/onedep/implementation.html");
const escape = (value) => {
  if (value === undefined || value === null) throw new Error("Missing documentation field");
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};
const definitions = profiles.map(getProfileDefinition);
function fields(elements, path = "") {
  return elements.flatMap((e) =>
    e.type === "panel"
      ? fields(e.elements, path).map((f) => ({
          ...f,
          condition: [e.visibleIf, f.condition].filter(Boolean).join("；"),
        }))
      : e.type === "paneldynamic"
        ? fields(e.templateElements, path + e.name + "[].")
        : [{ ...e, path: path + e.name, condition: e.visibleIf }],
  );
}
const tables = definitions
  .map(
    (
      d,
    ) => `<section><h2>${escape(d.title)}</h2><p>定义版本 ${d.revision}；${d.pages.length} 页；${d.pages.flatMap((p) => fields(p.elements)).filter((f) => f.name !== "recordId").length} 个字段定义（重复组按模板计数）。</p>
<ol>${d.pages
      .map(
        (page) =>
          `<li>${escape(page.title)}<table><thead><tr><th>字段与组件</th><th>条件与填写要求</th><th>CIF 绑定</th></tr></thead><tbody>${fields(
            page.elements,
          )
            .map(
              (f) =>
                `<tr><td>${escape(f.path)}<br>${escape(f.title)} · ${escape(f.type)}${f.readOnly ? " · 只读" : ""}</td><td>${f.name === "recordId" ? "稳定身份" : f.isRequired || f.requiredIf ? "必填" : "选填"}${f.condition ? "<br>显示：" + escape(f.condition) : ""}${f.requiredIf ? "<br>条件必填：" + escape(f.requiredIf) : ""}${f.validators?.length ? "<br>" + f.validators.map((v) => escape(v.text)).join("；") : ""}${f.x.choiceSource ? "<br>选项源：" + escape(f.x.choiceSource.kind) + " / " + escape(JSON.stringify(f.x.choiceSource)) : ""}</td><td>${f.x.bindings ? f.x.bindings.map((b) => escape(b.tag) + (b.rowKey ? "<br>行键：" + escape(b.rowKey) : "")).join("<br>") : "问卷快照"}</td></tr>`,
            )
            .join("")}</tbody></table></li>`,
      )
      .join("")}
<li>文件槽位<table><tr><th>角色</th><th>数量</th><th>格式</th><th>读取器</th></tr>${d.files.map((f) => `<tr><td>${escape(f.title)} / ${escape(f.role)}</td><td>${f.min}–${f.max}</td><td>${escape(f.extensions.join(", "))}</td><td>${escape(f.parserId)}</td></tr>`).join("")}</table></li>
<li>检查配置<table><tr><th>检查</th><th>实现</th><th>参与提交／导出</th></tr>${d.checks.map((c) => `<tr><td>${escape(c.id)}</td><td>${escape(c.adapterId)}</td><td>${c.requiredFor.length ? escape(c.requiredFor.join(", ")) : "未接入"}</td></tr>`).join("")}</table></li></ol></section>`,
  )
  .join("");
// Only the generated profile section is replaced. Local acceptance notes stay
// in the ignored delivery document and are not copied into repository code.
const start = "<!-- GENERATED PROFILES START -->";
const end = "<!-- GENERATED PROFILES END -->";
const existing = await readFile(target, "utf8");
const first = existing.indexOf(start),
  last = existing.indexOf(end);
if (first < 0 || last < first)
  throw new Error(
    "The local implementation document is missing profile markers.",
  );
await writeFile(
  target,
  existing.slice(0, first + start.length) +
    "\n" +
    tables +
    "\n" +
    existing.slice(last),
  "utf8",
);
console.log("Updated profiles in " + target);
