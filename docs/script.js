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

/* ---------- Build Swap TX (send しない) ---------- */
async function buildMarketTx(size = "1") {
  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const dummy    = ethers.Wallet.createRandom().connect(provider);   // acts as signer

  const params = await ParamFetcher.getMarketParams(provider, MARKET);

  // ✓ 1st arg = signer (dummy), 2nd = MARKET
  const tx = await IOC.constructMarketBuyTransaction(
    dummy,
    MARKET,
    params,
    {
      size,
      minAmountOut: "0",
      approveTokens: true,
      isMargin: false
    }
  );

  return tx;           // { to, data, value }
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

/* ---------- Wallet Connect ---------- */
connectBtn.onclick = async () => {
  if (!window.ethereum) return alert("Install MetaMask");

  /* チェーン追加・切替 */
  const chain = await ethereum.request({ method: "eth_chainId" });
  if (parseInt(chain, 16) !== CHAIN_ID) {
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

/* ---------- Mint + Swap (1 クリック) ---------- */
mintBtn.onclick = async () => {
  try {
    mintBtn.disabled = true;
    mintBtn.textContent = "Minting…";

    const unsigned = await buildMarketTx("1");   // { to, data, value }

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

    alert("✅ Minted & Swapped!");
    await updateMinted();
  } catch (e) {
    console.error(e);
    alert(e.message);
  } finally {
    mintBtn.disabled = false;
    mintBtn.textContent = "Mint & Buy";
  }
};
