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

/* ---------- Swap TX 生成（送信しない）---------- */
async function buildMarketTx(size = "1") {
  console.log("★ buildMarketTx – start");

  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const dummy    = ethers.Wallet.createRandom().connect(provider);      // 署名専用ダミー
  const params   = await ParamFetcher.getMarketParams(provider, MARKET);
  console.log("marketParams:", params);

  const tx = await IOC.constructMarketBuyTransaction(
    dummy,                         // 1. signer
    MARKET,                        // 2. market
    params,                        // 3. marketParams
    {                              // 4. options
      size,
      minAmountOut: "0",
      approveTokens: true,
      isMargin: false
    }
  );

  console.log("★ unsigned Swap TX:", tx);
  if (!tx?.to || !tx?.data || tx.data === "0x")
    throw new Error("Swap TX の data が取得できません");

  return tx;   // { to, data, value(BigNumber) }
}

/* ---------- Minted カウンタ ---------- */
async function updateMinted() {
  const prov = new ethers.providers.JsonRpcProvider(RPC);
  const nft  = new ethers.Contract(
    NFT,
    ["function totalSupply() view returns(uint256)"],
    prov
  );
  mintedTxt.textContent = `${Number(await nft.totalSupply())} / ${MAX_SUP}`;
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

    // 1) Swap トランザクション作成
    const swapTx = await buildMarketTx("1");

    // 2) リレー契約 forwardAndMint
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
      { value: swapTx.value }
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
