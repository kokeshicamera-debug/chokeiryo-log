/* 紹介ページ専用のアクセス計測。アプリ本体（index.html）では読み込まない。 */
(() => {
  const MEASUREMENT_ID = "G-VV5BJBMRE3";
  if (!/^G-[A-Z0-9]+$/.test(MEASUREMENT_ID)) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID);
})();
