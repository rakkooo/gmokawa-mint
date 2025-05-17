/**
 * Display uncaught errors on screen.
 * Usage: include this file at the end of index.html.
 */
(function(){
  // Error -> preserve stack etc. when stringified
  function dump(err){
    if(!(err instanceof Error)) return JSON.stringify(err,null,2);
    const obj={};
    Object.getOwnPropertyNames(err).forEach(k=>obj[k]=err[k]);
    return JSON.stringify(obj,null,2);
  }

  window.showFatal=(err,ctx='')=>{
    const msg=`[${new Date().toISOString()}] ${ctx}\n${dump(err)}`;
    console.error(msg);
    let box=document.getElementById('errorBox');
    if(!box){
      box=document.createElement('pre');
      box.id='errorBox';
      box.style.cssText='white-space:pre-wrap;margin:1rem;padding:1rem;border:2px solid red;color:red;max-height:250px;overflow:auto';
      document.body.prepend(box);
    }
    box.textContent=msg;
    alert('Warning: unexpected error occurred. See console for details.');
  };

  // Catch all unhandled errors
  window.addEventListener('error',              e=>showFatal(e.error||e,'window.error'));
  window.addEventListener('unhandledrejection', e=>showFatal(e.reason,'unhandledRejection'));
})();
