/* global KuruSdk, ethers */
/********  Config  ********/
const RPC_URL   = "https://testnet-rpc.monad.xyz";
const CHAIN_HEX = "0x279F";                           // Monad Testnet :contentReference[oaicite:9]{index=9}
const MARKET    = "0x116a9f35a402a2d34457bd72026c7f722d9d6333";
const RELAY     = "0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5";
const NFT       = "0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3";
const SIZE_MON  = "1";

const $ = (id) => document.getElementById(id);
const rpcProv = new ethers.providers.JsonRpcProvider(RPC_URL);   // v5 API

/********  状態  ********/
let signer, relay;

/********  初期表示  ********/
(async () => {
  const nft = new ethers.Contract(NFT, ["function totalSupply() view returns(uint256)"], rpcProv);
  $("mintedSoFar").textContent = (await nft.totalSupply()).toString();
})();

/********  ウォレット接続  ********/
$("connectWalletBtn").onclick = async () => {
  if (!window.ethereum) { alert("Install MetaMask"); return; }

  try {                                                     // チェーン切替 EIP-3326 :contentReference[oaicite:10]{index=10}
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    if (e.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CHAIN_HEX,
          chainName: "Monad Testnet",
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
          blockExplorerUrls: ["https://testnet.monadexplorer.com"]
        }]
      });
    } else { console.error(e); return; }
  }

  const [account] = await ethereum.request({ method: "eth_requestAccounts" });
  $("walletStatus").textContent = `Connected: ${account.slice(0, 6)}…${account.slice(-4)}`;

  signer = (new ethers.providers.Web3Provider(window.ethereum, "any")).getSigner();
  relay  = new ethers.Contract(
            RELAY,
            ["function forwardAndMint(address,bytes,address) payable returns(uint256)",
             "event ForwardAndMint(address indexed,address indexed,uint256,uint256)"],
            signer);

  $("mintBtn").disabled = false;
};

/********  buildMarketTx  ********/
async function buildMarketTx() {
  const params = await KuruSdk.ParamFetcher.getMarketParams(rpcProv, MARKET);

  let captured;
  const orig = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async (tx) => {
    captured = tx;
    return { hash: "0x0", wait: async () => ({ status: 1 }) };
  };

  try {
    await KuruSdk.IOC.placeMarket(
      signer, MARKET, params,
      { size: SIZE_MON, minAmountOut: "0", isBuy: true,
        fillOrKill: true, approveTokens: true, isMargin: false }
    );
  } finally {
    signer.sendTransaction = orig;
  }
  if (!captured?.data) throw new Error("swap TX not captured");
  return { to: captured.to, data: captured.data, value: captured.value || ethers.BigNumber.from(0) };
}

/********  Mint + Swap  ********/
$("mintBtn").onclick = async () => {
  $("mintBtn").disabled = true; $("mintBtn").textContent = "Sending…";
  try {
    const u  = await buildMarketTx();
    const tx = await relay.forwardAndMint(u.to, u.data, await signer.getAddress(), { value: u.value });
    console.log("relay tx:", tx.hash);
    $("mintBtn").textContent = "Pending…";
    const rc = await tx.wait();
    const tokenId = ethers.BigNumber.from(rc.logs[rc.logs.length - 1].topics[3]).toString();
    alert("✅ Minted! tokenId = " + tokenId);
    $("mintedSoFar").textContent = (+$("mintedSoFar").textContent + 1).toString();
  } catch (e) {
    console.error(JSON.stringify(e, null, 2));
    alert(e.data?.message || e.message);
  } finally {
    $("mintBtn").disabled = false; $("mintBtn").textContent = "Mint & Buy";
  }
};
