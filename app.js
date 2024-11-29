import Hyperswarm from "hyperswarm";
import crypto from "hypercore-crypto";
import b4a from "b4a";
import Hypercore from "hypercore";
import bcrypt from "bcryptjs";

import fs from "fs";
import path from "path";

const swarm = new Hyperswarm();
const userCore = new Hypercore("./usercore", { valueEncoding: "json" });

const roomsDir = "./user-rooms";

// Ensure the rooms directory exists
if (!fs.existsSync(roomsDir)) {
  fs.mkdirSync(roomsDir);
}

// Save a new room key for a user with a timestamp
async function saveRoomKey(publicKey, roomKey, isCreated) {
  const userFile = path.join(roomsDir, `${publicKey}.json`);
  let userRooms = [];

  // Read existing user room data
  if (fs.existsSync(userFile)) {
    const data = fs.readFileSync(userFile, "utf8");
    userRooms = JSON.parse(data);
  }

  // Check if the room key already exists
  const keyExists = userRooms.some(
    (room) =>
      typeof room === "object" &&
      room.key === (isCreated ? `create-${roomKey}` : `join-${roomKey}`)
  );

  if (!keyExists) {
    const roomData = {
      key: isCreated ? `create-${roomKey}` : `join-${roomKey}`,
      timestamp: new Date().toISOString(), // Add timestamp for both types
    };

    userRooms.push(roomData);

    // Write the updated data back to the file
    fs.writeFileSync(userFile, JSON.stringify(userRooms, null, 2), "utf8");
    console.log(`Room key saved for user ${publicKey}:`, roomData);
  } else {
    console.log(`Room key already exists for user ${publicKey}`);
  }
}

// Retrieve all room keys with timestamps for a user
async function getUserRoomKeys(publicKey) {
  const userFile = path.join(roomsDir, `${publicKey}.json`);

  if (fs.existsSync(userFile)) {
    const data = fs.readFileSync(userFile, "utf8");
    return JSON.parse(data); // Returns the array of room objects
  }

  return [];
}

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

  if (username === "" || password === "" || password !== confirmPassword) {
    notification("red", "Invalid signup details!");
    return;
  }

  let usernameExists = false;
  await new Promise((resolve, reject) => {
    userCore
      .createReadStream()
      .on("data", (data) => {
        if (data.username === username) {
          usernameExists = true;
        }
      })
      .on("end", resolve);
  });

  if (usernameExists) {
    notification("red", "Username already exists");
    return;
  }

  const keyPair = crypto.keyPair();
  const publicKey = keyPair.publicKey.toString("hex");
  const hashedPass = bcrypt.hashSync(password, 10);
  getUserRoomKeys();

  const userDoc = {
    type: "user",
    username,
    publicKey,
    password: hashedPass,
    timeStamp: Date.now(),
  };
  console.log(userDoc);

  localStorage.setItem("currentUser", publicKey);
  localStorage.setItem("isLoggedIn", "true");

  userCore.append(userDoc, (err) => {
    if (err) {
      console.error("Failed to save user:", err);
      notification("red", "User creation failed due to file lock");
    } else {
      console.log("User signed up successfully:", userDoc);
    }

    userCore.close((err) => {
      if (err) {
        console.error("Error closing Hypercore:", err);
      } else {
        console.log("Hypercore closed successfully after signup.");
      }
    });
  });

  window.location.href = "index.html";
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

if (window.location.pathname.includes("index.html")) {
  const currentUserKey = localStorage.getItem("currentUser");
  if (!currentUserKey) {
    alert("User not logged in. Redirecting to login.");
    window.location.href = "account.html";
  }

  userCore.createReadStream().on("data", (data) => {
    if (data.publicKey === currentUserKey) {
      document.querySelector(".top--div").innerHTML += `
        <div class="user-info">
          <h1>Welcome, ${data.username}!</h1>
          <p>Your public key: ${data.publicKey}</p>
        </div>
      `;
    }
  });
}

document.querySelector("#joinRoomKey").addEventListener("submit", joinRoom);
document.querySelector("#joinRoomKeyBtn").addEventListener("click", joinRoom);
document
  .querySelector("#createRoomKeyBtn")
  .addEventListener("click", createRoom);

async function createRoom() {
  const topicBuffer = crypto.randomBytes(32);
  const roomKey = b4a.toString(topicBuffer, "hex");

  const currentUserKey = localStorage.getItem("currentUser");
  if (!currentUserKey) {
    console.error("User not logged in. Cannot create a room.");
    return;
  }

  // Save the room key to the user's file
  await saveRoomKey(currentUserKey, roomKey, true);

  joinSwarm(topicBuffer);
}

