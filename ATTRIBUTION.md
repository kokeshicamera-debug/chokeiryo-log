# データ出典

## 全国POTA区域の整備方針

- 環境省 EADAS の全国自然公園区域など、公的に公開された区域データを取り込む。
- POTAの全国一覧とは公園名を機械的に照合し、一意に一致した区域だけを「公的GISとの自動照合」としてアプリへ同梱する。
- 同名・名称変更・複数候補などの曖昧なものは、正確と表示せず「要確認」として照合報告に残す。
- 都市公園など自然公園区域に含まれないPOTA対象は、別の公的区域データを追加して同じ方式で照合する。

- 全国行政区域判定: 国土交通省「国土数値情報（行政区域）」を加工して作成（CC BY 4.0）。
- 町字推定: Geolonia 住所データを加工して作成（CC BY 4.0）。 https://github.com/geolonia/japanese-addresses
- JCC/JCG番号: JARL「市郡区番号リスト」を参照して作成。公開版ではJARLの最新情報・利用条件を確認して更新すること。

このアプリは、町字については境界ではなく代表点に基づく最寄り推定を表示する。

## OpenStreetMap 由来のPOTA候補区域

- 全国POTA候補の一部は、OpenStreetMap contributors の公園・保護区域データを、POTAの代表地点と重なる区域だけに加工して作成する。
- 出典表示: © OpenStreetMap contributors
- ライセンス: Open Data Commons Open Database License (ODbL) v1.0
- このリポジトリ内の `data/pota-boundaries-osm-candidates/` および対応する索引・生成ツールは、上記のODbLに従って公開する。アプリ本体のHTML・操作画面・手書き機能そのものをODbL化するものではない。
- OSM由来の区域はPOTA公式区域そのものではないため、アプリでは必ず「OSM候補・要公式確認」と表示する。
