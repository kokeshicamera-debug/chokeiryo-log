# 都市公園候補の公式区域昇格・保留一覧

`audit-unpromoted-urban-pota.mjs` は、国土交通省の都市公園GISから作成済みの候補のうち、まだ公式区域判定へ昇格していないPOTAを整理します。

## 実行

```text
node tools/audit-unpromoted-urban-pota.mjs
node tools/audit-unpromoted-urban-pota.mjs --check
```

結果は `data/pota-urban-promotion-backlog.json` に保存されます。`--check` は、保存済みの一覧が候補と昇格設定から作り直した内容と同じかを確認します。

## 保留理由

- `missing-source-name`: GISに公園名がなく、所在地だけでは断定できません。
- `generic-source-name`: 「公園」「広域公園」など種別だけの名称です。
- `planning-number-review`: 都市計画番号と現在名の対応確認が必要です。
- `specific-name-review`: 固有名はありますが、公式ページとの照合がまだです。

この一覧は調査用です。アプリのGPS判定には読み込まれません。
