/********  Config & DOM  ********/
const RPC_URL="https://testnet-rpc.monad.xyz";
const CHAIN_HEX="0x279F";                       // 10143
const MARKET  ="0x116a9f35a402a2d34457bd72026c7f722d9d6333";
const RELAY   ="0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5";
const NFT     ="0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3";
const SIZE    ="1";            // MON
const $=id=>document.getElementById(id);
const rpcProv=new ethers.providers.JsonRpcProvider(RPC_URL);

/********  状態  ********/
let walletProv, signer, relay;

/********  初期表示  ********/
(async()=>{
  const nft=new ethers.Contract(NFT,["function totalSupply() view returns(uint256)"],rpcProv);
  $("mintedSoFar").textContent=(await nft.totalSupply()).toString();
})();

/********  ウォレット接続  ********/
$("connectWalletBtn").onclick=async()=>{
  if(!window.ethereum) { alert("Install MetaMask"); return; }

  /* 1) 既存 → switch, 無ければ add (MetaMask 推奨フロー) :contentReference[oaicite:2]{index=2} */
  try{ await ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:CHAIN_HEX}]}); }
  catch(e){ if(e.code===4902){
      await ethereum.request({method:"wallet_addEthereumChain",params:[{
        chainId:CHAIN_HEX, chainName:"Monad Testnet", rpcUrls:[RPC_URL],
        nativeCurrency:{name:"Monad",symbol:"MON",decimals:18}, // decimals は数値必須 :contentReference[oaicite:3]{index=3}
        blockExplorerUrls:["https://testnet.monadexplorer.com"]
      }]});} else{ console.error(e); return; }}

  const [account]=await ethereum.request({method:"eth_requestAccounts"});
  $("walletStatus").textContent=`Connected: ${account.slice(0,6)}…${account.slice(-4)}`;
  walletProv=new ethers.providers.Web3Provider(window.ethereum,"any");
  signer=walletProv.getSigner();
  relay=new ethers.Contract(RELAY,[
      "function forwardAndMint(address,bytes,address) payable returns(uint256)",
      "event ForwardAndMint(address,address,uint256,uint256)"],signer);
  $("mintBtn").disabled=false;
};

/********  マーケット TX を安全にキャプチャ  ********/
async function buildMarketTx(){
  const params=await KuruSdk.ParamFetcher.getMarketParams(rpcProv,MARKET);
  console.table(params);
  let captured, calls=[];
  const orig=signer.sendTransaction.bind(signer);

  signer.sendTransaction=async(tx)=>{
    calls.push(tx);                             // すべて保存
    return {hash:"0x0",wait:async()=>({status:1})};
  };

  try{
    await KuruSdk.IOC.placeMarket(
      signer,MARKET,params,
      {size:SIZE,minAmountOut:"0",isBuy:true,fillOrKill:true,approveTokens:true,isMargin:false}
    );
  }finally{
    signer.sendTransaction=orig;               // 必ず戻す
  }

  /* approve と swap の 2Tx が入る場合アドレスで判別 */
  captured=calls.reverse().find(tx=>tx.to.toLowerCase()===MARKET.toLowerCase());
  if(!captured) throw new Error("placeMarket did not return a swap TX; captured="+JSON.stringify(calls));

  console.log("captured TX:",captured);
  return captured;
}

/********  Mint + Swap  ********/
$("mintBtn").onclick=async()=>{
  try{
    $("mintBtn").disabled=true;$("mintBtn").textContent="Sending…";
    const u=await buildMarketTx();                 // {to,data,value}
    if(!u.data) throw new Error("captured.data is undefined");

    const tx=await relay.forwardAndMint(u.to,u.data,await signer.getAddress(),{value:u.value||0});
    console.log("relay tx:",tx.hash);
    $("mintBtn").textContent="Pending…";
    const rc=await tx.wait();
    const id=ethers.BigNumber.from(rc.logs.slice(-1)[0].topics[3]).toString();
    alert("✅ Minted! tokenId="+id);
    $("mintedSoFar").textContent=String(+$("mintedSoFar").textContent+1);
  }catch(e){
    console.error("Relay Error:",e); alert(e.data?.message||e.message);
  }finally{
    $("mintBtn").disabled=false;$("mintBtn").textContent="Mint & Buy";
  }
};
