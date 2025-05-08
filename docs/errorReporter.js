/* errorReporter.js — 画面と console 両方に完全ログを出す */
(function () {
  function serialize(err) {
    if (!(err instanceof Error)) return JSON.stringify(err, null, 2);
    const obj = {};
    Object.getOwnPropertyNames(err).forEach(k => obj[k] = err[k]); // stack も含め列挙:contentReference[oaicite:4]{index=4}
    return JSON.stringify(obj, null, 2);
  }
  window.showFatal = (err, ctx = '') => {
    const msg = `[${new Date().toISOString()}] ${ctx}\n${serialize(err)}`;
    console.error(msg);
    let box = document.getElementById('errorBox');
    if (!box) {
      box = document.createElement('pre');
      box.id = 'errorBox';
      box.style.cssText = 'white-space:pre-wrap;margin:1rem;padding:1rem;border:2px solid red;color:red;max-height:220px;overflow:auto';
      document.body.prepend(box);
    }
    box.textContent = msg;
    alert('⚠️ エラー詳細を画面上部に表示しました');
  };
  /* グローバル捕捉 — try/catchを書き忘れても検知:contentReference[oaicite:5]{index=5}*/
  window.addEventListener('error',            e => showFatal(e.error || e, 'window.error'));
  window.addEventListener('unhandledrejection', e => showFatal(e.reason, 'unhandledRejection'));
})();
