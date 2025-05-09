/* --------------- 設定 --------------- */
const RPC_URL   = "https://testnet-rpc.monad.xyz";
const CHAIN_HEX = "0x279F";           // Monad Testnet
const CHAIN_ID  = 10143;
const MARKET    = "0xa4c519b1d2b28ae33a9d3d345c676725e642c99d";
const RELAY     = "0x1f12d8349c9101b304949d8b285b49aDe76e38E7";
const NFT       = "0x66fb1b5733A1A719e57022247A1CD9F4Ed73B1FB";
const SIZE_MON  = "10";

const $ = id => document.getElementById(id);
const rpcProv = new ethers.providers.JsonRpcProvider(RPC_URL);

let signer, relay, KuruSdk;

/* --------------- SDK v0.0.45 ロード --------------- */
(async () => {
  KuruSdk = await import("https://esm.sh/@kuru-labs/kuru-sdk@0.0.45?bundle");
  /* Connect ボタンは最初から押せるので disabled は触らない */

  const nft = new ethers.Contract(NFT, ["function totalSupply() view returns(uint256)"], rpcProv);
  $("mintedSoFar").textContent = (await nft.totalSupply()).toString();
})().catch(console.error);

/* --------------- Web3Modal 設定 --------------- */
const providerOptions = {
  injected:{
    package:null,
    display:{name:"MetaMask",description:"Browser Wallet"}
  },
  walletconnect:{
    package:window.WalletConnectProvider.default,
    options:{
      rpc:{[CHAIN_ID]:RPC_URL},
      qrcodeModalOptions:{mobileLinks:["metamask","trust","rainbow","argent","imtoken"]}
    }
  }
};
const web3Modal = new window.Web3Modal.default({
  cacheProvider:false,
  providerOptions
});

/* --------------- 接続 --------------- */
$("connectWalletBtn").onclick = async () => {
  try{
    const extProvider = await web3Modal.connect();
    extProvider.on("disconnect", disconnect);

    signer = (new ethers.providers.Web3Provider(extProvider,"any")).getSigner();
    relay  = new ethers.Contract(
              RELAY,
              ["function forwardAndMint(address,bytes,address) payable returns(uint256)",
               "event ForwardAndMint(address indexed,address indexed,uint256,uint256)"],
              signer);

    const account = await signer.getAddress();
    $("walletStatus").textContent = `Connected: ${account.slice(0,6)}…${account.slice(-4)}`;
    $("disconnectBtn").style.display="inline-block";
    $("mintBtn").disabled=false;
  }catch(e){console.error(e);}
};

/* --------------- 切断 --------------- */
function disconnect(){
  web3Modal.clearCachedProvider();
  signer = relay = null;

  $("walletStatus").textContent = "Wallet not connected";
  $("disconnectBtn").style.display="none";
  $("mintBtn").disabled=true;
}
$("disconnectBtn").onclick = disconnect;

/* --------- 以下：スワップ & ミント部は完全に以前のまま --------- */
async function buildMarketTx(){
  const params = await KuruSdk.ParamFetcher.getMarketParams(rpcProv, MARKET);
  let captured;
  const orig = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async tx => { captured = tx; return {hash:"0x0",wait:async()=>({status:1})}; };

  try{
    await KuruSdk.IOC.placeMarket(
      signer, MARKET, params,
      { size:SIZE_MON, minAmountOut:"0", isBuy:true,
        fillOrKill:true, approveTokens:true, isMargin:false }
    );
  }finally{ signer.sendTransaction = orig; }

  if(!captured?.data) throw new Error("swap TX not captured");
  return { to: captured.to, data: captured.data, value: captured.value || ethers.BigNumber.from(0) };
}

$("mintBtn").onclick = async () => {
  $("mintBtn").disabled=true; $("mintBtn").textContent="Sending…";
  try{
    const u = await buildMarketTx();
    const tx = await relay.forwardAndMint(u.to,u.data,await signer.getAddress(),{value:u.value});
    $("mintBtn").textContent="Pending…";
    const rc = await tx.wait();

    const iface=new ethers.utils.Interface(["event ForwardAndMint(address,address,uint256,uint256)"]);
    const log = rc.logs.find(l=>l.address.toLowerCase()===RELAY.toLowerCase());
    const {tokenId}=iface.parseLog(log).args;

    const url=`https://testnet.monadexplorer.com/tx/${tx.hash}`;
    alert(`✅ Minted! tokenId=${tokenId.toString()}\nTx ➜ ${url}`);
    $("mintedSoFar").textContent=(+$("mintedSoFar").textContent+1).toString();
  }catch(e){console.error(e);alert(e.message||"Error");}
  finally{ $("mintBtn").disabled=false; $("mintBtn").textContent="Mint Now"; }
};
