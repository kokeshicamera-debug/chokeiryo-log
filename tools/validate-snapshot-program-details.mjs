import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/function wrapSnapshotText[\s\S]*?(?=\nfunction snapshotProgramDetails)/u);
if (!match) throw new Error("保存画像の折り返し処理が見つかりません");
const context = {};
vm.runInNewContext(`${match[0]}; result=wrapSnapshotText({measureText:text=>({width:text.length*10})},"ABCDE",25);`, context);
if (Array.from(context.result).join("|") !== "AB|CD|E") throw new Error("長い表示を正しく折り返せません");
if (!html.includes("height+memoHeight+programDetailsHeight")) throw new Error("保存画像に詳細欄の高さが追加されません");
if (!html.includes("drawSnapshotElement(snapshotContext,sotaStatus,sotaStatus.textContent)")) throw new Error("画面内のSOTA表示が保存画像から消えています");
if (!html.includes("drawImage(canvas,canvasRect.left,canvasRect.top,canvasRect.width,canvasRect.height)")) throw new Error("手書きログが保存画像から消えています");

console.log("検査成功: 長文折り返し・SOTA全文・手書きログ・メモ後の詳細欄");
