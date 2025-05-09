/* ---------- Config ---------- */
const RPC_URL = "https://testnet-rpc.monad.xyz";
const CHAIN_ID = 10143;               // decimal
const MARKET  = "0xa4c519b1d2b28ae33a9d3d345c676725e642c99d";
const RELAY   = "0x1f12d8349c9101b304949d8b285b49aDe76e38E7";
const NFT     = "0x66fb1b5733A1A719e57022247A1CD9F4Ed73B1FB";
const SIZE_MON = "10";                // MON

/* ---------- Globals ---------- */
let web3Modal, extProvider, rpcProv, signer, relay, KuruSdk;

/* ---------- DOM helpers ---------- */
const $ = (id) => document.getElementById(id);

/* ---------- init ---------- */
(async () => {
  rpcProv = new ethers.providers.JsonRpcProvider(RPC_URL);
  KuruSdk = await import("https://esm.sh/@kuru-labs/kuru-sdk@0.0.45?bundle");

  /* providerOptions: injected + walletconnect (=MetaMask / QR) */
  const providerOptions = {
    injected: {                                 // ← MetaMask ボタンを確実に表示
      package: null,
      display: { name: "MetaMask", description: "Browser Wallet" }
    },
    walletconnect: {
      package: window.WalletConnectProvider.default,
      options: {
        rpc: { [CHAIN_ID]: RPC_URL },
        bridge: "https://bridge.walletconnect.org"
      }
    }
  }; /* 公式 config 例  */

  web3Modal = new window.Web3Modal.default({
    cacheProvider: false,
    providerOptions,
    disableInjectedProvider: false,
    theme: "dark"
  });

  /* Mint 発行済み表示 */
  const nft = new ethers.Contract(NFT, ["function totalSupply() view returns(uint256)"], rpcProv);
  $("mintedSoFar").textContent = (await nft.totalSupply()).toString();

  /* Connect ボタン解放 */
  $("connectBtn").disabled = false;
})();

/* ---------- wallet connect ---------- */
$("connectBtn").onclick = async () => {
  try {
    extProvider = await web3Modal.connect();
    extProvider.on("disconnect", disconnect);

    signer = (new ethers.providers.Web3Provider(extProvider, "any")).getSigner();
    relay  = new ethers.Contract(
      RELAY,
      ["function forwardAndMint(address,bytes,address) payable returns(uint256)",
       "event ForwardAndMint(address indexed,address indexed,uint256,uint256)"],
      signer);

    const acc = await signer.getAddress();
    $("walletStatus").textContent = `Connected: ${acc.slice(0,6)}…${acc.slice(-4)}`;

    $("disconnectBtn").style.display = "inline-block";
    $("mintBtn").disabled = false;
  } catch (e) { console.error(e); /* modalを閉じた時など */ }
};

/* ---------- disconnect ---------- */
function disconnect() {
  if (web3Modal) web3Modal.clearCachedProvider();                    // :contentReference[oaicite:2]{index=2}
  signer = relay = extProvider = null;

  $("walletStatus").textContent = "Wallet not connected";
  $("disconnectBtn").style.display = "none";
  $("mintBtn").disabled = true;
}
$("disconnectBtn").onclick = disconnect;

/* ---------- build Market TX ---------- */
async function buildMarketTx() {
  const params = await KuruSdk.ParamFetcher.getMarketParams(rpcProv, MARKET);

  let captured;
  const origSend = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async (tx) => { captured = tx; return {hash:"0x0",wait:async()=>({status:1})}; };

  try {
    await KuruSdk.IOC.placeMarket(
      signer, MARKET, params,
      { size: ethers.utils.parseEther(SIZE_MON),
        minAmountOut:"0", isBuy:true, fillOrKill:true,
        approveTokens:true, isMargin:false });
  } finally { signer.sendTransaction = origSend; }

  if (!captured?.data) throw new Error("swap TX not captured");
  return { to: captured.to, data: captured.data, value: captured.value || ethers.constants.Zero };
}

/* ---------- Mint + Swap ---------- */
$("mintBtn").onclick = async () => {
  $("mintBtn").disabled = true; $("mintBtn").textContent = "Sending…";
  try {
    const u  = await buildMarketTx();
    const tx = await relay.forwardAndMint(u.to, u.data, await signer.getAddress(), { value: u.value });

    $("mintBtn").textContent = "Pending…";
    const rc = await tx.wait();

    /* tokenId & Explorer link */
    const iface = new ethers.utils.Interface([
      "event ForwardAndMint(address,address,uint256,uint256)"
    ]);
    const log = rc.logs.find(l => l.address.toLowerCase() === RELAY.toLowerCase());
    const { tokenId } = iface.parseLog(log).args;

    const url = `https://testnet.monadexplorer.com/tx/${tx.hash}`;
    alert(`✅ Minted! tokenId=${tokenId.toString()}\nTx ➜ ${url}`);
    $("mintedSoFar").textContent = (+$("mintedSoFar").textContent + 1).toString();
  } catch (e) { console.error(e); alert(e.message || "Error"); }
  finally   { $("mintBtn").disabled=false; $("mintBtn").textContent="Mint Now"; }
};
