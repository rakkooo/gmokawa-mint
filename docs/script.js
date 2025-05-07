// script.js

/* ---------- 設定 ---------- */
const RPC       = "https://testnet-rpc.monad.xyz";
const RELAY     = "0x36C99a9C28C728852816c9d2A5Ae9267b66c61B5"; // リレーコントラクトアドレス
const MARKET    = "0x116a9f35a402a2d34457bd72026c7f722d9d6333"; // Kuru SDK のマーケットアドレス
const NFT       = "0x3B85eE467938ca59ea22Fd63f505Ce8103ABb4B3"; // NFTコントラクトアドレス
const MAX_SUP   = 5000; // NFTの最大発行数
const CHAIN_ID  = 10143; // Monad Testnet の Chain ID (例: Sepoliaなら11155111)
const CHAIN_HEX = "0x279F"; // Monad Testnet の Chain ID (16進数) (例: "0xaa36a7")

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const connectBtn = $("connectWalletBtn");
const statusTxt  = $("walletStatus");
const mintBtn    = $("mintBtn");
const mintedTxt  = $("mintedSoFar");

/* ---------- Kuru SDK (window.KuruSdk から取得) ---------- */
// KuruSdk は HTML で script src="kuru-sdk.browser.js" によりロードされている想定
const { ParamFetcher, IOC } = window.KuruSdk;

