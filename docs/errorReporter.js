<!-- docs/errorReporter.js へ保存、index.html の最後で読み込む -->
<script>
(function () {
  /* Error → JSON.stringify で消える stack 等を残す:contentReference[oaicite:2]{index=2} */
  function dump(err) {
    if (!(err instanceof Error)) return JSON.stringify(err, null, 2);
    const obj = {};
    Object.getOwnPropertyNames(err).forEach(k => obj[k] = err[k]); /* turn7search10 */
    return JSON.stringify(obj, null, 2);
  }
  window.showFatal = (err, ctx = '') => {
    const msg = `[${new Date().toISOString()}] ${ctx}\n${dump(err)}`;
    console.error(msg);
    let box = document.getElementById('errorBox');
    if (!box) {
      box = document.createElement('pre');
      box.id = 'errorBox';
      box.style.cssText =
        'white-space:pre-wrap;margin:1rem;padding:1rem;border:2px solid red;color:red;max-height:250px;overflow:auto';
      document.body.prepend(box);
    }
    box.textContent = msg;
    alert('⚠️ エラー詳細を画面上部に表示しました');
  };
  /* すべての未捕捉エラーを拾う安全網:contentReference[oaicite:3]{index=3}:contentReference[oaicite:4]{index=4} */
  window.addEventListener('error',              e => showFatal(e.error || e, 'window.error'));
  window.addEventListener('unhandledrejection', e => showFatal(e.reason, 'unhandledRejection'));
})();
</script>
