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

const __dirname = "./roomKey-msg";

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

function createRoomFolder(roomKey) {
  const roomDir = path.join(__dirname, `user-rooms-${roomKey}`);

  // Check if the folder already exists
  if (!fs.existsSync(roomDir)) {
    fs.mkdirSync(roomDir, { recursive: true });
  }

  // Create a file for messages
  const messagesFile = path.join(roomDir, "messages.json");
  if (!fs.existsSync(messagesFile)) {
    fs.writeFileSync(messagesFile, JSON.stringify([])); // Initialize an empty array for messages
  }

  // Create an oplog file (optional for operation logs)
  const oplogFile = path.join(roomDir, "oplog.json");
  if (!fs.existsSync(oplogFile)) {
    fs.writeFileSync(oplogFile, JSON.stringify([])); // Initialize an empty log
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

  createRoomFolder(roomKey);

  joinSwarm(topicBuffer);

  // Initialize an empty messages array when a new room is created
  const messagesFilePath = path.join(
    __dirname,
    `user-rooms-${roomKey}`,
    "messages.json"
  );
  fs.writeFileSync(messagesFilePath, JSON.stringify([]), "utf8"); // Initialize the message file
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

async function loadMessages(roomKey) {
  const roomDir = path.join(__dirname, `user-rooms-${roomKey}`);
  const messagesFile = path.join(roomDir, "messages.json");

  if (!fs.existsSync(messagesFile)) {
    console.log("No messages found in this room.");
    return;
  }

  const messages = JSON.parse(fs.readFileSync(messagesFile, "utf8"));
  const messageList = document.querySelector(".messagesList");

  // Clear the current message list before reloading
  messageList.innerHTML = "";

  // Display all the messages
  messages.forEach((message) => {
    const messageElement = document.createElement("li");
    const messageText = document.createElement("span");
    messageText.textContent = `${message.username}: ${message.content}`;

    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy";
    copyButton.classList.add("copyButton");

    // Add event listener to the copy button
    copyButton.addEventListener("click", () => {
      copyToClipboard(`${message.content}`);
    });

    // Append message text and copy button to the message element
    messageElement.appendChild(messageText);
    messageElement.appendChild(copyButton);
    messageList.appendChild(messageElement);
  });
}

// Function to copy the text to the clipboard
function copyToClipboard(text) {
  const tempTextArea = document.createElement("textarea");
  tempTextArea.value = text;
  document.body.appendChild(tempTextArea);
  tempTextArea.select();
  document.execCommand("copy");
  document.body.removeChild(tempTextArea);

  notification("green", "Message copied to clipboard!");
}

async function joinSwarm(topicBuffer) {
  document.querySelector(".middle--div").classList.add("hidden");
  document.querySelector(".loading").classList.remove("hidden");

  const discovery = swarm.join(topicBuffer, { client: true, server: true });
  await discovery.flushed();

  const topic = b4a.toString(topicBuffer, "hex");
  document.querySelector(".roomKey").innerText = topic;

  await loadMessages(topic);

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
        <span style="display: flex; align-items: center; gap: 5px;font-size: 11px;
                     color: #bbb;">
          <p>Time:</p>
          <p class="keyTime">${formatTimestampWithCSS(details.timestamp)}</p>
        </span>
        `;

  popUp.classList.remove("hidden");

  const copyBtn = popUp.querySelector(".copyBtn");
  copyBtn.addEventListener("click", () => {
    const keyText = popUp.querySelector(".eachKeyDetailBoxKey").textContent;

    navigator.clipboard
      .writeText(keyText)
      .then(() => {
        alert(`Copied: ${keyText}`);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  });
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
      document.querySelector(".backShadow").classList.remove("hidden");
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

// Function to store the message
async function storeMessage(roomKey, username, messageContent) {
  const roomDir = path.join(__dirname, `user-rooms-${roomKey}`);
  const messagesFile = path.join(roomDir, "messages.json");

  // Read the current messages
  let messages = [];
  if (fs.existsSync(messagesFile)) {
    const data = fs.readFileSync(messagesFile, "utf8");
    messages = JSON.parse(data);
  }

  // Prepare the new message object
  const newMessage = {
    username: username,
    content: messageContent,
    timestamp: new Date().toISOString(),
  };

  // Append the new message to the messages array
  messages.push(newMessage);

  // Save the updated messages array back to the file
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), "utf8");
  console.log("Message stored:", newMessage);
}

// Function to read all the messages
function getMessages(roomKey) {
  const roomDir = path.join(__dirname, `user-rooms-${roomKey}`);
  const messagesFile = path.join(roomDir, "messages.json");

  // Read and return the messages
  const messages = JSON.parse(fs.readFileSync(messagesFile));
  return messages;
}

document
  .querySelector("#sendMessageBtn")
  .addEventListener("click", sendMessage);

async function sendMessage() {
  const messageContent = document.querySelector("#messageInput").value;
  const roomKey = document.querySelector(".roomKey").innerText;
  const username = localStorage.getItem("currentUser");

  if (!messageContent.trim()) {
    console.log("Message cannot be empty.");
    return;
  }

  if (!roomKey) {
    console.error("No room selected.");
    return;
  }

  // Store the message in the current room
  await storeMessage(roomKey, username, messageContent);

  // Update the UI to show the new message (you may want to append this to a message list)
  const messageList = document.querySelector(".messagesList");
  const newMessageElement = document.createElement("li");
  // Create message text
  const messageText = document.createElement("span");
  messageText.textContent = `${username}: ${messageContent}`;

  // Create the copy button
  const copyButton = document.createElement("button");
  copyButton.textContent = "Copy";
  copyButton.classList.add("copyButton");

  // Add event listener to copy button
  copyButton.addEventListener("click", () => {
    copyToClipboard(`${messageContent}`);
  });

  // Append the message text and copy button to the message element
  newMessageElement.appendChild(messageText);
  newMessageElement.appendChild(copyButton);
  messageList.appendChild(newMessageElement);

  // Optionally, scroll to the bottom of the message list
  messageList.scrollTop = messageList.scrollHeight;

  // Clear the message input field
  const messageInput = document.querySelector("#messageInput");
  messageInput.value = "";

  // Notify user that the message has been sent
  notification("green", "Message sent!");
}

// Function to display a message with a copy button
function displayMessage(message) {
  // Create a list item for the message
  const messageItem = document.createElement("li");
  messageItem.classList.add("message-item");

  // Create the text element for the message content
  const messageText = document.createElement("span");
  messageText.classList.add("message-text");
  messageText.textContent = `${message.username}: ${message.content}`;

  // Create the copy button
  const copyButton = document.createElement("button");
  copyButton.textContent = "Copy";
  copyButton.classList.add("copy-btn");

  // Add event listener to the copy button
  copyButton.addEventListener("click", () => {
    copyMessageToClipboard(message.content);
  });

  // Append the message text and copy button to the list item
  messageItem.appendChild(messageText);
  messageItem.appendChild(copyButton);

  // Append the message item to the message list
  document.getElementById("messageList").appendChild(messageItem);
}

// Function to copy the message content to the clipboard
function copyMessageToClipboard(content) {
  // Create a temporary text area to hold the message content
  const textArea = document.createElement("textarea");
  textArea.value = content;

  // Append the text area to the body (it's hidden by default)
  document.body.appendChild(textArea);

  // Select the text in the textarea
  textArea.select();
  textArea.setSelectionRange(0, 99999); // For mobile devices

  // Execute the copy command
  document.execCommand("copy");

  // Remove the temporary textarea from the DOM
  document.body.removeChild(textArea);

  // Provide feedback (optional)
  alert("Message copied to clipboard!");
}
