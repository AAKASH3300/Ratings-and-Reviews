# Omni Bus Review Request Sender (EzeeInfo & redBus)

Tailored for **Omni bus operators** (e.g. *SpyderZ Link* on the *Udumalpet ↔ Chennai* route) to send post-trip review requests the morning after travel.

---

## 🚀 How to Run the React / Vite App

1. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

2. **Or build for production:**
   ```bash
   npm run build
   ```

3. **Or Open directly without Node / npm:**
   You can also double-click [`Review Request Sender.html`](file:///home/shageenfathima/Aakash/Ratings%20&%20Review/Review%20Request%20Sender.html) to open the standalone app in Chrome/Firefox anytime with zero setup.

---

## ⚡ Key Features

- **EzeeInfo Smart Parser:** Automatically detects and parses EzeeInfo / Ezeebits boarding charts (Excel `.xlsx`, `.csv`, `.tsv`, or pasted table rows).
- **Multi-Seat Grouping:** If a family or group booked 2 or 3 seats under the same phone number (e.g., `L13, L14W`), they are merged into one entry so they only get messaged once.
- **Smart Channels:**
  - **redBus Passengers:** Reminds them to rate 5 stars on redBus's post-trip WhatsApp message.
  - **Direct Bookings:** Sends your Google Review link.
- **Tamil & English Templates:** One-click presets and dynamic tag buttons (`{name}`, `{seat}`, `{bus}`, `{route}`, `{date}`, `{link}`).
- **"⚡ Send WhatsApp & Next" Turbo Queue:** Sticky queue banner so you can send and advance in rapid sequence.
- **SMS & Clipboard Fallback:** Instant SMS trigger (`sms:+91...`) and 1-click clipboard copy for each passenger.
- **Anti-Spam / Frequent Commuter Cooldown:** Checks if a phone number received a review request in the last 7 days and displays a badge (`Sent 2 days ago`).
- **Download Report (CSV):** Export daily sent/pending reports for bus accounts.

---

## 🐍 Python Automation Script

To run the background Python automation:
```bash
python3 send_review_requests.py --mode preview
```
Interactive WhatsApp sender:
```bash
python3 send_review_requests.py --mode interactive
```
