/* -------- Config -------- */
const RPC   ="https://testnet-rpc.monad.xyz";
const RELAY ="0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5";
const MKT   ="0x116a9f35a402a2d34457bd72026c7f722d9d6333";
const NFT   ="0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3";
const CHAIN =10143, HEX="0x279F";

/* -------- DOM -------- */
const $=id=>document.getElementById(id);
const connectBtn=$("connectWalletBtn"), statusTxt=$("walletStatus");
const mintBtn=$("mintBtn"), mintedTxt=$("mintedSoFar");

/* -------- buildMarketTx (SDK + ethers v5) -------- */
async function buildMarketTx(size="1"){
  const p=new ethers.providers.JsonRpcProvider(RPC);
  const w=ethers.Wallet.createRandom().connect(p);
  let cap;const o=w.sendTransaction.bind(w);
  w.sendTransaction=async tx=>{cap=tx;return{hash:"0x0",wait:async()=>({})}};
  const params=await KuruSDK.ParamFetcher.getMarketParams(p,MKT);  /* SDK call */
  await KuruSDK.IOC.placeMarket(w,MKT,params,{size,minAmountOut:"0",isBuy:true,fillOrKill:true,approveTokens:true,isMargin:false});
  w.sendTransaction=o;
  return{to:cap.to,data:cap.data,value:cap.value||0};
}

/* -------- Wallet connect -------- */
connectBtn.onclick=async()=>{
  if(!window.ethereum)return alert("MetaMask not found");
  const id=await ethereum.request({method:"eth_chainId"});
  if(parseInt(id,16)!==CHAIN){
    await ethereum.request({method:"wallet_addEthereumChain",params:[{
      chainId:HEX,chainName:"Monad Testnet",rpcUrls:[RPC],
      nativeCurrency:{name:"MON",symbol:"MON",decimals:18}
    }]}); /* MetaMask docs */
  }
  const [acct]=await ethereum.request({method:"eth_requestAccounts"});
  statusTxt.textContent=`Connected: ${acct.slice(0,6)}…${acct.slice(-4)}`;
  window.provider=new ethers.providers.Web3Provider(window.ethereum);
  window.signer=provider.getSigner();
  mintBtn.disabled=false;
};

/* -------- Mint＋Swap -------- */
mintBtn.onclick=async()=>{
  try{
    mintBtn.disabled=true;mintBtn.textContent="Minting…";
    const u=await buildMarketTx("1");
    const relay=new ethers.Contract(RELAY,
      ["function forwardAndMint(address,bytes,address) payable returns(uint256)"],
      window.signer);
    const tx=await relay.forwardAndMint(u.to,u.data,await signer.getAddress(),{value:u.value});
    await tx.wait();alert("✅ Minted & Swapped!");
  }catch(e){alert(e.message)}finally{mintBtn.disabled=false;mintBtn.textContent="Mint & Buy"}
};
