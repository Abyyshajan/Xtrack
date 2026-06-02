"""
Lightweight offline rule-based NLP parser for transaction messages.
Extracts amount, merchant, category, and date.
"""

import datetime as dt
import re
from typing import Optional


def extract_amount(message: str) -> Optional[float]:
    """
    Extract transaction amount from message.
    Matches standard currency representations like Rs.250, INR 899, Rs. 1,200.50, rupees 150.
    """
    # Pattern to match prefix currencies (Rs, INR, USD, rupees) and the number (supporting commas)
    pattern = r'(?i)(?:Rs\.?|INR\.?|rupees?|USD)\s*([0-9,]+(?:\.[0-9]+)?)'
    match = re.search(pattern, message)
    if match:
        amount_str = match.group(1).replace(',', '')
        try:
            return float(amount_str)
        except ValueError:
            pass

    # Backup pattern for numbers alone followed by 'spent', 'paid', 'debited'
    backup_pattern = r'\b([0-9,]+(?:\.[0-9]+)?)\s*(?:spent|paid|debited)\b'
    match = re.search(backup_pattern, message.lower())
    if match:
        amount_str = match.group(1).replace(',', '')
        try:
            return float(amount_str)
        except ValueError:
            pass

    return None


def extract_merchant(message: str) -> Optional[str]:
    """
    Extract merchant name using common preposition indicators.
    Matches spent on <Merchant>, paid to <Merchant>, completed at <Merchant>.
    Falls back to a keyword scan of known merchants.
    """
    message_lower = message.lower()

    # Dynamic lookup markers
    patterns = [
        r'(?i)(?:spent on|paid to|completed at|debited for|purchase at|transfer to)\s+([a-z0-9\s\-\&]+)',
        r'(?i)([a-z0-9\s\-\&]+)\s+purchase',
    ]

    for pattern in patterns:
        match = re.search(pattern, message)
        if match:
            raw_merchant = match.group(1).strip()
            # Split and discard descriptive suffix noise like "using", "via", "at", "on", etc.
            words = []
            for word in raw_merchant.split():
                if word.lower() in ['using', 'via', 'on', 'at', 'for', 'through', 'from', 'with', 'by']:
                    break
                words.append(word)

            clean_merchant = " ".join(words).strip(".,! ")
            if clean_merchant:
                return clean_merchant.title()

    # Intelligent Keyword Scan Fallback
    known_merchants = [
        "Swiggy", "Zomato", "Restaurant", "Cafe", "Starbucks", "Dominos", "KFC",
        "Uber", "Ola", "Rapido", "Metro", "Bus",
        "Amazon", "Flipkart", "Myntra", "Ajio",
        "Electricity", "Water", "Gas", "Internet", "Recharge",
        "Netflix", "Spotify", "Prime Video", "BookMyShow"
    ]
    for km in known_merchants:
        if km.lower() in message_lower:
            return km

    return None


def infer_category(merchant: Optional[str]) -> str:
    """
    Map merchant keyword signals to standard XTrack expense categories.
    """
    if not merchant:
        return "Other"

    merchant_lower = merchant.lower()

    rules = {
        "Food": ["swiggy", "zomato", "restaurant", "cafe", "starbucks", "dominos", "kfc", "food", "dining", "bakery", "pizza", "burger"],
        "Transport": ["uber", "ola", "rapido", "metro", "bus", "cab", "taxi", "train", "flight", "auto", "rail", "travel"],
        "Shopping": ["amazon", "flipkart", "myntra", "ajio", "purchase", "shopping", "reliance fresh", "supermarket", "groceries", "mart"],
        "Bills": ["electricity", "water", "gas", "internet", "recharge", "bill", "broadband", "mobile", "utility"],
        "Entertainment": ["netflix", "spotify", "prime video", "bookmyshow", "movie", "theater", "cinema", "show"]
    }

    for category, keywords in rules.items():
        for kw in keywords:
            if kw in merchant_lower:
                return category

    return "Other"


def extract_date(message: str) -> str:
    """
    Extract calendar date if present in text. Defaults to today's date in local time.
    """
    # 1. YYYY-MM-DD
    match = re.search(r'\b(\d{4})[-/](\d{2})[-/](\d{2})\b', message)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

    # 2. DD/MM/YYYY or DD-MM-YYYY
    match = re.search(r'\b(\d{2})[-/](\d{2})[-/](\d{4})\b', message)
    if match:
        return f"{match.group(3)}-{match.group(2)}-{match.group(1)}"

    return dt.date.today().isoformat()


def parse_message(message: str) -> dict:
    """
    Master parser combining amount, merchant, category, and date extractors.
    """
    if not message or not message.strip():
        return {
            "title": "",
            "amount": None,
            "category": "Other",
            "date": dt.date.today().isoformat()
        }

    amount = extract_amount(message)
    merchant = extract_merchant(message)
    category = infer_category(merchant)
    date = extract_date(message)

    return {
        "title": merchant or "",
        "amount": amount,
        "category": category,
        "date": date
    }
