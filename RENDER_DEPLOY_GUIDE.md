# Deploying SpyderZ Link & Le Royal Suite Separately on Render.com (100% Free)

Both applications are completely independent and designed to be hosted separately with their own live URLs and dedicated WhatsApp sessions:

| Service | Recommended Name | Root Directory | WhatsApp Connection |
| :--- | :--- | :--- | :--- |
| **🚌 Omni Bus Service** | `spyderzlink-reviews` | `Spyderzlink` | Connects to Bus Office WhatsApp Phone |
| **🏨 Luxury Hotel Stay** | `leroyalsuite-reviews` | `Le Royal Suite` | Connects to Hotel Reception WhatsApp Phone |

---

## Step 1: Push Your Project to GitHub

If you haven't pushed your code to GitHub yet:
1. Create a repository on your GitHub account (e.g. `ratings-and-reviews`).
2. Run these commands from your local project root:
   ```bash
   cd "/home/shageenfathima/Aakash/Ratings & Review"
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/ratings-and-reviews.git
   git push -u origin main
   ```

*(Note: Both folders are inside this repository. Render lets you deploy each folder as a separate web service using the **Root Directory** setting).*

---

## Step 2: Deploy Service 1 — SpyderZ Link (Bus Service)

1. Log in to **[render.com](https://render.com)**.
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository (`ratings-and-reviews`).
4. Fill in the deployment settings:
   - **Name:** `spyderzlink-reviews`
   - **Region:** `Singapore` (Fastest for India)
   - **Branch:** `main`
   - **Root Directory:** `Spyderzlink` *(⚠️ Important: specifies the bus folder)*
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
5. Click **Deploy Web Service**.

Render will deploy it to a URL like:
👉 `https://spyderzlink-reviews.onrender.com`

---

## Step 3: Deploy Service 2 — Le Royal Suite (Hotel Stay)

1. In Render dashboard, click **New +** → **Web Service** again.
2. Select the same GitHub repository (`ratings-and-reviews`).
3. Fill in the deployment settings:
   - **Name:** `leroyalsuite-reviews`
   - **Region:** `Singapore`
   - **Branch:** `main`
   - **Root Directory:** `Le Royal Suite` *(⚠️ Important: specifies the hotel folder)*
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
4. Click **Deploy Web Service**.

Render will deploy it to a URL like:
👉 `https://leroyalsuite-reviews.onrender.com`

---

## Step 4: Office Staff Usage

Now each business unit has its own private link:
- **Bus Office Staff**: Opens `https://spyderzlink-reviews.onrender.com`
  - Scans QR with the **Bus office WhatsApp phone**.
  - Uploads the daily EzeeInfo passenger chart.
  - Clicks **Send to All**.
- **Hotel Front Desk**: Opens `https://leroyalsuite-reviews.onrender.com`
  - Scans QR with the **Hotel reception WhatsApp phone**.
  - Uploads checkout guests.
  - Clicks **Send to All**.

Both operate 100% independently with zero interference!
