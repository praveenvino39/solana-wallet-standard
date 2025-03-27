import {
  SolanaSignAndSendTransaction,
  SolanaSignAndSendTransactionFeature,
  SolanaSignAndSendTransactionMethod,
  SolanaSignAndSendTransactionOutput,
  SolanaSignMessage,
  SolanaSignMessageFeature,
  SolanaSignMessageMethod,
  SolanaSignMessageOutput,
  SolanaSignTransaction,
  SolanaSignTransactionFeature,
  SolanaSignTransactionMethod,
  SolanaSignTransactionOutput,
} from "@solana/wallet-standard-features";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  bytesEqual,
  StandardConnect,
  StandardConnectMethod,
  StandardDisconnect,
  StandardDisconnectMethod,
  StandardEvents,
  StandardEventsListeners,
  StandardEventsNames,
  StandardEventsOnMethod,
  Wallet,
} from "@wallet-standard/core";
import {
  StandardConnectFeature,
  StandardDisconnectFeature,
  StandardEventsFeature,
} from "@wallet-standard/features";
import base58 from "bs58";
import { MySolanaWalletAccount } from "./account";
import { icon } from "./icon";
import { MySolana } from "./provider";
import {
  isSolanaChain,
  isVersionedTransaction,
  SOLANA_CHAINS,
  SolanaChain,
} from "./solana";

export const MySolanaNamespace = "my-solana:";

export type MySolanaFeature = {
  [MySolanaNamespace]: {
    mySolana: MySolana;
  };
};

