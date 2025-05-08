/**************  Config  **************/
const RPC_URL      = "https://testnet-rpc.monad.xyz";
const MARKET       = "0x116a9f35a402a2d34457bd72026c7f722d9d6333";
const SIZE_MON     = "1";
const RELAY_MINT   = "0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5";
const NFT_ADDRESS  = "0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3";
const REQUIRED_CHAIN_HEX = "0x279F";          // 10143 (Monad Testnet)

/**************  DOM refs  **************/
const $ = (id)=>document.getElementById(id);
const btnConnect = $("connectWalletBtn");
const btnMint    = $("mintBtn");
const lblStatus  = $("walletStatus");
const lblMinted  = $("mintedSoFar");

/**************  State  **************/
let provider, signer, relay, nft;

/**************  Helpers  **************/
const toast = (m)=>alert(m);

/**************  Read-only Supply  **************/
const nftAbi = [
  "function totalSupply() view returns (uint256)"
];
async function updateSupply() {
  try {
    const p = new ethers.providers.JsonRpcProvider(RPC_URL);
    const n = new ethers.Contract(NFT_ADDRESS, nftAbi, p);
    lblMinted.textContent = (await n.totalSupply()).toString();
  } catch(e){console.error(e);}
}
updateSupply();   // on load

/**************  Wallet Connect  **************/
btnConnect.onclick = async ()=>{
  if(!window.ethereum){ return toast("Install MetaMask"); }
  /* 1. チェーンを確認／追加 :contentReference[oaicite:3]{index=3} */
  const cid = await ethereum.request({ method:"eth_chainId" });
  if(cid!==REQUIRED_CHAIN_HEX){
    await ethereum.request({
      method:"wallet_addEthereumChain",
      params:[{
        chainId:REQUIRED_CHAIN_HEX,
        chainName:"Monad Testnet",
        rpcUrls:[RPC_URL],
        nativeCurrency:{name:"Monad",symbol:"MON",decimals:18},
        blockExplorerUrls:["https://testnet.monadexplorer.com"]
      }]
    });
  }
  /* 2. アカウント */
  const [account] = await ethereum.request({ method:"eth_requestAccounts" });
  lblStatus.textContent = `Connected: ${account.slice(0,6)}…${account.slice(-4)}`;

  /* 3. Provider & Contracts */
  provider = new ethers.providers.Web3Provider(window.ethereum,"any");  // v5 Web3Provider :contentReference[oaicite:4]{index=4}
  signer   = provider.getSigner();
  relay    = new ethers.Contract(RELAY_MINT,
    ["function forwardAndMint(address,bytes,address) payable returns (uint256)",
     "event ForwardAndMint(address,address,uint256,uint256)"],
    signer);
  nft      = new ethers.Contract(NFT_ADDRESS,nftAbi,provider);

  btnMint.disabled=false;
};

/**************  Build unsigned Market TX (browser版)  **************/
async function buildMarketTx() {
  const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, MARKET);
  let captured;
  const origSend = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async (tx)=>{
    captured = tx;               // {to,data,value,…}
    return { hash:"0x0", wait:async()=>({status:1}) };
  };
  await KuruSdk.IOC.placeMarket(
    signer, MARKET, marketParams,
    { size: SIZE_MON, minAmountOut:"0",
      isBuy:true, fillOrKill:true, approveTokens:true, isMargin:false }
  );
  signer.sendTransaction = origSend;
  return {
    to:    captured.to,
    data:  captured.data,
    value: captured.value || ethers.BigNumber.from(0)
  };
}

/**************  Mint + Swap  **************/
btnMint.onclick = async ()=>{
  try{
    btnMint.disabled=true; btnMint.textContent="Sending…";
    const unsigned = await buildMarketTx();

    const tx = await relay.forwardAndMint(
      unsigned.to,
      unsigned.data,
      await signer.getAddress(),
      { value: unsigned.value }
    );
    btnMint.textContent="Pending…";
    const receipt = await tx.wait();
    const evt = receipt.logs[receipt.logs.length-1];
    toast("✅ Minted! tokenId = "+ethers.BigNumber.from(evt.topics[3]).toString());
    updateSupply();
  }catch(err){
    console.error(err); toast(err.message||"Tx failed");
  }finally{
    btnMint.disabled=false; btnMint.textContent="Mint & Buy";
  }
};
