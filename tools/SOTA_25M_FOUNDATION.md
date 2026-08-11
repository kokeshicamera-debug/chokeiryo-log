# SOTA公式サミット情報と25m判定の土台

SOTAの有効区域は山頂から水平25mではなく、通常は「山頂標高から25m下の閉じた等高線で囲まれ、山頂へ連続する区域」です。

## 保存データ

`data/sota-japan-official-summits.json` は、アプリに同梱したSOTA公式Summits Listの日本サミットを検査しやすい形へ書き出したものです。

```text
node tools/export-embedded-sota-catalog.mjs
node tools/export-embedded-sota-catalog.mjs --check
```

## 判定の段階

- `needs-terrain`: 地形標高がまだありません。
- `outside-elevation`: 山頂から25m下の基準標高に届きません。
- `needs-connectivity`: 標高条件は満たしますが、山頂へ連続する地形か未確認です。
- `outside-disconnected`: 高い場所でも、途中の鞍部で山頂区域と分断されています。
- `confirmed`: 標高条件と山頂への連続性を確認済みです。

GPS標高だけでは誤差と地形の分断を判定できないため、確定判定には使いません。現行アプリの500m案内は、この土台が完成するまで変更しません。

## 国土地理院の地形標高

`gsi-elevation-provider.js` は、国土地理院のPNG標高タイルを公式サンプルと同じ優先順（DEM1A、DEM5A、DEM5B、DEM5C、DEM10B）で参照します。取得したタイルはブラウザ内へ最大128枚保存し、次回以降や圏外時に再利用します。

標高値がない画素は次のデータへ切り替えます。すべて取得できない場合は判定を確定せず、`needs-terrain` のまま扱います。第3段階で周辺タイルを使い、山頂から25m下の区域が途中で分断されていないかを計算します。