/* ---------- Swap 用 unsigned TX を生成（送信しない）---------- */
async function buildMarketTx(size = "1") {
  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const signer   = ethers.Wallet.createRandom().connect(provider); // ダミー signer
  const params   = await ParamFetcher.getMarketParams(provider, MARKET);

  let captured;
  const origSendTransaction = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async (tx) => {
    captured = tx;
    // KuruSDKが期待するかもしれない最小限のダミーレスポンス
    return {
      hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      wait: async () => ({
        status: 1, // 成功ステータス
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000000"
      })
    };
  };

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

  signer.sendTransaction = origSendTransaction; // フックを解除

  return {
    to:    captured?.to,
    data:  captured?.data ?? '0x', // data が undefined なら '0x' にフォールバック
    value: captured?.value ?? 0n   // value が undefined なら BigInt の 0n
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
    // totalSupply は BigNumber インスタンスなので toString() で文字列に変換
    mintedTxt.textContent = `${totalSupply.toString()} / ${MAX_SUP}`;
  } catch (e) {
    console.error("Error updating minted count:", e);
    mintedTxt.textContent = `-- / ${MAX_SUP}`;
  }
}
updateMinted(); // 初期表示
// setInterval(updateMinted, 30000); // 必要であれば定期更新

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
        // まずはネットワークの切り替えを試みる
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_HEX }],
        });
      } catch (switchError) {
        // ユーザーがネットワークを持っていない場合 (エラーコード 4902)
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: CHAIN_HEX,
                chainName: "Monad Testnet", // 表示名
                rpcUrls: [RPC],
                nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }
                // blockExplorerUrls: ["..."] // 必要に応じてブロックエクスプローラーのURL
              }]
            });
          } catch (addError) {
            console.error("Failed to add the network:", addError);
            alert(`ネットワークの追加に失敗しました: ${addError.message}`);
            return;
          }
        } else {
          // その他の切り替えエラー
          console.error("Failed to switch the network:", switchError);
          alert(`ネットワークの切り替えに失敗しました: ${switchError.message}`);
          return;
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
    connectBtn.disabled = true; // 接続後はボタンを無効化

  } catch (error) {
    console.error("Wallet connection failed:", error);
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

    const unsignedSwapTx = await buildMarketTx("1"); // 1 MON を購入するSwap Txを構築

    if (!unsignedSwapTx.to || !unsignedSwapTx.data || unsignedSwapTx.data === '0x') {
      // dataが'0x'の場合も実質的にデータがないためエラーとする
      console.error("Failed to build swap transaction:", unsignedSwapTx);
      throw new Error("スワップトランザクションの生成に失敗しました。(to または data が不正です)");
    }

    const relayContract = new ethers.Contract(
      RELAY,
      ["function forwardAndMint(address target, bytes memory data, address recipient) payable returns(uint256 tokenId)"],
      window.signer
    );

    // unsignedSwapTx.value は BigInt (0n) の可能性があるため、ethers.BigNumber に変換
    // toString() を経由することで BigInt から文字列へ、そして BigNumber.from で BigNumber へ
    const valueForTx = ethers.BigNumber.from(unsignedSwapTx.value.toString());
    const recipientAddress = await window.signer.getAddress();

    console.log("Calling forwardAndMint with:", {
        target: unsignedSwapTx.to,
        data: unsignedSwapTx.data,
        recipient: recipientAddress,
        value: valueForTx.toString() // ログ表示用
    });

    const tx = await relayContract.forwardAndMint(
      unsignedSwapTx.to,
      unsignedSwapTx.data,
      recipientAddress,
      { value: valueForTx } // ETHを送信する場合のvalue (BigNumberish)
    );

    mintBtn.textContent = "トランザクション確認中…";
    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait(); // トランザクションがブロックに含まれるのを待つ
    console.log("Transaction confirmed:", receipt);

    let mintedTokenIdMsg = "";
    // リレーコントラクトの forwardAndMint が tokenId を含むイベントを発行することを期待
    // 一般的なERC721のTransferイベントからtokenIdを取得する例:
    // topics[0]: Event Signature (Transfer(address,address,uint256))
    // topics[1]: from address
    // topics[2]: to address
    // topics[3]: tokenId
    if (receipt.logs && receipt.logs.length > 0) {
        // forwardAndMintが内部でNFTをミントし、そのNFTコントラクトがTransferイベントを発行する場合
        const transferEvent = receipt.events?.find(
            (event) => event.address === NFT && // NFTコントラクトアドレスからのイベント
                       event.eventSignature === "Transfer(address,address,uint256)" && // イベントシグネチャ
                       event.args && event.args.to === recipientAddress // 受取人が自分であること
        );
        if (transferEvent && transferEvent.args.tokenId) {
            mintedTokenIdMsg = ` TokenId: ${transferEvent.args.tokenId.toString()}`;
        } else {
            // 元のコードのように最後のログのtopics[3]を試す (ただし確実ではない)
            const lastLog = receipt.logs[receipt.logs.length - 1];
            // NFTコントラクトからのTransferイベントかつトピック数が4つであることを確認
            if (lastLog && lastLog.address === NFT && lastLog.topics?.length === 4 &&
                lastLog.topics[0] === ethers.utils.id("Transfer(address,address,uint256)")) {
                 try {
                    const potentialTokenId = ethers.BigNumber.from(lastLog.topics[3]);
                    mintedTokenIdMsg = ` (TokenId from logs: ${potentialTokenId.toString()})`;
                 } catch (logError) {
                    console.warn("Could not parse tokenId from last log's topics[3]", logError);
                 }
            } else {
                 console.log("Could not determine minted tokenId from events.");
            }
        }
    }


    alert(`✅ Mint & Swap 完了!${mintedTokenIdMsg}`);
    await updateMinted();

  } catch (e) {
    console.error("Mint & Swap failed:", e);
    let displayMessage = "エラーが発生しました。";
    if (e.reason) { // Ethers.js コントラクト関連のエラー
        displayMessage = e.reason;
    } else if (e.data && typeof e.data.message === 'string') { // MetaMaskなどが返すエラー (e.dataが存在するか、messageが文字列か確認)
        displayMessage = e.data.message;
    } else if (e.message) {
        displayMessage = e.message;
    }
    // "transaction" にエラーが含まれている場合も考慮 (ethers.js v5 の一部のエラー形式)
    if (e.transaction && e.transaction.message) {
        displayMessage = e.transaction.message;
    }
    alert(`❌ エラー: ${displayMessage}`);
  } finally {
    mintBtn.disabled = false;
    mintBtn.textContent = "Mint & Buy";
  }
};

// 初期状態ではMintボタンを無効化
mintBtn.disabled = true;
