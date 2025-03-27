import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import EventEmitter from "events";

export class MySolana extends EventEmitter {
  isMySolana = true;
  isConnected = false;
  publicKey: PublicKey | null = null;

  sendRequestToNative = (data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      // if ((!this.isConnected || this.publicKey === null || window.ReactNativeWebView === undefined) && data.method !== 'connect') {
      //     return reject(new Error('Wallet not connected'));
      // }
      // Generate a unique ID for tracking responses
      const requestId = Math.random().toString(36).substring(2);

      // Create a listener for the response
      const handleMessage = (event: any) => {
        try {
          const messageData = JSON.parse(event.data);
          if (messageData.requestId === requestId) {
            resolve(messageData.result); // Resolve the promise with the result
            window.removeEventListener("message", handleMessage);
          }
        } catch (error) {
          console.log(error);
        }
      };

      // Listen for messages from React Native
      window.addEventListener("message", handleMessage);

      // Send the request to React Native
      (window as any).ReactNativeWebView.postMessage(
        JSON.stringify({ requestId, data })
      );
    });
  };

  connect = async (config: any) => {
    console.log("Solana Wallet Connected");
    const { publicKey } = await this.sendRequestToNative({
      method: "connect",
      params: { config },
    });
    const result = new PublicKey(publicKey);
    this.publicKey = result;
    this.emit("connect", result);
    this.isConnected = true;
    return result; // Resolve the promise with the result
  };
  disconnect = async () => {
    this.publicKey = null;
    this.isConnected = false;
    this.emit("disconnect");
  };

  signMessage = async (message: any, t = "utf8") => {
    console.log("SignMessage", message);
    const { signature, publicKey } = await this.sendRequestToNative({
      method: "sign_message",
      params: { message, t },
    });
    const pkey = new PublicKey(publicKey);
    const messageInUtf8Array = Object.keys(signature).map(
      (key) => signature[key]
    );
    return {
      signature: Buffer.from(Uint8Array.from(messageInUtf8Array)),
      publicKey: pkey,
    };
  };

  signAndSendTransaction = async (transaction: any, options: any) => {
    if ("version" in transaction) {
      console.log("transaction", transaction);
      const serializedTransaction = transaction.serialize();
      const encodedTransaction = bs58.encode(serializedTransaction);
      const signatures = transaction.signatures.map((sig: any) =>
        bs58.encode(sig)
      );
      const { signature, publicKey } = await this.sendRequestToNative({
        method: "sign_and_send_transaction",
        params: {
          transaction: encodedTransaction,
          signatures,
          type: "versioned",
        },
      });
      return { signature, publicKey: new PublicKey(publicKey) };
    }
    console.log("transaction", transaction);
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
    });
    const encodedTransaction = bs58.encode(serializedTransaction);
    console.log("SignAndSendTransaction", encodedTransaction);
    const { signature, publicKey } = await this.sendRequestToNative({
      method: "sign_and_send_transaction",
      params: { transaction: encodedTransaction, type: "legacy" },
    });
    return { signature, publicKey: new PublicKey(publicKey) };
  };

  signTransaction = async (transaction: any) => {
    if ("version" in transaction) {
      alert("Versioned Transaction");
      const serializedTransaction = transaction.serialize();
      const encodedTransaction = bs58.encode(serializedTransaction);
      const signatures = transaction.signatures.map((sig: any) =>
        bs58.encode(sig)
      );
      const response = await this.sendRequestToNative({
        method: "sign_transaction",
        params: {
          transaction: encodedTransaction,
          signatures,
          type: "versioned",
        },
      });
      const signedTransaction = VersionedTransaction.deserialize(
        bs58.decode(response.encodedSignedTransaction)
      );
      const signedSignatures = response.encodedSignedSignatures.map(
        (sig: any) => bs58.decode(sig)
      );
      signedTransaction.signatures = signedSignatures;
      console.log("signedTransaction ", signedTransaction);
      return signedTransaction;
    }
    alert("Legacy Transaction");
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
    });
    const encodedTransaction = bs58.encode(serializedTransaction);
    console.log("SignAndSendTransaction", encodedTransaction);
    const result = await this.sendRequestToNative({
      method: "sign_transaction",
      params: { transaction: encodedTransaction, type: "legacy" },
    });
    const decodedTx = bs58.decode(result);
    const parsedTx = Transaction.from(decodedTx);
    return parsedTx;
  };

  signAllTransactions = async (transactions: any) => {
    console.log("SignAllTransactions", transactions);
    const encodedTransactions = [];
    for (let i = 0; i < transactions.length; i++) {
      if ("version" in transactions[i]) {
        const serializedTransaction = transactions[i].serialize();
        const encodedTransaction = bs58.encode(serializedTransaction);
        const signatures = transactions[i].signatures.map((sig: any) =>
          bs58.encode(sig)
        );
        encodedTransactions.push({
          transaction: encodedTransaction,
          signatures,
          type: "versioned",
        });
      } else {
        const serializedTransaction = transactions[i].serialize({
          requireAllSignatures: false,
        });
        const encodedTransaction = bs58.encode(serializedTransaction);
        encodedTransactions.push({
          transaction: encodedTransaction,
          type: "legacy",
        });
      }
    }
    const encodedSignedTransactionsResponse = await this.sendRequestToNative({
      method: "sign_all_transactions",
      params: { transactions: encodedTransactions },
    });
    console.log(
      "ENDCODE SIGNED TRANSACTION REPSONSE ",
      encodedSignedTransactionsResponse
    );
    const signedTransactions = [];
    for (let i = 0; i < encodedSignedTransactionsResponse.length; i++) {
      const encodedSignedTransaction = encodedSignedTransactionsResponse[i];
      console.log("ENDCODE SIGNED TRANSACTION ", encodedSignedTransaction);

      if (encodedSignedTransaction.versioned) {
        const signedTransaction = VersionedTransaction.deserialize(
          bs58.decode(encodedSignedTransaction.encodedSignedTransaction)
        );
        const signedSignatures =
          encodedSignedTransaction.encodedSignedSignatures.map((sig: any) =>
            bs58.decode(sig)
          );
        signedTransaction.signatures = signedSignatures;
        signedTransactions.push(signedTransaction);
      } else {
        const signedTransaction = Transaction.from(
          bs58.decode(encodedSignedTransaction.encodedSignedTransaction)
        );
        signedTransactions.push(signedTransaction);
      }
    }
    console.log("SIGNED TRANSACTIONS ", signedTransactions);
    return signedTransactions;
  };

  emitAccountsChanged = (publicKey: any) => {
    this.emit("accountChanged", new PublicKey(publicKey));
  };
}
