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

// Save a new room key for a user
async function saveRoomKey(publicKey, roomKey, isCreated) {
  let userFile = path.join(roomsDir, `${publicKey}.json`);

  let userRooms = [];
  if (fs.existsSync(userFile)) {
    const data = fs.readFileSync(userFile, "utf8");
    userRooms = JSON.parse(data);
  }

  if (!userRooms.includes(roomKey)) {
    if (isCreated) {
      userRooms.push(`create-${roomKey}`);
    } else {
      userRooms.push(roomKey);
    }
    fs.writeFileSync(userFile, JSON.stringify(userRooms, null, 2), "utf8");
    console.log(`Room key saved for user ${publicKey}: ${roomKey}`);
  } else {
    console.log(`Room key already exists for user ${publicKey}`);
  }
}

// Retrieve all room keys for a user
async function getUserRoomKeys(publicKey) {
  const userFile = path.join(roomsDir, `${publicKey}.json`);

  if (fs.existsSync(userFile)) {
    const data = fs.readFileSync(userFile, "utf8");
    return JSON.parse(data);
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

  const topicStr = document.querySelector("#joinRoomKey").value;
  const topicBuffer = b4a.from(topicStr, "hex");
  const roomKey = `join-${topicStr}`; // Prefix for joined rooms

  const currentUserKey = localStorage.getItem("currentUser");
  if (!currentUserKey) {
    console.error("User not logged in. Cannot join a room.");
    return;
  }

  // Fetch or create the user's room file
  const userFile = path.join(roomsDir, `${currentUserKey}.json`);

  let userRooms = [];
  if (fs.existsSync(userFile)) {
    const data = fs.readFileSync(userFile, "utf8");
    userRooms = JSON.parse(data);
  }

  // Check if the room key already exists
  if (!userRooms.includes(roomKey)) {
    userRooms.push(roomKey);
    fs.writeFileSync(userFile, JSON.stringify(userRooms, null, 2), "utf8");
    console.log(`Room key added to ${currentUserKey}: ${roomKey}`);
  } else {
    console.log(`Room key already exists for user ${currentUserKey}`);
  }

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
  roomKeys.forEach((key) => {
    const li = document.createElement("li");
    // Remove the "create-" or "join-" prefix from the key
    const cleanKey = key.replace(/^create-/, "").replace(/^join-/, "");

    li.textContent = cleanKey; // Set the cleaned key as the list item text

    if (key.startsWith("create-")) {
      createdRoomsList.appendChild(li);
    } else if (key.startsWith("join-")) {
      joinedRoomsList.appendChild(li);
    }
  });
}

// Call this function on page load
if (window.location.pathname.includes("index.html")) {
  displayUserHistory();
}

// Call displayRoomKeys after login or on the dashboard
if (window.location.pathname.includes("index.html")) {
  displayRoomKeys();
}

// Example function to check if a room is created by the user
function isRoomCreatedByUser(roomKey) {
  // Logic for determining if a room is created or joined
  // Placeholder: Customize this logic based on how you're tagging room keys
  return roomKey.startsWith("create-");
}

// Call the function to display the user history on page load
if (window.location.pathname.includes("index.html")) {
  displayUserHistory();
}
