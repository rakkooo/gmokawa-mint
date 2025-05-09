/* ---------------- Config ---------------- */
const RPC_URL   = "https://testnet-rpc.monad.xyz";
const CHAIN_ID  = 10143;               // 0x279F in decimal
const CHAIN_HEX = "0x279F";
const MARKET    = "0xa4c519b1d2b28ae33a9d3d345c676725e642c99d";
const RELAY     = "0x1f12d8349c9101b304949d8b285b49aDe76e38E7";
const NFT       = "0x66fb1b5733A1A719e57022247A1CD9F4Ed73B1FB";
const SIZE_MON  = "10";

const $ = id => document.getElementById(id);

/* ---------------- providers ---------------- */
let web3Modal, extProvider, rpcProv, signer, relay, KuruSdk;

init();

/* ========== init sequence ========== */
async function init() {
  /* 1. RPC provider for readonly calls */
  rpcProv = new ethers.providers.JsonRpcProvider(RPC_URL);

  /* 2. dynamic import of SDK v0.0.45 */
  KuruSdk = await import("https://esm.sh/@kuru-labs/kuru-sdk@0.0.45?bundle");

  /* 3. Web3Modal setup (MetaMask + WalletConnect) */
  const providerOptions = {
    walletconnect: {
      package: window.WalletConnectProvider.default,                 // :contentReference[oaicite:3]{index=3}
      options: {
        rpc: { [CHAIN_ID]: RPC_URL }                                 // :contentReference[oaicite:4]{index=4}
      }
    }
  };
  web3Modal = new window.Web3Modal.default({
    cacheProvider: false,
    providerOptions,
    theme: "dark"
  });

  document.getElementById("connectBtn").disabled = false;

  const nft = new ethers.Contract(NFT, ["function totalSupply() view returns(uint256)"], rpcProv);
  $("#mintedSoFar").textContent = (await nft.totalSupply()).toString();
}

/* ========== connect / disconnect ========== */
document.getElementById("connectBtn").onclick = async () => {
  try {
    extProvider = await web3Modal.connect();                         // MetaMask or WalletConnect :contentReference[oaicite:5]{index=5}
    extProvider.on("disconnect", () => disconnect());

    signer  = (new ethers.providers.Web3Provider(extProvider, "any")).getSigner();
    relay   = new ethers.Contract(
      RELAY,
      ["function forwardAndMint(address,bytes,address) payable returns(uint256)",
       "event ForwardAndMint(address indexed,address indexed,uint256,uint256)"],
      signer
    );

    const account = await signer.getAddress();
    $("#walletStatus").textContent = `Connected: ${account.slice(0,6)}…${account.slice(-4)}`;
    $("#disconnectBtn").disabled = false;
    $("#mintBtn").disabled       = false;
  } catch (e) { console.error(e); }
};

document.getElementById("disconnectBtn").onclick = disconnect;

function disconnect() {
  if (web3Modal) web3Modal.clearCachedProvider();                    // 清掃 :contentReference[oaicite:6]{index=6}
  signer = relay = extProvider = null;
  $("#walletStatus").textContent = "Wallet not connected";
  $("#disconnectBtn").disabled   = true;
  $("#mintBtn").disabled         = true;
}

/* ---------------- build swap TX ---------------- */
async function buildMarketTx() {
  const params = await KuruSdk.ParamFetcher.getMarketParams(rpcProv, MARKET);
  let captured;
  const orig = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async tx => { captured = tx; return {hash:"0x0",wait:async()=>({status:1})}; };

  try {
    await KuruSdk.IOC.placeMarket(
      signer, MARKET, params,
      { size: ethers.utils.parseEther(SIZE_MON),                     // Wei 化
        minAmountOut:"0", isBuy:true, fillOrKill:true,
        approveTokens:true, isMargin:false }
    );
  } finally { signer.sendTransaction = orig; }

  if (!captured?.data) throw new Error("swap TX not captured");
  return { to: captured.to, data: captured.data, value: captured.value || ethers.constants.Zero };
}

/* ---------------- mint + swap ---------------- */
$("#mintBtn").onclick = async () => {
  $("#mintBtn").disabled = true; $("#mintBtn").textContent = "Sending…";
  try {
    const u  = await buildMarketTx();
    const tx = await relay.forwardAndMint(u.to, u.data, await signer.getAddress(), { value: u.value });

    $("#mintBtn").textContent = "Pending…";
    const rc = await tx.wait();

    /* 安全に tokenId / txLink 取得 */
    const iface = new ethers.utils.Interface([
      "event ForwardAndMint(address,address,uint256,uint256)"
    ]);
    const log = rc.logs.find(l => l.address.toLowerCase() === RELAY.toLowerCase());
    const { tokenId } = iface.parseLog(log).args;                    // :contentReference[oaicite:7]{index=7}

    const link = `https://testnet.monadexplorer.com/tx/${tx.hash}`;
    alert(`✅ Minted! tokenId = ${tokenId.toString()}\nExplorer ➜ ${link}`);

    $("#mintedSoFar").textContent = (+$("#mintedSoFar").textContent + 1).toString();
  } catch (e) { console.error(e); alert(e.message || "Error"); }
  finally   { $("#mintBtn").disabled=false; $("#mintBtn").textContent="Mint Now"; }
};
