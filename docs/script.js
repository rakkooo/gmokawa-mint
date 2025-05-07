/* ---------- 設定 ---------- */
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

/* ---------- Swap TX を作成（送信しない）---------- */
async function buildMarketTx(size = "1") {
  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const dummy    = ethers.Wallet.createRandom().connect(provider);
  const params   = await ParamFetcher.getMarketParams(provider, MARKET);

  let captured;                                     // フックで捕獲
  const orig = dummy.sendTransaction.bind(dummy);
  dummy.sendTransaction = async (tx) => {
    captured = tx;
    return { hash: "0x0", wait: async () => ({}) };
  };

  await IOC.placeMarket(
    dummy,
    MARKET,
    params,
    {
      size,
      minAmountOut: "0",
      isBuy: true,
      fillOrKill: false,        // TX を必ず生成させる
      approveTokens: true,
      isMargin: false
    }
  );

  dummy.sendTransaction = orig;

  /* フォールバック（captured が undefined ならエラーを投げる） */
  if (!captured?.to || !captured?.data) {
    throw new Error("Swap トランザクションの生成に失敗しました");
  }

  return {
    to:    captured.to,
    data:  captured.data,
    value: ethers.BigNumber.from(String(captured.value ?? 0)) // BigNumber へ変換
  };
}

/* ---------- Minted カウンタ ---------- */
async function updateMinted() {
  try {
    const prov = new ethers.providers.JsonRpcProvider(RPC);
    const nft  = new ethers.Contract(
      NFT,
      ["function totalSupply() view returns(uint256)"],
      prov
    );
    mintedTxt.textContent = `${Number(await nft.totalSupply())} / ${MAX_SUP}`;
  } catch (e) {
    console.error(e);
  }
}
updateMinted();

/* ---------- ウォレット接続 ---------- */
connectBtn.onclick = async () => {
  if (!window.ethereum) return alert("MetaMask をインストールしてください");

  const now = await ethereum.request({ method: "eth_chainId" });
  if (parseInt(now, 16) !== CHAIN_ID) {
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CHAIN_HEX,
        chainName: "Monad Testnet",
        rpcUrls: [RPC],
        nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }
      }]
    });
  }

  const [acct] = await ethereum.request({ method: "eth_requestAccounts" });
  statusTxt.textContent = `Connected: ${acct.slice(0, 6)}…${acct.slice(-4)}`;

  window.provider = new ethers.providers.Web3Provider(window.ethereum);
  window.signer   = provider.getSigner();
  mintBtn.disabled = false;
};

/* ---------- Mint ＋ Swap ---------- */
mintBtn.onclick = async () => {
  try {
    mintBtn.disabled = true;
    mintBtn.textContent = "Minting…";

    /* Swap TX を取得 */
    const swapTx = await buildMarketTx("1");

    /* リレー契約経由で Swap＋Mint を一括実行 */
    const relay = new ethers.Contract(
      RELAY,
      ["function forwardAndMint(address,bytes,address) payable returns(uint256)"],
      window.signer
    );

    const tx = await relay.forwardAndMint(
      swapTx.to,
      swapTx.data,
      await signer.getAddress(),
      { value: swapTx.value }            // BigNumber 型
    );
    const receipt = await tx.wait();

    /* TokenID の取得例（イベント最後の topic） */
    const tokenIdHex = receipt.logs.at(-1)?.topics[3];
    console.log("tokenId:", tokenIdHex ? ethers.BigNumber.from(tokenIdHex).toString() : "N/A");

    alert("✅ Mint & Swap 完了!");
    await updateMinted();
  } catch (e) {
    console.error(e);
    alert(e.message);
  } finally {
    mintBtn.disabled = false;
    mintBtn.textContent = "Mint & Buy";
  }
};
