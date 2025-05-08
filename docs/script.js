/* ---------- User-config ---------- */
const RPC_URL  = "https://testnet-rpc.monad.xyz";
const CHAIN_ID = 10143;
const CHAIN_HEX= "0x279F";                 // 10143
const MARKET   = "0x116a9f35a402a2d34457bd72026c7f722d9d6333";
const RELAY    = "0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5";
const NFT      = "0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3";
const SIZE_MON = "1";

/* ---------- DOM refs ---------- */
const $      = (id)=>document.getElementById(id);
const btnC   = $("connectWalletBtn");
const btnM   = $("mintBtn");
const lblW   = $("walletStatus");
const lblCnt = $("mintedSoFar");

/* ---------- Providers ---------- */
const rpcProvider = new ethers.providers.JsonRpcProvider(RPC_URL);   // 読み取り専用
let walletProvider, signer, relay;

/* ---------- 初回：ミント済数 ---------- */
(async()=>{
  const erc721 = new ethers.Contract(NFT,["function totalSupply() view returns(uint256)"],rpcProvider);
  lblCnt.textContent = (await erc721.totalSupply()).toString();
})();

/* ---------- Connect flow ---------- */
btnC.onclick = async ()=>{
  if(!window.ethereum) return alert("MetaMask をインストールしてください");

  /* 1) chain switch → add */
  try{
    await ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:CHAIN_HEX}]});
  }catch(e){
    if(e.code===4902){          // 未登録
      await ethereum.request({
        method:"wallet_addEthereumChain",
        params:[{
          chainId: CHAIN_HEX,
          chainName:"Monad Testnet",
          rpcUrls:[RPC_URL],
          nativeCurrency:{name:"Monad",symbol:"MON",decimals:18}, // ← 数値 18 が必須
          blockExplorerUrls:["https://testnet.monadexplorer.com"]
        }]
      });
    }else{ throw e; }
  }

  /* 2) account request */
  const [acct] = await ethereum.request({method:"eth_requestAccounts"});
  lblW.textContent = `Connected: ${acct.slice(0,6)}…${acct.slice(-4)}`;

  /* 3) providers */
  walletProvider = new ethers.providers.Web3Provider(window.ethereum,"any");
  signer         = walletProvider.getSigner();
  relay  = new ethers.Contract(RELAY,
    ["function forwardAndMint(address,bytes,address) payable returns(uint256)",
     "event ForwardAndMint(address,address,uint256,uint256)"], signer);

  btnM.disabled = false;
};

/* ---------- unsigned Market TX ---------- */
async function buildMarketTx(){
  const marketParams = await KuruSdk.ParamFetcher.getMarketParams(rpcProvider, MARKET); // RPC専用
  let captured;
  const origSend = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async(tx)=>{ captured=tx; return {hash:"0x0",wait:async()=>({status:1})}; };

  await KuruSdk.IOC.placeMarket(
    signer, MARKET, marketParams,
    {size:SIZE_MON,minAmountOut:"0",isBuy:true,fillOrKill:true,approveTokens:true,isMargin:false}
  );
  signer.sendTransaction = origSend;
  return captured;
}

/* ---------- Mint + Swap ---------- */
btnM.onclick = async ()=>{
  try{
    btnM.disabled=true; btnM.textContent="Sending…";
    const u = await buildMarketTx();

    const tx = await relay.forwardAndMint(u.to,u.data,await signer.getAddress(),{value:u.value||0});
    btnM.textContent="Pending…";
    const rc = await tx.wait();
    const id = ethers.BigNumber.from(rc.logs[rc.logs.length-1].topics[3]).toString();
    alert("✅ Minted! tokenId="+id);
    lblCnt.textContent = (+lblCnt.textContent.split(" ")[0])+1;
  }catch(e){
    console.error(e); alert(e.message||"Tx failed");
  }finally{
    btnM.disabled=false; btnM.textContent="Mint & Buy";
  }
};
