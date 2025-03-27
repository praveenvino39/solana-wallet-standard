import { initialize } from "./wallet-standard/initialize";
import { MySolana } from "./wallet-standard/provider";

export { MySolana } from "./wallet-standard/provider";

(function () {
  const mySolana = new MySolana();
  Object.defineProperty(window, "mySolana", {
    value: {
      solana: mySolana,
    },
  });
  Object.defineProperty(window, "solana", {
    value: mySolana,
  });
  initialize(mySolana);
  alert("WALLET REGISTERED");
})();
