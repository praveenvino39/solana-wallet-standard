import { MySolana } from "./provider";
import { registerWallet } from "./register";
import { MySolanaWallet } from "./wallet";

export function initialize(mySolana: MySolana): void {
  registerWallet(new MySolanaWallet(mySolana));
}
