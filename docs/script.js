import { utils, BigNumber } from "ethers";

/* ---------- 定数 ---------- */
const RPC        = "https://testnet-rpc.monad.xyz";
const RELAY_ADDR = "0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5";
const MARKET     = "0x116a9f35a402a2d34457bd72026c7f722d9d6333";
const NFT        = "0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3";
const MAX_SUPPLY = 5000;
const CHAIN_ID   = 10143;
const CHAIN_HEX  = "0x279F";

/* ---------- 便利ログ関数 ---------- */
const log = (tag, obj) =>
  console.log(`🪵${tag}`, JSON.parse(JSON.stringify(obj, (_, v) =>
    typeof v === "bigint" ? v.toString() : v)));

/* ---------- DOM 取得 ---------- */
const $ = id => document.getElementById(id);
const connectBtn = $("connectWalletBtn");
const statusTxt  = $("walletStatus");
const mintBtn    = $("mintBtn");
const mintedTxt  = $("mintedSoFar");

/* ---------- Kuru SDK 参照 ---------- */
const { ParamFetcher, IOC } = window.KuruSdk;

/* ---------- swap 用 unsigned TX 生成 ---------- */
async function buildMarketTx(size = "1") {
  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const signer   = ethers.Wallet.createRandom().connect(provider);
  const params   = await ParamFetcher.getMarketParams(provider, MARKET);

  let captured;
  signer.sendTransaction = async tx => { captured = tx; return { hash:"0x0", wait:async()=>({}) }; };

  try {
    await IOC.placeMarket(
      signer, MARKET, params,
      { size, minAmountOut:"0", isBuy:true, fillOrKill:true,
        approveTokens:true, isMargin:false }
    );
  } catch (e) {
    console.error("SDK placeMarket error:", e);
    throw e;
  }

  if (!captured) throw new Error("SDK がトランザクションを生成しませんでした");

  log("captured-tx", captured);

  return {
    to:    captured.to,
    data:  captured.data,
    value: BigNumber.from(captured.value || 0)  // BigNumber 型に統一
  };
}

/* ---------- Mint 済み枚数表示 ---------- */
async function updateMinted() {
  const prov = new ethers.providers.JsonRpcProvider(RPC);
  const nft  = new ethers.Contract(NFT, ["function totalSupply() view returns(uint256)"], prov);
  mintedTxt.textContent = `${(await nft.totalSupply()).toNumber()} / ${MAX_SUPPLY}`;
}
window.addEventListener("load", updateMinted);

/* ---------- ウォレット接続 ---------- */
connectBtn.onclick = async () => {
  if (!window.ethereum) return alert("MetaMask をインストールしてください");
  const now = parseInt(await ethereum.request({ method:"eth_chainId" }), 16);
  if (now !== CHAIN_ID) {
    await ethereum.request({
      method:"wallet_addEthereumChain",
      params:[{
        chainId: CHAIN_HEX,
        chainName:"Monad Testnet",
        rpcUrls:[RPC],
        nativeCurrency:{ name:"MON", symbol:"MON", decimals:18 }
      }]
    });
  }
  const [acct] = await ethereum.request({ method:"eth_requestAccounts" });
  statusTxt.textContent = `Connected: ${acct.slice(0,6)}…${acct.slice(-4)}`;
  window.provider = new ethers.providers.Web3Provider(window.ethereum);
  window.signer   = provider.getSigner();
  mintBtn.disabled = false;
};

/* ---------- Mint + Swap ---------- */
mintBtn.onclick = async () => {
  try {
    mintBtn.disabled = true;
    mintBtn.textContent = "Minting…";

    const unsigned = await buildMarketTx("1");
    if (!utils.isAddress(unsigned.to))  throw new Error("ターゲットアドレスが不正");
    if (!utils.isHexString(unsigned.data)) throw new Error("calldata が不正");

    log("forward-input", unsigned);

    const relay = new ethers.Contract(
      RELAY_ADDR,
      ["function forwardAndMint(address,bytes,address) payable returns(uint256)"],
      window.signer
    );

    const tx = await relay.forwardAndMint(
      unsigned.to,
      unsigned.data,
      await signer.getAddress(),
      { value: unsigned.value }
    );
    log("txHash", tx.hash);
    await tx.wait();

    alert("✅ Mint & Swap 完了!");
    updateMinted();
  } catch (err) {
    console.error(err);
    alert(err.message || "Mint 失敗");
  } finally {
    mintBtn.disabled = false;
    mintBtn.textContent = "Mint & Buy";
  }
};
