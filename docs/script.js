/* ---------- Config ---------- */
const RPC       = "https://testnet-rpc.monad.xyz";
const RELAY     = "0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5";
const MARKET    = "0x116a9f35a402a2d34457bd72026c7f722d9d6333";
const NFT       = "0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3";
const MAX_SUP   = 5000;
const CHAIN_ID  = 10143;
const CHAIN_HEX = "0x279F";

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const connectBtn = $("connectWalletBtn");
const statusTxt  = $("walletStatus");
const mintBtn    = $("mintBtn");
const mintedTxt  = $("mintedSoFar");

/* ---------- Kuru SDK ---------- */
const { ParamFetcher, IOC } = window.KuruSdk;

/* ---------- 設定は省略（同じ） ---------- */

/* ---------- Swap TX ─ unsigned ---------- */
async function buildMarketTx(size = "1") {
  console.log("★ buildMarketTx – start");

  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const dummy    = ethers.Wallet.createRandom().connect(provider);
  const params   = await ParamFetcher.getMarketParams(provider, MARKET);

  /* ★ size を opts に含めて 4 番目だけ渡す */
  const tx = await IOC.constructMarketBuyTransaction(
    dummy,
    MARKET,
    params,
    {
      size,                   // ← ここに含める
      minAmountOut: "0",
      approveTokens: true,
      isMargin: false
    }
  );

  console.log("★ unsigned Swap TX:", tx);
  if (!tx?.data || tx.data === "0x") throw new Error("swap calldata が空です");
  return tx;                                   // { to, data, value(BigNumber) }
}

/* ---------- Mint & Swap (Relay) ---------- */
mintBtn.onclick = async () => {
  try {
    mintBtn.disabled = true;
    mintBtn.textContent = "Minting…";

    const swapTx = await buildMarketTx("1");    // data が 0x7c51d6cf… となる

    const relay = new ethers.Contract(
      RELAY,
      ["function forwardAndMint(address,bytes,address) payable returns(uint256)"],
      window.signer
    );
    console.log("★ forwardAndMint args:", swapTx);

    const tx = await relay.forwardAndMint(
      swapTx.to,
      swapTx.data,
      await signer.getAddress(),
      { value: swapTx.value }                  // BigNumber そのまま
    );
    console.log("txHash:", tx.hash);
    const receipt = await tx.wait();
    console.log("receipt:", receipt);

    alert("✅ Mint & Swap 完了!");
    await updateMinted();
  } catch (e) {
    console.error("❌ エラー:", e);
    alert(e.message);
  } finally {
    mintBtn.disabled = false;
    mintBtn.textContent = "Mint & Buy";
  }
};