export class MySolanaWallet implements Wallet {
  readonly #listeners: {
    [E in StandardEventsNames]?: StandardEventsListeners[E][];
  } = {};
  readonly #version = "1.0.0" as const;
  readonly #name = "My Solana" as const;
  readonly #icon = icon;
  #account: MySolanaWalletAccount | null = null;
  readonly #mySolana: MySolana;

  get version() {
    return this.#version;
  }

  get name() {
    return this.#name;
  }

  get icon() {
    return this.#icon;
  }

  get chains() {
    return SOLANA_CHAINS.slice();
  }

  get features(): StandardConnectFeature &
    StandardDisconnectFeature &
    StandardEventsFeature &
    SolanaSignAndSendTransactionFeature &
    SolanaSignTransactionFeature &
    SolanaSignMessageFeature &
    MySolanaFeature {
    return {
      [StandardConnect]: {
        version: "1.0.0",
        connect: this.#connect,
      },
      [StandardDisconnect]: {
        version: "1.0.0",
        disconnect: this.#disconnect,
      },
      [StandardEvents]: {
        version: "1.0.0",
        on: this.#on,
      },
      [SolanaSignAndSendTransaction]: {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signAndSendTransaction: this.#signAndSendTransaction,
      },
      [SolanaSignTransaction]: {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: this.#signTransaction,
      },
      [SolanaSignMessage]: {
        version: "1.0.0",
        signMessage: this.#signMessage,
      },
      [MySolanaNamespace]: {
        mySolana: this.#mySolana,
      },
    };
  }

  get accounts() {
    return this.#account ? [this.#account] : [];
  }

  constructor(mySolana: MySolana) {
    this.#mySolana = mySolana;

    mySolana.on("connect", this.#connected);
    mySolana.on("disconnect", this.#disconnected);
    mySolana.on("accountChanged", this.#reconnected);

    this.#connected();
  }

  #on: StandardEventsOnMethod = (event, listener) => {
    this.#listeners[event]?.push(listener) ||
      (this.#listeners[event] = [listener]);
    return (): void => this.#off(event, listener);
  };

  #emit<E extends StandardEventsNames>(
    event: E,
    ...args: Parameters<StandardEventsListeners[E]>
  ): void {
    // eslint-disable-next-line prefer-spread
    this.#listeners[event]?.forEach((listener) => listener.apply(null, args));
  }

  #off<E extends StandardEventsNames>(
    event: E,
    listener: StandardEventsListeners[E]
  ): void {
    this.#listeners[event] = this.#listeners[event]?.filter(
      (existingListener) => listener !== existingListener
    );
  }

  #connected = () => {
    const address = this.#mySolana.publicKey?.toBase58();
    if (address) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const publicKey = this.#mySolana.publicKey!.toBytes();

      const account = this.#account;
      if (
        !account ||
        account.address !== address ||
        !bytesEqual(account.publicKey, publicKey)
      ) {
        this.#account = new MySolanaWalletAccount({ address, publicKey });
        this.#emit("change", { accounts: this.accounts });
      }
    }
  };

  #disconnected = () => {
    if (this.#account) {
      this.#account = null;
      this.#emit("change", { accounts: this.accounts });
    }
  };

  #reconnected = () => {
    if (this.#mySolana.publicKey) {
      this.#connected();
    } else {
      this.#disconnected();
    }
  };

  #connect: StandardConnectMethod = async ({ silent } = {}) => {
    if (!this.#account) {
      await this.#mySolana.connect(
        silent ? { onlyIfTrusted: true } : undefined
      );
    }

    this.#connected();

    return { accounts: this.accounts };
  };

  #disconnect: StandardDisconnectMethod = async () => {
    await this.#mySolana.disconnect();
  };

  #signAndSendTransaction: SolanaSignAndSendTransactionMethod = async (
    ...inputs
  ) => {
    if (!this.#account) throw new Error("not connected");

    const outputs: SolanaSignAndSendTransactionOutput[] = [];

    if (inputs.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { transaction, account, chain, options } = inputs[0]!;
      const { minContextSlot, preflightCommitment, skipPreflight, maxRetries } =
        options || {};
      if (account !== this.#account) throw new Error("invalid account");
      if (!isSolanaChain(chain)) throw new Error("invalid chain");

      const { signature } = await this.#mySolana.signAndSendTransaction(
        VersionedTransaction.deserialize(transaction),
        {
          preflightCommitment,
          minContextSlot,
          maxRetries,
          skipPreflight,
        }
      );

      outputs.push({ signature: base58.decode(signature) });
    } else if (inputs.length > 1) {
      for (const input of inputs) {
        outputs.push(...(await this.#signAndSendTransaction(input)));
      }
    }

    return outputs;
  };

  #signTransaction: SolanaSignTransactionMethod = async (...inputs) => {
    if (!this.#account) throw new Error("not connected");

    const outputs: SolanaSignTransactionOutput[] = [];

    if (inputs.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { transaction, account, chain } = inputs[0]!;
      if (account !== this.#account) throw new Error("invalid account");
      if (chain && !isSolanaChain(chain)) throw new Error("invalid chain");

      const signedTransaction = await this.#mySolana.signTransaction(
        VersionedTransaction.deserialize(transaction)
      );

      const serializedTransaction = isVersionedTransaction(signedTransaction)
        ? signedTransaction.serialize()
        : new Uint8Array(
            (signedTransaction as Transaction).serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            })
          );

      outputs.push({ signedTransaction: serializedTransaction });
    } else if (inputs.length > 1) {
      let chain: SolanaChain | undefined = undefined;
      for (const input of inputs) {
        if (input.account !== this.#account) throw new Error("invalid account");
        if (input.chain) {
          if (!isSolanaChain(input.chain)) throw new Error("invalid chain");
          if (chain) {
            if (input.chain !== chain) throw new Error("conflicting chain");
          } else {
            chain = input.chain;
          }
        }
      }

      const transactions = inputs.map(({ transaction }) =>
        VersionedTransaction.deserialize(transaction)
      );

      const signedTransactions = await this.#mySolana.signAllTransactions(
        transactions
      );

      outputs.push(
        ...signedTransactions.map(
          (signedTransaction: Transaction | VersionedTransaction) => {
            const serializedTransaction = isVersionedTransaction(
              signedTransaction
            )
              ? signedTransaction.serialize()
              : new Uint8Array(
                  (signedTransaction as Transaction).serialize({
                    requireAllSignatures: false,
                    verifySignatures: false,
                  })
                );

            return { signedTransaction: serializedTransaction };
          }
        )
      );
    }

    return outputs;
  };

  #signMessage: SolanaSignMessageMethod = async (...inputs) => {
    if (!this.#account) throw new Error("not connected");

    const outputs: SolanaSignMessageOutput[] = [];

    if (inputs.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { message, account } = inputs[0]!;
      if (account !== this.#account) throw new Error("invalid account");

      const { signature } = await this.#mySolana.signMessage(message);

      outputs.push({ signedMessage: message, signature });
    } else if (inputs.length > 1) {
      for (const input of inputs) {
        outputs.push(...(await this.#signMessage(input)));
      }
    }

    return outputs;
  };
}
