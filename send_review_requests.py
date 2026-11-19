#!/usr/bin/env python3
"""
Omni Bus Review Request Automation
Tailored for EzeeInfo / Ezeebits charts & Omni bus operators (e.g. SpyderZ Link)

Features:
- Auto-extracts from Ezeeinfo PDF, CSV, Excel, or Text charts.
- Auto-groups multi-seat bookings under the same mobile number.
- Distinguishes redBus vs Direct bookings with tailored English & Tamil messages.
- Cooldown protection: remembers sent numbers to prevent spamming frequent travelers.
- 3 Execution Modes:
    1. Interactive Browser Mode (opens WhatsApp Web one by one on Enter)
    2. Cloud / Webhook API Mode (fully hands-free sending with rate limiting)
    3. Dry-run Preview & CSV Export Mode
"""

import sys
import os
import re
import json
import time
import argparse
import subprocess
import urllib.parse
from datetime import datetime, timedelta

DEFAULT_BUS_NAME = "SpyderZ Link"
DEFAULT_ROUTE = "Udumalpet ↔ Chennai"
DEFAULT_GOOGLE_LINK = "https://g.page/r/your-bus-service/review"
HISTORY_FILE = os.path.expanduser("~/.gemini/antigravity/scratch/omni-bus-review-sender/sent_history.json")

# Default Templates
TEMPLATES = {
    "redbus": {
        "en": "Hi {name}, thank you for travelling with {bus} ({route}) yesterday! redBus will send you a message on WhatsApp to rate your trip. If you enjoyed your journey, please take a moment to give us a 5-star rating on redBus. As a new service, your rating helps us tremendously. Thank you!",
        "ta": "வணக்கம் {name}, நேற்று {bus}-ல் ({route}) பயணம் செய்தமைக்கு மிக்க நன்றி! உங்கள் பயணத்தை rate செய்ய redBus WhatsApp-ல் செய்தி அனுப்பும். பயணம் பிடித்திருந்தால் redBus-ல் எங்களுக்கு 5-star rating கொடுங்கள். புதிய சேவையான எங்களுக்கு உங்கள் ஆதரவு மிகவும் உதவும். நன்றி!"
    },
    "direct": {
        "en": "Hi {name}, thank you for travelling with {bus} ({route}) yesterday! How was your trip? If you enjoyed your journey, a quick 5-star Google review would really help our service: {link} - Thank you!",
        "ta": "வணக்கம் {name}, நேற்று {bus}-ல் ({route}) பயணம் செய்தமைக்கு மிக்க நன்றி! உங்கள் பயண அனுபவம் எப்படி இருந்தது? ஒரு நிமிடம் ஒதுக்கி எங்களுக்கு ஒரு Google review கொடுத்தால் மிகவும் உதவியாக இருக்கும்: {link}"
    }
}


def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_history(history):
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"[Warning] Could not save history: {e}")


def normalize_mobile(raw):
    d = re.sub(r"\D", "", str(raw))
    if len(d) == 10 and d[0] in "6789":
        return "91" + d
    if len(d) == 11 and d.startswith("0") and d[1] in "6789":
        return "91" + d[1:]
    if len(d) == 12 and d.startswith("91") and d[2] in "6789":
        return d
    return None


