/* --------------- 設定 --------------- */
const RPC_URL   = "https://testnet-rpc.monad.xyz";
const CHAIN_HEX = "0x279F"; // Monad Testnet
const MARKET    = "0xa4c519b1d2b28ae33a9d3d345c676725e642c99d";
const RELAY     = "0x1f12d8349c9101b304949d8b285b49aDe76e38E7";
const NFT       = "0x66fb1b5733A1A719e57022247A1CD9F4Ed73B1FB";
const SIZE_MON  = "10";

const $ = id => document.getElementById(id);
const rpcProv = new ethers.providers.JsonRpcProvider(RPC_URL);

let signer, relay, KuruSdk;

/* --------------- SDK v0.0.45 を動的ロード --------------- */
(async () => {
  KuruSdk = await import("https://esm.sh/@kuru-labs/kuru-sdk@0.0.45?bundle");
  $("connectWalletBtn").disabled = false;

  const nft = new ethers.Contract(
    NFT,
    ["function totalSupply() view returns(uint256)"],
    rpcProv
  );
  $("mintedSoFar").textContent = (await nft.totalSupply()).toString();
})().catch(console.error);

/* --------------- ウォレット接続 --------------- */
$("connectWalletBtn").onclick = async () => {
  if (!window.ethereum) { alert("Install MetaMask"); return; }

  try {
    await ethereum.request({ method:"wallet_switchEthereumChain", params:[{ chainId: CHAIN_HEX }] });
  } catch (e) {
    if (e.code === 4902) {
      await ethereum.request({
        method:"wallet_addEthereumChain",
        params:[{
          chainId: CHAIN_HEX,
          chainName:"Monad Testnet",
          rpcUrls:[RPC_URL],
          nativeCurrency:{ name:"Monad", symbol:"MON", decimals:18 },
          blockExplorerUrls:["https://testnet.monadexplorer.com"]
        }]
      });
    } else { console.error(e); return; }
  }

  const [account] = await ethereum.request({ method:"eth_requestAccounts" });
  $("walletStatus").textContent = `Connected: ${account.slice(0,6)}…${account.slice(-4)}`;

  signer = (new ethers.providers.Web3Provider(window.ethereum,"any")).getSigner();
  relay  = new ethers.Contract(
            RELAY,
            ["function forwardAndMint(address,bytes,address) payable returns(uint256)",
             "event ForwardAndMint(address indexed,address indexed,uint256,uint256)"],
            signer);

  $("mintBtn").disabled = false;
};

/* --------------- Market TX をキャプチャ --------------- */
async function buildMarketTx() {
  const params = await KuruSdk.ParamFetcher.getMarketParams(rpcProv, MARKET);

  let captured;
  const orig = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async tx => { captured = tx; return { hash:"0x0", wait:async()=>({status:1}) }; };

  try {
    await KuruSdk.IOC.placeMarket(
      signer, MARKET, params,
      { size:SIZE_MON, minAmountOut:"0", isBuy:true,
        fillOrKill:true, approveTokens:true, isMargin:false }
    );
  } finally { signer.sendTransaction = orig; }

  if (!captured?.data) throw new Error("swap TX not captured");
  return { to: captured.to, data: captured.data, value: captured.value || ethers.BigNumber.from(0) };
}

/* --------------- Mint + Buy --------------- */
$("mintBtn").onclick = async () => {
  $("mintBtn").disabled = true; $("mintBtn").textContent = "Sending…";
  try {
    const u  = await buildMarketTx();
    const tx = await relay.forwardAndMint(u.to, u.data, await signer.getAddress(), { value: u.value });
    $("mintBtn").textContent = "Pending…";
    const rc = await tx.wait();
    const tokenId = ethers.BigNumber.from(rc.logs.at(-1).topics[3]).toString();
    alert(`✅ Minted! tokenId = ${tokenId}`);
    $("mintedSoFar").textContent = (+$("mintedSoFar").textContent + 1).toString();
  } catch (e) {
    console.error(e); alert(e.message || "Error");
  } finally {
    $("mintBtn").disabled = false; $("mintBtn").textContent = "Mint Now";
  }
};
