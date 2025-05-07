// script.js

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
  console.log("[buildMarketTx] Starting transaction build...");
  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const signer   = ethers.Wallet.createRandom().connect(provider);
  console.log("[buildMarketTx] Dummy signer created:", signer.address);

  let marketParams;
  try {
    marketParams = await ParamFetcher.getMarketParams(provider, MARKET);
    // paramsの内容を詳細にログ出力 (null や undefined の可能性があるため安全に文字列化)
    console.log("[buildMarketTx] Market params fetched:", marketParams ? JSON.stringify(marketParams) : "null or undefined");
    if (!marketParams || Object.keys(marketParams).length === 0) {
        const errorMsg = "[buildMarketTx] Market params are empty or invalid.";
        console.error(errorMsg, marketParams);
        throw new Error("Failed to fetch valid market parameters from KuruSDK.");
    }
  } catch (error) {
    console.error("[buildMarketTx] Error fetching market params:", error);
    throw error;
  }

  let capturedTransaction;
  const origSendTransaction = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async (tx) => {
    // キャプチャしたtxを詳細にログ出力
    console.log("[buildMarketTx] signer.sendTransaction HOOKED. Captured tx raw:", tx);
    console.log("[buildMarketTx] Captured tx (JSON):", JSON.stringify(tx, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value // BigIntを文字列に変換
    ));
    capturedTransaction = tx;
    return {
      hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      wait: async () => ({
        status: 1,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000000"
      })
    };
  };

  try {
    console.log("[buildMarketTx] Calling IOC.placeMarket with size:", size, "and params:", marketParams ? JSON.stringify(marketParams) : "null or undefined");
    await IOC.placeMarket(
      signer,
      MARKET,
      marketParams,
      {
        size,
        minAmountOut: "0",
        isBuy: true,
        fillOrKill: true,
        approveTokens: true,
        isMargin: false
      }
    );
    console.log("[buildMarketTx] IOC.placeMarket call completed.");
  } catch (error) {
    console.error("[buildMarketTx] Error during IOC.placeMarket call:", error);
    signer.sendTransaction = origSendTransaction; // フックを解除
    throw error;
  }

  signer.sendTransaction = origSendTransaction; // フックを解除

  if (!capturedTransaction) {
    const errorMsg = "[buildMarketTx] sendTransaction was never called by IOC.placeMarket. SDK might have failed silently or params were insufficient.";
    console.error(errorMsg);
    throw new Error("IOC.placeMarket did not produce a transaction. Check KuruSDK interaction and market parameters.");
  }
  
  console.log("[buildMarketTx] Raw captured transaction data to be returned:", {
    to:    capturedTransaction.to,
    data:  capturedTransaction.data,
    value: capturedTransaction.value
  });

  return {
    to:    capturedTransaction.to,
    data:  capturedTransaction.data ?? '0x',
    value: capturedTransaction.value ?? 0n
  };
}

/* ---------- 発行枚数カウンタ ---------- */
async function updateMinted() {
  try {
    const prov = new ethers.providers.JsonRpcProvider(RPC);
    const nftContract  = new ethers.Contract(
      NFT,
      ["function totalSupply() view returns(uint256)"],
      prov
    );
    const totalSupply = await nftContract.totalSupply();
    mintedTxt.textContent = `${totalSupply.toString()} / ${MAX_SUP}`;
  } catch (e) {
    console.error("Error updating minted count:", e);
    mintedTxt.textContent = `-- / ${MAX_SUP}`;
  }
}
updateMinted();