def parse_ezeeinfo_pdf(pdf_path):
    """Parse Ezeeinfo PDF using pdftotext -layout"""
    try:
        text = subprocess.check_output(["pdftotext", "-layout", pdf_path, "-"]).decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"[Error] Failed to read PDF via pdftotext: {e}")
        return [], "", ""

    # Route and Date
    route_m = re.search(r"Schedule Name\s*:\s*([^\n]+)", text)
    if route_m:
        raw_route = route_m.group(1).strip()
        route = re.split(r"\s{2,}|Trip Id", raw_route)[0].strip()
    else:
        route = DEFAULT_ROUTE

    date_m = re.search(r"Travel Date\s*:\s*([^\n]+)", text)
    travel_date = date_m.group(1).strip() if date_m else (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    driver_nums = set(re.findall(r"Driver\d*\s*Mobile\s*:\s*([0-9]{10})", text))

    passengers = {}
    for line in text.split("\n"):
        m = re.search(r"\b([6-9]\d{9})\b", line)
        if not m:
            continue
        num_raw = m.group(1)
        if num_raw in driver_nums:
            continue

        num = normalize_mobile(num_raw)
        if not num:
            continue

        # Extract seat at beginning of row
        sm = re.search(r"^\s*([LU]\d{1,2}[A-Za-z]?|\d{1,2}[A-Za-z]?)\b", line)
        seat = sm.group(1) if sm else ""

        # Extract passenger name
        nm = re.search(r"([A-Za-z\s.\'\-]+?)\s+\d{1,2}\s+[MF]\s+" + num_raw, line)
        if not nm:
            nm = re.search(r"([A-Za-z\s.\'\-]+?)\s+[MF]\s+" + num_raw, line)
        name = nm.group(1).strip() if nm else ""
        if name:
            name = re.sub(r"^[A-Z0-9]+\s+", "", name)  # PNR prefix
            name = re.sub(r"^\d{4}-\d{2}-\d{2}\s+", "", name)
            name = name.strip()

        # Clean name
        name = re.sub(r"[^A-Za-z\s.\']", " ", name)
        name = re.sub(r"\s+", " ", name).strip()
        if not name or len(name) < 2 or name.lower() in ["mr", "ms", "mrs", "dr", "type", "point", "passenger"]:
            name = "Passenger"

        src = "redbus" if "redbus" in line.lower() else "direct"

        if num in passengers:
            if seat and seat not in passengers[num]["seats"]:
                passengers[num]["seats"].append(seat)
            if name != "Passenger" and (passengers[num]["name"] == "Passenger" or len(name) > len(passengers[num]["name"])):
                passengers[num]["name"] = name
        else:
            passengers[num] = {
                "num": num,
                "name": name.title() if name != "Passenger" else "Sir/Madam",
                "seats": [seat] if seat else [],
                "src": src,
                "route": route,
                "date": travel_date
            }

    return list(passengers.values()), route, travel_date


def parse_csv_or_text(file_path):
    """Parse CSV, TSV, or plain text trip chart."""
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    passengers = {}
    lines = content.splitlines()
    route = DEFAULT_ROUTE
    travel_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue
        if re.match(r"^(s\.?no|seat|name|mobile|phone|pnr)\b", line_clean, re.I):
            continue

        num_m = re.search(r"\b((?:\+?91[\s-]*)?0?[6-9]\d{4}[\s-]?\d{5})\b", line_clean)
        if not num_m:
            continue

        num = normalize_mobile(num_m.group(1))
        if not num:
            continue

        # Detect source
        src = "redbus" if re.search(r"red\s?bus", line_clean, re.I) else "direct"

        # Detect Seat
        sm = re.search(r"\b([LU]\d{1,2}[A-Za-z]?|\d{1,2}[A-Za-z]?)\b", line_clean)
        seat = sm.group(1) if sm else ""

        # Detect Name
        parts = [p.strip() for p in re.split(r"[\t,|;]+", line_clean) if p.strip()]
        name = ""
        for p in parts:
            if re.search(r"\d", p):
                continue
            if len(re.findall(r"[A-Za-z]", p)) >= 3:
                clean_p = re.sub(r"[^A-Za-z\s.\']", "", p).strip()
                if clean_p.lower() not in ["redbus", "direct", "counter", "sleeper", "ac", "non-ac"]:
                    name = clean_p
                    break

        if not name:
            name = "Sir/Madam"
        else:
            name = name.title()

        if num in passengers:
            if seat and seat not in passengers[num]["seats"]:
                passengers[num]["seats"].append(seat)
            if name != "Sir/Madam" and passengers[num]["name"] == "Sir/Madam":
                passengers[num]["name"] = name
        else:
            passengers[num] = {
                "num": num,
                "name": name,
                "seats": [seat] if seat else [],
                "src": src,
                "route": route,
                "date": travel_date
            }

    return list(passengers.values()), route, travel_date


def format_message(passenger, lang="ta", bus_name=DEFAULT_BUS_NAME, route=DEFAULT_ROUTE, google_link=DEFAULT_GOOGLE_LINK):
    src = passenger["src"]
    tpl = TEMPLATES.get(src, TEMPLATES["direct"]).get(lang, TEMPLATES[src]["en"])
    seat_str = ", ".join(passenger.get("seats", []))
    msg = tpl.format(
        name=passenger["name"],
        bus=bus_name,
        route=passenger.get("route") or route,
        date=passenger.get("date") or "yesterday",
        seat=seat_str,
        link=google_link
    )
    return msg


def main():
    parser = argparse.ArgumentParser(description="Omni Bus Review Request Automation")
    parser.add_argument("file", nargs="?", help="Path to Ezeeinfo chart PDF, CSV, or Text file (optional; auto-finds latest)")
    parser.add_argument("--lang", choices=["ta", "en"], default="ta", help="Message language: ta (Tamil) or en (English)")
    parser.add_argument("--bus", default=DEFAULT_BUS_NAME, help="Bus operator name (default: SpyderZ Link)")
    parser.add_argument("--route", default=DEFAULT_ROUTE, help="Route name (default: Udumalpet ↔ Chennai)")
    parser.add_argument("--link", default=DEFAULT_GOOGLE_LINK, help="Google review link for direct bookings")
    parser.add_argument("--mode", choices=["interactive", "api", "preview"], default="preview",
                        help="Execution mode: 'preview' (dry-run & inspect), 'interactive' (opens WhatsApp Web on Enter), 'api' (webhook)")
    parser.add_argument("--export", help="Path to export passengers and messages as CSV")
    parser.add_argument("--cooldown-days", type=int, default=7, help="Skip passengers messaged in last N days")
    parser.add_argument("--api-url", help="Webhook / Cloud API endpoint for automated mode")
    parser.add_argument("--api-token", help="Bearer token for automated API")

    args = parser.parse_args()

    # Find file if not provided
    input_file = args.file
    if not input_file:
        downloads_dir = os.path.expanduser("~/Downloads")
        candidates = []
        if os.path.exists(downloads_dir):
            for f in os.listdir(downloads_dir):
                if ("trip" in f.lower() or "chart" in f.lower() or "boarding" in f.lower()) and (f.endswith(".pdf") or f.endswith(".csv") or f.endswith(".txt")):
                    full = os.path.join(downloads_dir, f)
                    candidates.append((os.path.getmtime(full), full))
        if candidates:
            candidates.sort(reverse=True)
            input_file = candidates[0][1]
            print(f"[*] Auto-detected latest trip chart: {os.path.basename(input_file)}")
        else:
            print("[Error] No file provided and no chart found in ~/Downloads. Please provide a chart file.")
            sys.exit(1)

    print(f"[*] Processing: {input_file}")
    if input_file.lower().endswith(".pdf"):
        passengers, detected_route, detected_date = parse_ezeeinfo_pdf(input_file)
    else:
        passengers, detected_route, detected_date = parse_csv_or_text(input_file)

    route = detected_route or args.route
    travel_date = detected_date or (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    if not passengers:
        print("[!] No passengers found in chart. Check format.")
        sys.exit(1)

    history = load_history()
    now_ts = datetime.now()

    print("\n" + "=" * 65)
    print(f" BUS SERVICE : {args.bus}")
    print(f" ROUTE       : {route}")
    print(f" TRIP DATE   : {travel_date}")
    print(f" TOTAL PASSENGERS : {len(passengers)}")
    print(f" LANGUAGE    : {'தமிழ் (Tamil)' if args.lang == 'ta' else 'English'}")
    print("=" * 65 + "\n")

    valid_queue = []
    skipped_count = 0

    for idx, p in enumerate(passengers, 1):
        num = p["num"]
        # Check cooldown
        last_sent = history.get(num, {}).get("sent_at")
        is_cooldown = False
        if last_sent:
            try:
                sent_dt = datetime.fromisoformat(last_sent)
                if (now_ts - sent_dt).days < args.cooldown_days:
                    is_cooldown = True
            except Exception:
                pass

        msg = format_message(p, lang=args.lang, bus_name=args.bus, route=route, google_link=args.link)
        p["message"] = msg
        p["seats_str"] = ", ".join(p["seats"]) if p["seats"] else "N/A"

        tag = "[redBus]" if p["src"] == "redbus" else "[Direct]"
        if is_cooldown:
            skipped_count += 1
            print(f"[{idx:02d}] {tag:<8} {p['name']:<18} ({num}) | Seats: {p['seats_str']:<6} -> [SKIPPED: Messaged {sent_dt.strftime('%b %d')}]")
        else:
            valid_queue.append(p)
            print(f"[{idx:02d}] {tag:<8} {p['name']:<18} ({num}) | Seats: {p['seats_str']:<6} -> Ready")

    print(f"\n[*] Summary: {len(valid_queue)} ready to send, {skipped_count} skipped under {args.cooldown_days}-day cooldown.")

    # Export CSV if requested
    if args.export:
        import csv
        with open(args.export, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Name", "Mobile", "Seats", "Source", "Route", "Date", "Message"])
            for p in passengers:
                writer.writerow([p["name"], p["num"], p["seats_str"], p["src"], route, travel_date, p["message"]])
        print(f"[✓] Exported report to: {args.export}")

    # Mode 1: Preview Only
    if args.mode == "preview":
        print("\n--- SAMPLE MESSAGE PREVIEW ---")
        if valid_queue:
            sample = valid_queue[0]
            print(f"Recipient : {sample['name']} (+{sample['num']}) - {sample['src'].upper()}")
            print(f"Message   :\n{sample['message']}")
            wa_link = f"https://wa.me/{sample['num']}?text={urllib.parse.quote(sample['message'])}"
            print(f"WhatsApp Link:\n{wa_link}")
        print("\n[Tip] Run with `--mode interactive` to open WhatsApp Web one-by-one, or open the upgraded HTML file.")
        return

    # Mode 2: Interactive Browser
    if args.mode == "interactive":
        import webbrowser
        print("\n[*] Starting Interactive WhatsApp Sender.")
        print("[*] Make sure WhatsApp Web is open in your browser.")
        print("[*] Press ENTER to send next, 's' to skip, or 'q' to quit.\n")

        for i, p in enumerate(valid_queue, 1):
            wa_url = f"https://web.whatsapp.com/send?phone={p['num']}&text={urllib.parse.quote(p['message'])}"
            user_input = input(f"({i}/{len(valid_queue)}) Send to {p['name']} ({p['num']})? [Enter=Yes / s=Skip / q=Quit]: ").strip().lower()
            if user_input == "q":
                print("[*] Stopped by user.")
                break
            if user_input == "s":
                print(f"[-] Skipped {p['name']}.")
                continue

            webbrowser.open(wa_url)
            history[p["num"]] = {
                "name": p["name"],
                "sent_at": datetime.now().isoformat(),
                "route": route,
                "src": p["src"]
            }
            save_history(history)
            print(f"[✓] Opened WhatsApp for {p['name']}. Please click Send in WhatsApp.")
            time.sleep(1.5)

        print("[✓] Finished sending session.")

    # Mode 3: Cloud API / Webhook
    if args.mode == "api":
        if not args.api_url:
            print("[Error] --api-url is required for API mode.")
            sys.exit(1)

        import requests
        headers = {"Content-Type": "application/json"}
        if args.api_token:
            headers["Authorization"] = f"Bearer {args.api_token}"

        print(f"[*] Sending {len(valid_queue)} messages via API...")
        for i, p in enumerate(valid_queue, 1):
            payload = {
                "to": p["num"],
                "message": p["message"],
                "name": p["name"],
                "source": p["src"]
            }
            try:
                resp = requests.post(args.api_url, json=payload, headers=headers, timeout=10)
                if resp.status_code in [200, 201]:
                    print(f"[{i}/{len(valid_queue)}] [✓] Sent to {p['name']} ({p['num']})")
                    history[p["num"]] = {
                        "name": p["name"],
                        "sent_at": datetime.now().isoformat(),
                        "route": route,
                        "src": p["src"]
                    }
                    save_history(history)
                else:
                    print(f"[{i}/{len(valid_queue)}] [✗] Failed for {p['name']}: {resp.status_code} {resp.text[:80]}")
            except Exception as e:
                print(f"[{i}/{len(valid_queue)}] [✗] Error for {p['name']}: {e}")

            time.sleep(5)  # 5-second rate limiting to prevent spam flagging


if __name__ == "__main__":
    main()