// Join a room
async function joinRoom(e) {
  e.preventDefault();

  const roomKey = document.querySelector("#joinRoomKey").value;
  const topicBuffer = b4a.from(roomKey, "hex");

  const currentUserKey = localStorage.getItem("currentUser");
  if (!currentUserKey) {
    console.error("User not logged in. Cannot join a room.");
    return;
  }

  await saveRoomKey(currentUserKey, roomKey, false);

  // Join the swarm with the room key
  joinSwarm(topicBuffer);
}

async function joinSwarm(topicBuffer) {
  document.querySelector(".middle--div").classList.add("hidden");
  document.querySelector(".loading").classList.remove("hidden");

  const discovery = swarm.join(topicBuffer, { client: true, server: true });
  await discovery.flushed();

  const topic = b4a.toString(topicBuffer, "hex");
  document.querySelector(".roomKey").innerText = topic;

  document.querySelector(".loading").classList.add("hidden");
  document.querySelector(".clip--div").classList.remove("hidden");
}

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

async function displayUserHistory() {
  const currentUserKey = localStorage.getItem("currentUser");
  if (!currentUserKey) {
    console.error("User not logged in. Cannot display user history.");
    return;
  }

  const userFile = path.join(roomsDir, `${currentUserKey}.json`);
  if (!fs.existsSync(userFile)) {
    console.log("No rooms found for user:", currentUserKey);
    return;
  }

  const roomKeys = JSON.parse(fs.readFileSync(userFile, "utf8"));

  const createdRoomsList = document.querySelector(".createdRooms");
  const joinedRoomsList = document.querySelector(".joinedRooms");

  // Clear existing lists
  createdRoomsList.innerHTML = "";
  joinedRoomsList.innerHTML = "";

  // Populate the lists
  roomKeys.forEach((room) => {
    const span = document.createElement("span");
    const li = document.createElement("li");
    const p = document.createElement("p");
    const timeOfKey = document.createElement("p");
    timeOfKey.className = "timestamp";
    const detailBtn = document.createElement("button");
    detailBtn.textContent = "Detail";
    detailBtn.className = "detailBtn";

    const cleanKey = room.key.replace(/^create-/, "").replace(/^join-/, "");

    // Show the key and its timestamp
    p.textContent = `${cleanKey}`;
    p.classList.add("li-key");

    console.log(room.timestamp);

    timeOfKey.textContent = `${formatTimestampWithCSS(room.timestamp)}`;

    detailBtn.dataset.details = JSON.stringify(room);

    if (room.key.startsWith("create-")) {
      span.appendChild(p);
      span.appendChild(timeOfKey);
      li.appendChild(span);
      li.appendChild(detailBtn);
      createdRoomsList.appendChild(li);
    } else if (room.key.startsWith("join-")) {
      span.appendChild(p);
      span.appendChild(timeOfKey);
      li.appendChild(span);
      li.appendChild(detailBtn);
      joinedRoomsList.appendChild(li);
    }
  });

  attachDetailListeners();
}

// Call this function on page load
if (window.location.pathname.includes("index.html")) {
  displayUserHistory();
}

// Each Key PopUp from Create or Join History per User
function showPopUpPerKey(details) {
  const popUp = document.querySelector(".eachKeyDetailBox");

  const key = details.key.replace(/^create-/, "").replace(/^join-/, "");

  popUp.innerHTML = `
        <span style="display: flex; align-items: center; gap: 15px;">
          <p class="eachKeyDetailBoxKey">${key}</p>
          <button type="button" class="copyBtn">Copy</button>
        </span>
        <span style="display: flex; align-items: center; gap: 5px;">
          <p>Time:</p>
          <p class="keyTime">${details.timestamp}</p>
        </span>
        `;

  popUp.classList.remove("hidden");
}

function hidePopupPerKey() {
  const popUp = document.querySelector(".eachKeyDetailBox");
  popUp.classList.add("hidden");
}

document
  .getElementById("eachKeyDetailBoxCloseBtn")
  .addEventListener("click", hidePopupPerKey);

function attachDetailListeners() {
  const detailBtns = document.querySelectorAll(".detailBtn");
  detailBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const roomDetails = JSON.parse(e.target.dataset.details);
      showPopUpPerKey(roomDetails);
    });
  });
}

// Convert the time
function formatTimestampWithCSS(timestamp) {
  const date = new Date(timestamp);
  const options = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };
  const formattedDate = date.toLocaleString("en-US", options);
  return formattedDate;
}
