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

/* ---------- Swap 用 unsigned TX を生成（送信しない）---------- */
async function buildMarketTx(size = "1") {
  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const signer   = ethers.Wallet.createRandom().connect(provider);   // ダミー signer
  const params   = await ParamFetcher.getMarketParams(provider, MARKET);

  /* signer.sendTransaction をフックして TX を横取り */
  let captured;
  const orig = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async (tx) => {
    captured = tx;                              // { to, data, value, … }
    return { hash: "0x0", wait: async () => ({}) };
  };

  /* 成行 IOC を実行（sendTransaction はフックされている）*/
  await IOC.placeMarket(
    signer,
    MARKET,
    params,
    {
      size,
      minAmountOut: "0",
      isBuy: true,
      fillOrKill: true,
      approveTokens: true,
      isMargin: false
    }
  );

  signer.sendTransaction = orig;                // フック解除
  return {
    to:    captured?.to,
    data:  captured?.data,
    value: captured?.value ?? 0n
  };
}

/* ---------- 発行枚数カウンタ ---------- */
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

/* ---------- Mint ＋ Swap ボタン ---------- */
mintBtn.onclick = async () => {
  try {
    mintBtn.disabled = true;
    mintBtn.textContent = "Minting…";

    const unsigned = await buildMarketTx("1");
    if (!unsigned.to) throw new Error("Swap Tx の生成に失敗しました");

    const relay = new ethers.Contract(
      RELAY,
      ["function forwardAndMint(address,bytes,address) payable returns(uint256)"],
      window.signer
    );

    const tx = await relay.forwardAndMint(
      unsigned.to,
      unsigned.data,
      await signer.getAddress(),
      { value: unsigned.value }
    );
    await tx.wait();

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
