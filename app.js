import Hyperswarm from "hyperswarm";
import crypto from "hypercore-crypto";
import b4a from "b4a";
import Hypercore from "hypercore";
import bcrypt from "bcryptjs";

const swarm = new Hyperswarm();
const userCore = new Hypercore("./user-core", { valueEncoding: "json" });

// Clean up resources before the app shuts down
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

// Optionally, listen for window unload events to trigger cleanup
window.addEventListener("beforeunload", cleanup);

// Event Listeners for Sign Up and Login
document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelector("#signUpBtn")
    .addEventListener("click", signUpUsername);
  document.querySelector("#loginBtn").addEventListener("click", loginUsername);
  document.querySelector("#logoutBtn").addEventListener("click", logout);
});

async function signUpUsername() {
  const username = document.getElementById("signup--username").value;
  const password = document.getElementById("signup--password").value;
  const confirmPassword = document.getElementById(
    "signup--confirmPassword"
  ).value;

  if (password !== confirmPassword) {
    notification("red", "Passwords do not match");
    return;
  }

  const keyPair = crypto.keyPair();
  const publicKey = keyPair.publicKey.toString("hex");
  const hashedPass = bcrypt.hashSync(password, 10);

  const userDoc = {
    type: "user",
    username,
    publicKey,
    password: hashedPass,
    timeStamp: Date.now(),
  };
  console.log(userDoc);
  window.location.href = "index.html";

  // Save current user information to localStorage
  localStorage.setItem("currentUser", publicKey);
  localStorage.setItem("isLoggedIn", "true");

  // Append data to userCore
  userCore.append(userDoc, (err) => {
    if (err) {
      console.error("Failed to save user:", err);
      notification("red", "User creation failed due to file lock");
    } else {
      console.log("User signed up successfully:", userDoc);
    }

    // Close userCore after appending data
    userCore.close((err) => {
      if (err) {
        console.error("Error closing Hypercore:", err);
      } else {
        console.log("Hypercore closed successfully after signup.");
      }
    });
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
          notification("green", "Login Successfully!!!");
          localStorage.setItem("currentUser", data.publicKey);
          localStorage.setItem("isLoggedIn", "true");
          window.location.href = "index.html";
        } else {
          notification("red", "Incorrect Password");
        }
      }
    })
    .on("end", () => {
      notification("red", "User not found!!!");
    });
}

// Show User Data After Login in index.html
if (window.location.pathname.includes("index.html")) {
  const currentUserKey = localStorage.getItem("currentUser");
  if (!currentUserKey) {
    alert("User not logged in. Redirecting to login.");
    window.location.href = "account.html";
  }

  userCore.createReadStream().on("data", (data) => {
    if (data.publicKey === currentUserKey) {
      document.body.innerHTML += `
        <div class="user-info">
          <h1>Welcome, ${data.username}!</h1>
          <p>Your public key: ${data.publicKey}</p>
        </div>
      `;
    }
  });
}

// Utility Functions
function notification(color, message) {
  const notification = document.createElement("div");
  notification.className = `notification ${color}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function logout() {
  localStorage.removeItem("currentUser");
  localStorage.setItem("isLoggedIn", "false");
  window.location.href = "account.html";
}
