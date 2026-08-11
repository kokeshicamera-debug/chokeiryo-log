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

GPS標高だけでは誤差と地形の分断を判定できないため、確定判定には使いません。次段階で国土地理院の標高タイル等を接続し、等高線内の連続性を計算します。現行アプリの500m案内は、この土台が完成するまで変更しません。
