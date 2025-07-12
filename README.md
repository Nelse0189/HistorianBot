# Discord DM Analyzer AI

This project has been transformed into a full-stack web application that allows you to securely analyze your Discord DM history using the power of Google's Gemini AI. It provides a clean, interactive chat interface to ask questions about your conversations.

## Features

- **Web-Based UI:** Modern, responsive interface built with Vite, React, and shadcn/ui.
- **Secure:** Your Discord token is sent directly to your local backend and never stored. All processing happens on your machine and with the Google AI API.
- **Interactive Chat:** Ask follow-up questions about your conversations. The AI maintains context.
- **Conversation Statistics:** Get at-a-glance insights about your chat history.
- **Token Usage Tracking:** See how many tokens each AI query uses.

## How It Works

The application consists of two main parts:

1.  **Backend (Python/FastAPI):** A local server that you run on your machine. It securely uses your Discord User Token to fetch DM history via Discord's API. It then communicates with the Google Gemini API for analysis.
2.  **Frontend (React/Vite):** A web interface that runs in your browser. It provides the UI for entering your token, selecting conversations, and interacting with the AI.

## Setup & Running the Application

### Prerequisites

- Python 3.8+ and `pip`
- Node.js 18+ and `npm`
- A Google Gemini API Key

### 1. Installation

First, install all the required dependencies. From the project's root directory, run:

```bash
npm install
```

This command will:
1. Create a Python virtual environment in a `venv` directory.
2. Install the necessary Python packages into `venv`.
3. Install the Node.js packages for the frontend.

### 2. Set Up Your Environment Variables

The backend needs your Google API key to function.

1.  Navigate to the `backend` directory.
2.  Rename the `env_example.txt` file to `.env`.
3.  Open the `.env` file and paste your Google Gemini API key:

    ```
    GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY_HERE
    ```

### 3. Run the Development Server

Go back to the root directory of the project and run the following command:

```bash
npm run dev
```

This will use `concurrently` to start both the Python backend server (using the Python from the `venv` directory) and the Vite frontend development server at the same time.

Your default web browser should open with the application running. If not, navigate to `http://localhost:5173`.

### 4. How to Find Your Discord Token

To use the application, you need to provide your Discord User Token.

**Warning:** *Never share your Discord token with anyone. This application is designed to run locally, so the token is only shared between your browser and the local backend server, but you should still handle it with extreme care.*

1.  Open Discord in your web browser (e.g., Chrome, Firefox).
2.  Open the Developer Tools (you can press `F12` or `Ctrl+Shift+I`).
3.  Go to the **Network** tab.
4.  Send a message in any channel or DM.
5.  In the Network tab's filter box, type `/messages`.
6.  Click on the request that appears.
7.  In the Headers panel that appears on the right, scroll down to **Request Headers**.
8.  Find the `authorization` header and copy its entire value. This is your token.
9.  Paste this token into the input field in the web application. 