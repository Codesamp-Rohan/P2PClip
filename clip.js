import Hyperswarm from "hyperswarm";
import crypto from "hypercore-crypto";
import b4a from "b4a";
import Hypercore from "hypercore";
import bcrypt from "bcryptjs";

const swarm = new Hyperswarm();
const userCore = new Hypercore("./user-rooms", { valueEncoding: "json" });

function cleanup() {
  userCore.close((err) => {
    if (err) {
      console.error("Error closing Hypercore:", err);
    } else {
      console.log("Hypercore closed successfully.");
    }
  });

  swarm.destroy((err) => {
    if (err) {
      console.error("Error destroying swarm:", err);
    } else {
      console.log("Hyperswarm destroyed successfully.");
    }
  });
}

// Trigger cleanup on page unload
window.addEventListener("beforeunload", cleanup);

// Read and display the roomKey from userCore
userCore.createReadStream().on("data", (data) => {
  if (data.roomKey) {
    document.querySelector("#roomKey").textContent = data.roomKey;
  } else {
    console.log("No roomKey found in data:", data);
  }
});
