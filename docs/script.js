/* docs/script.js - browser version (ethers v5) */
const RPC_URL      = "https://testnet-rpc.monad.xyz";
const MARKET       = "0x116a9f35a402a2d34457bd72026c7f722d9d6333";
const SIZE_MON     = "1";
const RELAY_MINT   = "0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5";
const NFT_ADDRESS  = "0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3";

const relayAbi = [
  "function forwardAndMint(address,bytes,address) payable returns (uint256)",
  "event ForwardAndMint(address indexed user,address indexed target,uint256 value,uint256 tokenId)"
];
const nftAbi = ["function totalSupply() view returns (uint256)"];

const provider    = new ethers.providers.JsonRpcProvider(RPC_URL);
let signer, relay, nft;

const elems = {
  walletStatus: document.getElementById("walletStatus"),
  connectBtn:   document.getElementById("connectWalletBtn"),
  mintBtn:      document.getElementById("mintBtn"),
  mintedSoFar:  document.getElementById("mintedSoFar"),
};

/* ---------- ウォレット接続 ---------- */
elems.connectBtn.onclick = async () => {
  await window.ethereum.request({ method: "eth_requestAccounts" });
  provider.pollingInterval = 12_000;                // 少し遅延でも OK
  signer = provider.getSigner();
  relay  = new ethers.Contract(RELAY_MINT, relayAbi, signer);
  nft    = new ethers.Contract(NFT_ADDRESS, nftAbi, provider);

  elems.walletStatus.textContent = "Connected: " + await signer.getAddress();
  elems.mintBtn.disabled = false;
  updateSupply();
};

/* ---------- Supply 表示 ---------- */
async function updateSupply() {
  const total = await nft.totalSupply();            // ERC-721 標準 :contentReference[oaicite:7]{index=7}
  elems.mintedSoFar.textContent = total.toString();
}

/* ---------- Mint + Swap ---------- */
elems.mintBtn.onclick = async () => {
  try {
    elems.mintBtn.disabled = true;
    elems.mintBtn.textContent = "Sending...";

    // --- (1) buildMarketTx: Kuru SDK で unsigned TX 生成 ---
    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, MARKET);
    let captured;
    const origSend = signer.sendTransaction.bind(signer);
    signer.sendTransaction = async (tx) => { captured = tx; return { hash: "0x0", wait: async () => ({ status: 1 }) }; };

    await KuruSdk.IOC.placeMarket(
      signer, MARKET, marketParams,
      { size: SIZE_MON, minAmountOut: "0", isBuy: true, fillOrKill: true, approveTokens: true, isMargin: false }
    );
    signer.sendTransaction = origSend;

    // --- (2) forwardAndMint ---
    const tx = await relay.forwardAndMint(
      captured.to, captured.data, await signer.getAddress(),
      { value: captured.value || 0 }
    );
    console.log("tx:", tx.hash);
    elems.mintBtn.textContent = "Pending...";

    const receipt = await tx.wait();
    const tokenId = receipt.events?.find(e => e.event === "ForwardAndMint")?.args?.tokenId;
    alert("✅ Minted! Token ID: " + tokenId);
    updateSupply();
  } catch (err) {
    console.error(err);
    alert("❌ Error: " + (err?.message || err));
  } finally {
    elems.mintBtn.disabled = false;
    elems.mintBtn.textContent = "Mint & Buy";
  }
};
