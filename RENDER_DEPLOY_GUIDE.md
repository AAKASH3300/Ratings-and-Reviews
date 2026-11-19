# How to Deploy to Render.com (100% Free)

This project is configured and ready for 1-click deployment on [Render.com](https://render.com).

---

## Step 1: Push to GitHub

1. Create a new repository on your GitHub account (e.g. `omni-bus-review-sender`).
2. Run these commands in your terminal:
   ```bash
   cd "/home/shageenfathima/Aakash/Ratings & Review"
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git
   git push -u origin main
   ```

---

## Step 2: Deploy on Render.com

1. Sign up or log in at **[render.com](https://render.com)** (choose "Sign in with GitHub").
2. Click the **"New +"** button in the dashboard and select **"Web Service"**.
3. Select your GitHub repository.
4. Render will automatically detect the settings from `render.yaml`:
   - **Name:** `omni-bus-review-sender` (or any custom name)
   - **Region:** Singapore / Frankfurt / Oregon (any is fine; Singapore is fastest for India)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
5. Click **"Deploy Web Service"**.

---

## Step 3: Access from Anywhere

Render will build the app and give you a live URL:
👉 `https://your-app-name.onrender.com`

- Anyone in your bus office can open this URL on their laptop or phone.
- **Link WhatsApp:** Scan the on-screen QR code with your office phone once.
- **Upload Chart:** Drag & drop `Trip Chart.pdf` or paste chart rows.
- **Send:** Tap **`🚀 Send to All Passengers (1-Click)`** to deliver review reminders automatically in sequence.
