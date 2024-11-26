// For interactive documentation and code auto-completion in editor
/** @typedef {import('pear-interface')} */

/* global Pear */
import Hyperswarm from "hyperswarm"; // Module for P2P networking and connecting peers
import crypto from "hypercore-crypto"; // Cryptographic functions for generating the key in app
import b4a from "b4a"; // Module for buffer-to-string and vice-versa conversions
import Hypercore from "hypercore";

import bcrypt from "bcryptjs";

const { teardown } = Pear; // Functions for cleanup and updates

const swarm = new Hyperswarm();

const userCore = new Hypercore("./user-core", { valueEncoding: "json" });

teardown(() => {
  userCore.close((err) => {
    if (err) console.error("Error closing Hypercore:", err);
  });
  swarm.destroy();
});

document
  .querySelector("#signup--form")
  .addEventListener("submit", signUpUsername);
document.querySelector("#signUpBtn").addEventListener("click", signUpUsername);

document
  .querySelector("#login--form")
  .addEventListener("submit", loginUsername);
document.querySelector("#loginBtn").addEventListener("click", loginUsername);

async function signUpUsername() {
  const username = document.getElementById("signup--username").value;
  const password = document.getElementById("signup--password").value;
  const confirmPassword = document.getElementById(
    "signup--confirmPassword"
  ).value;

  if (password !== confirmPassword) {
    console.log("Passwords do not match");
    return;
  }

  const keyPair = crypto.keyPair();
  const publicKey = keyPair.publicKey.toString("hex");

  const hashedPass = bcrypt.hashSync(password, 10);

  const userDoc = {
    type: "user",
    username: username,
    publicKey: publicKey,
    password: hashedPass,
    timeStamp: Date.now(),
  };

  console.log(userDoc);

  userCore.append(userDoc, (err) => {
    if (err) console.error("Failed to save user:", err);
    else console.log("User signed up successfully:", userDoc);
  });
}

async function loginUsername() {
  const username = document.getElementById("login--username").value;
  const password = document.getElementById("login--password").value;

  userCore
    .createReadStream()
    .on("data", (data) => {
      if (data.username === username) {
        if (bcrypt.compareSync(password, data.password)) {
          console.log("Login Successfully");
        } else {
          console.log("Incorrect Pass");
        }
      }
    })
    .on("end", () => {
      console.log("User not found!!!");
    });
}
