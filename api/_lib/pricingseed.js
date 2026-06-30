// Startdata Prijsmonitor (gebruikt als er nog niets in Redis staat).
// mine-prijzen worden bij 'Vergelijking uitvoeren' ververst uit Metorik (op SKU).
const IMG = "https://ongediertewinkel.nl/content/uploads/";
const SEED = {
  updated: "30 jun 2026",
  products: [
    { sku: "1260", title: "Muizen lijmplanken Trapper RTM (10 st)", mine: 9.95, units: 11958, margin: 76.0, stock: 18124, img: IMG + "2024/12/1260-Muizen-lijmplanken-Trapper-RTM.jpg", url: "https://ongediertewinkel.nl/products/muizen-bestrijden/muizen-lijmplanken/muizen-lijmplanken-trapper-rtm-10-stuks/", comp: [
      { shop: "Ongedierteproducten", title: "Bell Trapper Max pinda 10 st", price: 8.50, url: "https://ongedierteproducten.nl/trapper-max-10st/" },
      { shop: "Bestrijdingsland", title: "Trapper LTD 10 st", price: 9.50, url: "https://www.bestrijdingsland.nl/product/trapper-ltd-muizen-lijmplanken-10-stuks/" },
      { shop: "Budgetongediertebestrijden", title: "PestiNext Pro 200 10 st", price: 14.95, url: "https://budgetongediertebestrijden.nl/product/lijmplank-lijmval-pestinext-pro-10/" }
    ] },
    { sku: "1333", title: "Purschuim tegen muizen en ratten 750 ml", mine: 27.95, units: 6878, margin: 88.1, stock: 1289, img: IMG + "2025/07/1333-2-Purschuim-tegen-muizen-en-ratten.jpg", url: "https://ongediertewinkel.nl/products/muizen-bestrijden/muizenwering/purschuim-tegen-muizen-en-ratten/", comp: [
      { shop: "Allestegenongedierte", title: "Hagopur IPF schuim", price: 29.95, url: "https://www.allestegenongedierte.nl/ipf-schuim-or-purschuim-tegen-ratten-en-muizen.html" }
    ] },
    { sku: "1223", title: "Muizen lijmplanken Trapper RTM Zwart (10 st)", mine: 9.95, units: 6106, margin: 75.7, stock: 5978, img: IMG + "2024/12/1223-2-Muizen-lijmplanken-Trapper-Zwart-RTM.jpg", url: "", comp: [
      { shop: "Bestrijdingsland", title: "Trapper LTD 10 st (soortgelijk)", price: 9.50, url: "https://www.bestrijdingsland.nl/product/trapper-ltd-muizen-lijmplanken-10-stuks/" },
      { shop: "Budgetongediertebestrijden", title: "PestiNext Pro 200 10 st", price: 14.95, url: "https://budgetongediertebestrijden.nl/product/lijmplank-lijmval-pestinext-pro-10/" }
    ] },
    { sku: "1330", title: "Ronada Muizen en Ratten Barrière Spray 500 ml", mine: 17.95, units: 4208, margin: 86.3, stock: 233, img: IMG + "2025/05/1330-4-Spray-tegen-ratten-en-muizen.jpg", url: "", comp: [] },
    { sku: "3760", title: "Elektromagnetische muizen en rattenverjager", mine: 39.95, units: 2828, margin: 74.4, stock: 509, img: IMG + "2024/03/3760-Elektromagnetische-muizen-en-rattenverjager.jpg", url: "", comp: [] },
    { sku: "1268", title: "Staalwol tegen muizen en ratten", mine: 14.95, units: 2335, margin: 82.0, stock: 299, img: IMG + "2024/12/1268-6-Staalwol-tegen-muizen-en-ratten.jpg", url: "", comp: [] },
    { sku: "1218", title: "Ronada ratten en muizen lokstof", mine: 17.95, units: 2307, margin: 72.7, stock: 874, img: IMG + "2024/11/1218-2-Ronada-rattten-en-muizenlokstof.jpg", url: "", comp: [] },
    { sku: "1211", title: "Muizen lijmplanken Trapper RTM Max (10 st)", mine: 9.95, units: 2298, margin: 71.3, stock: 4328, img: IMG + "2025/05/1211-Trapper-RTM-Max-muizen-lijmplanken.jpg", url: "", comp: [] },
    { sku: "R01260", title: "Muizen lijmplanken Trapper RTM (45 st)", mine: 34.95, units: 1944, margin: 68.8, stock: 495, img: IMG + "2025/05/R01260-3-Muizen-lijmplanken-Trapper-RTM.jpg", url: "", comp: [] },
    { sku: "1212", title: "Muizen en ratten lijmplank Trapper Rat", mine: 39.95, units: 1849, margin: 78.9, stock: 2533, img: IMG + "2025/11/1212-Muizen-en-ratten-lijmplank-Trapper-Rat.jpg", url: "", comp: [] },
    { sku: "1016", title: "Ronada Bedwants Barrière Spray", mine: 19.95, units: 1769, margin: 88.2, stock: 543, img: IMG + "2025/08/1016-Ronada-Spray-tegen-Bedwants.jpg", url: "", comp: [] },
    { sku: "1311", title: "Ronada muizen lijmplank zwart (10 st)", mine: 24.95, units: 1741, margin: 85.1, stock: 1654, img: IMG + "2026/04/1311-Ronada-muizen-lijmplank-zwart.jpg", url: "", comp: [] },
    { sku: "1334", title: "Muizen en ratten weringsgaas (1 meter)", mine: 14.95, units: 1705, margin: 87.6, stock: 267, img: IMG + "2025/02/1334-2-Muizen-en-ratten-weringsgaas.jpg", url: "", comp: [] },
    { sku: "1310", title: "Ronada ratten en muizen lijmplank zwart (10 st)", mine: 34.95, units: 1476, margin: 83.2, stock: 2285, img: IMG + "2026/04/1310-Ronada-ratten-en-muizen-lijmplank-zwart.jpg", url: "", comp: [] },
    { sku: "1328", title: "Muizen lijmplanken Trapper RTM pinda (10 st)", mine: 14.95, units: 1368, margin: 84.0, stock: 2920, img: IMG + "2024/12/1328-3-Muizen-lijmplanken-Trapper-RTM-pinda.jpg", url: "", comp: [] }
  ]
};
module.exports = { SEED };
