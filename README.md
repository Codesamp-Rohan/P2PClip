# P2P Clipboard App

A simple peer-to-peer clipboard sharing app built using Holepunch, Hypercore, and Hyperswarm. This application allows users to securely share clipboard content between devices without relying on centralized servers.

## Features

- **Peer-to-Peer Clipboard Sync**: Share your clipboard content directly with others over a decentralized network.
- **Offline Support**: Works without an internet connection using Hyperswarm's peer-to-peer networking.
- **Secure Communication**: Encryption and decentralized file-sharing technology ensure privacy and security.

## Installation

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (Version 14.x or higher)
- [npm](https://npmjs.com/)

### Steps

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Codesamp-Rohan/P2PClip.git
   cd p2pclip
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start the application**:

   ```bash
   npm start
   ```

   The app will now run on your local machine and start sharing clipboard content with nearby peers.

## Usage

- After starting the app, the clipboard content will automatically sync with peers in the same network.
- You can copy any text to your clipboard, and it will be shared with connected peers.
- If another peer copies text, it will appear in your clipboard.

## Development

### Running Locally

To run the app locally, follow the steps above for installation and use `npm run dev` for the development environment. This will automatically watch for file changes and reload the application.

### Testing

Run the following command to run unit tests:

```bash
npm test
```