/* ---------- ウォレット接続 ---------- */
connectBtn.onclick = async () => {
  if (!window.ethereum) {
    alert("MetaMask をインストールしてください。");
    return;
  }
  try {
    const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(currentChainId, 16) !== CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_HEX }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: CHAIN_HEX,
                chainName: "Monad Testnet",
                rpcUrls: [RPC],
                nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }
              }]
            });
          } catch (addError) {
            alert(`ネットワークの追加に失敗しました: ${addError.message}`); return;
          }
        } else {
          alert(`ネットワークの切り替えに失敗しました: ${switchError.message}`); return;
        }
      }
    }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const account = accounts[0];
    statusTxt.textContent = `Connected: ${account.slice(0, 6)}…${account.slice(-4)}`;
    window.provider = new ethers.providers.Web3Provider(window.ethereum);
    window.signer   = window.provider.getSigner();
    mintBtn.disabled = false;
    connectBtn.textContent = "Wallet Connected";
    connectBtn.disabled = true;
  } catch (error) {
    statusTxt.textContent = "Connection failed";
    alert(`ウォレット接続に失敗しました: ${error.message || "不明なエラー"}`);
  }
};

/* ---------- Mint ＋ Swap ボタン ---------- */
mintBtn.onclick = async () => {
  if (!window.signer) {
    alert("ウォレットを接続してください。");
    return;
  }
  try {
    mintBtn.disabled = true;
    mintBtn.textContent = "処理中…";

    const unsignedSwapTx = await buildMarketTx("1");
    console.log("Transaction details from buildMarketTx:", unsignedSwapTx);


    if (!unsignedSwapTx.to || !unsignedSwapTx.data || unsignedSwapTx.data === '0x' || unsignedSwapTx.data.length <= 2) { // '0x'だけでなく、実質的に空の場合もチェック
      console.error("Failed to build swap transaction or data is empty:", unsignedSwapTx);
      throw new Error("スワップトランザクションの生成に失敗しました。(to または data が不正です)");
    }

    const relayContract = new ethers.Contract(
      RELAY,
      ["function forwardAndMint(address target, bytes memory data, address recipient) payable returns(uint256 tokenId)"],
      window.signer
    );

    const valueForTx = ethers.BigNumber.from(unsignedSwapTx.value.toString());
    const recipientAddress = await window.signer.getAddress();

    console.log("Calling relay.forwardAndMint with:", {
        target: unsignedSwapTx.to,
        data: unsignedSwapTx.data,
        recipient: recipientAddress,
        value: valueForTx.toString()
    });

    const tx = await relayContract.forwardAndMint(
      unsignedSwapTx.to,
      unsignedSwapTx.data,
      recipientAddress,
      { value: valueForTx }
    );

    mintBtn.textContent = "トランザクション確認中…";
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);

    let mintedTokenIdMsg = "";
    if (receipt.logs && receipt.logs.length > 0) {
        const transferEvent = receipt.events?.find(
            (event) => event.address === NFT &&
                       event.eventSignature === "Transfer(address,address,uint256)" &&
                       event.args && event.args.to === recipientAddress
        );
        if (transferEvent && transferEvent.args.tokenId) {
            mintedTokenIdMsg = ` TokenId: ${transferEvent.args.tokenId.toString()}`;
        } else {
            const lastLog = receipt.logs[receipt.logs.length - 1];
            if (lastLog && lastLog.address === NFT && lastLog.topics?.length === 4 &&
                lastLog.topics[0] === ethers.utils.id("Transfer(address,address,uint256)")) {
                 try {
                    mintedTokenIdMsg = ` (TokenId from logs: ${ethers.BigNumber.from(lastLog.topics[3]).toString()})`;
                 } catch (logError) { console.warn("Could not parse tokenId from last log", logError); }
            }
        }
    }
    alert(`✅ Mint & Swap 完了!${mintedTokenIdMsg}`);
    await updateMinted();
  } catch (e) {
    console.error("Mint & Swap failed:", e);
    let displayMessage = e.message || "エラーが発生しました。";
    if (e.reason) displayMessage = e.reason;
    else if (e.data?.message) displayMessage = e.data.message;
    alert(`❌ エラー: ${displayMessage}`);
  } finally {
    mintBtn.disabled = false;
    mintBtn.textContent = "Mint & Buy";
  }
};
mintBtn.disabled = true;
