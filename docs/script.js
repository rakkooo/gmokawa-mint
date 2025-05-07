/* ---------------- config ---------------- */
const RPC    = "https://testnet-rpc.monad.xyz";
const RELAY  = "0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5";
const MARKET = "0x116a9f35a402a2d34457bd72026c7f722d9d6333";
const NFT    = "0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3";
const MAX_SUP = 5000;
const CHAIN_ID = 10143;
const CHAIN_HEX = "0x279F";

/* --------------- helpers ---------------- */
const $ = (id)=>document.getElementById(id);
const connectBtn = $("connectWalletBtn");
const statusTxt  = $("walletStatus");
const mintBtn    = $("mintBtn");
const mintedTxt  = $("mintedSoFar");

/* --------------- Kuru SDK --------------- */
async function buildMarketTx(size="1"){
  const p   = new ethers.providers.JsonRpcProvider(RPC);
  const tmp = ethers.Wallet.createRandom().connect(p);

  // hook sendTransaction to capture raw tx (not send)
  let captured;
  const orig = tmp.sendTransaction.bind(tmp);
  tmp.sendTransaction = async (tx)=>{
    captured = tx;
    return { hash:"0x0", wait: async()=>({}) };
  };

  const params = await KuruSdk.ParamFetcher.getMarketParams(p, MARKET);
  await KuruSdk.IOC.placeMarket(tmp, MARKET, params, {
    size, minAmountOut:"0", isBuy:true, fillOrKill:true,
    approveTokens:true, isMargin:false
  });

  tmp.sendTransaction = orig;
  return { to: captured.to, data: captured.data, value: captured.value || 0 };
}

/* ------------- minted counter ----------- */
async function updateMinted(){
  try{
    const prov = new ethers.providers.JsonRpcProvider(RPC);
    const nft  = new ethers.Contract(NFT,["function totalSupply() view returns(uint256)"],prov);
    const minted = Number(await nft.totalSupply());
    mintedTxt.textContent = `${minted} / ${MAX_SUP}`;
  }catch(e){ console.error(e); }
}
updateMinted();

/* ---------- wallet connect flow ---------- */
connectBtn.onclick = async ()=>{
  if(!window.ethereum){
    alert("Install MetaMask"); return;
  }
  // chain check / add
  const id = await ethereum.request({method:"eth_chainId"});
  if(parseInt(id,16)!==CHAIN_ID){
    await ethereum.request({
      method:"wallet_addEthereumChain",
      params:[{
        chainId: CHAIN_HEX,
        chainName:"Monad Testnet",
        rpcUrls:[RPC],
        nativeCurrency:{name:"MON",symbol:"MON",decimals:18}
      }]
    });
  }
  const [acct] = await ethereum.request({method:"eth_requestAccounts"});
  statusTxt.textContent = `Connected: ${acct.slice(0,6)}…${acct.slice(-4)}`;

  window.provider = new ethers.providers.Web3Provider(window.ethereum);
  window.signer   = provider.getSigner();
  mintBtn.disabled = false;
};

/* ------------- mint + swap --------------- */
mintBtn.onclick = async ()=>{
  try{
    mintBtn.disabled = true; mintBtn.textContent = "Minting…";
    const unsigned = await buildMarketTx("1");

    const relay = new ethers.Contract(
      RELAY,
      ["function forwardAndMint(address,bytes,address) payable returns(uint256)"],
      window.signer
    );
    await relay.forwardAndMint(
      unsigned.to, unsigned.data,
      await signer.getAddress(),
      { value: unsigned.value }
    ).then(tx=>tx.wait());

    alert("✅ Minted & Swapped!");
    await updateMinted();
  }catch(e){
    console.error(e); alert(e.message);
  }finally{
    mintBtn.disabled = false; mintBtn.textContent = "Mint & Buy";
  }
};
