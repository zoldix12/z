"""
خدمة معالجة الطلبات وإرسال البريد الإلكتروني عبر SMTP SSL لمطعم سلطان الشاورما.
تدعم الأحجام/أنواع الخبز (variants)، الإضافات، طرق الدفع المتعددة، والتحقق الكامل على الخادم.
"""

from __future__ import annotations

import html
import json
import os
import random
import re
import smtplib
import ssl
import threading
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "restaurant.config.json"

ARABIC_DIGITS_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
JORDAN_PHONE_RE = re.compile(r"^07\d{8}$")
LAST4_RE = re.compile(r"^\d{4}$")

_RATE_LOCK = threading.Lock()
_RATE_BUCKETS: dict[str, list[float]] = {}
MAX_ORDERS_PER_MINUTE = 3
RATE_WINDOW_SECONDS = 60.0


def load_env_files() -> None:
    """تحميل متغيرات البيئة من ملف .env على الخادم فقط إذا لم تكن محمّلة مسبقاً."""
    for env_path in (Path(__file__).resolve().parent / ".env", BASE_DIR / ".env"):
        if not env_path.is_file():
            continue
        try:
            for raw_line in env_path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
        except OSError:
            pass


def load_restaurant_config() -> dict[str, Any]:
    """قراءة إعدادات المطعم والأصناف والأسعار من الملف الموحد."""
    with CONFIG_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def normalize_phone(raw_phone: str) -> str:
    """تنظيف رقم الهاتف وتحويل الأرقام العربية إلى إنجليزية."""
    translated = raw_phone.translate(ARABIC_DIGITS_MAP)
    cleaned = re.sub(r"[\s\-()]+", "", translated)
    if cleaned.startswith("+9627"):
        cleaned = "0" + cleaned[4:]
    elif cleaned.startswith("009627"):
        cleaned = "0" + cleaned[5:]
    return cleaned


def is_valid_google_maps_url(url: str) -> bool:
    """التحقق من أن رابط الخريطة آمن ويتبع خرائط جوجل فقط."""
    if not url:
        return True
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme != "https":
        return False
    allowed_hosts = {"maps.google.com", "www.google.com", "maps.app.goo.gl"}
    return parsed.netloc.lower() in allowed_hosts


def check_rate_limit(client_key: str) -> tuple[bool, int]:
    """التحقق من الحد الأقصى للطلبات في الدقيقة لكل جهاز/عنوان IP."""
    now = time.monotonic()
    with _RATE_LOCK:
        timestamps = _RATE_BUCKETS.get(client_key, [])
        timestamps = [ts for ts in timestamps if now - ts < RATE_WINDOW_SECONDS]
        if len(timestamps) >= MAX_ORDERS_PER_MINUTE:
            retry_after = max(1, int(RATE_WINDOW_SECONDS - (now - timestamps[0])))
            _RATE_BUCKETS[client_key] = timestamps
            return False, retry_after
        timestamps.append(now)
        _RATE_BUCKETS[client_key] = timestamps
        return True, 0


def resolve_payment_label(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    """تحديد نص طريقة الدفع المعتمدة دون قبول أرقام بطاقات كاملة على الخادم."""
    method = str(payload.get("paymentMethod", "cash") or "cash").strip()
    if method == "cash":
        return "الدفع كاش عند الاستلام أو التوصيل", None
    if method == "pos_card":
        return "الدفع بالبطاقة عند المندوب (جهاز POS)", None
    if method == "card_online":
        last4 = str(payload.get("cardLast4", "") or "").translate(ARABIC_DIGITS_MAP).strip()
        brand = str(payload.get("cardBrand", "بطاقة بنكية") or "بطاقة بنكية").strip()[:24]
        if brand not in ("Visa", "Mastercard", "بطاقة بنكية"):
            brand = "بطاقة بنكية"
        if not LAST4_RE.match(last4):
            return None, "يرجى إدخال بيانات بطاقة الدفع بشكل صحيح."
        return f"دفع بالبطاقة الإلكترونية ({brand} تنتهي بـ {last4})", None
    return None, "طريقة الدفع المختارة غير مدعومة."


def validate_and_price_order(
    payload: Any,
    client_ip: str = "unknown",
    skip_rate_limit: bool = False,
) -> tuple[dict[str, Any] | None, dict[str, str] | None, int]:
    """التحقق الكامل من بيانات الطلب وإعادة حساب الأسعار والمجموع على الخادم."""
    if not isinstance(payload, dict):
        return None, {"error": "بيانات الطلب غير صالحة."}, 400

    # 1. فحص حقل مصيدة البوتات المخفي (Honeypot)
    for hp_key in ("website", "company", "hp_field"):
        hp_val = str(payload.get(hp_key, "") or "").strip()
        if hp_val:
            return None, {"error": "تعذر التحقق من صحة الطلب."}, 400

    # 2. التحقق من حد الطلبات في الدقيقة (Rate Limit)
    device_id = str(payload.get("deviceId", "") or "").strip()[:64]
    rate_key = f"{client_ip}:{device_id or 'anon'}"
    if not skip_rate_limit:
        allowed, retry_after = check_rate_limit(rate_key)
        if not allowed:
            return (
                None,
                {
                    "error": f"تم إرسال عدة طلبات متتالية. يرجى الانتظار {retry_after} ثانية قبل المحاولة مرة أخرى."
                },
                429,
            )

    # 3. التحقق من الحقول الأساسية
    name = str(payload.get("name", "") or "").strip()
    if len(name) < 2 or len(name) > 80:
        return None, {"error": "يرجى كتابة الاسم الكامل (حرفين على الأقل)."}, 400

    raw_phone = str(payload.get("phone", "") or "").strip()
    phone = normalize_phone(raw_phone)
    if not JORDAN_PHONE_RE.match(phone):
        return (
            None,
            {"error": "يرجى إدخال رقم هاتف أردني صحيح يبدأ بـ 07 ويتكون من 10 أرقام."},
            400,
        )

    order_type = str(payload.get("orderType", "") or "").strip()
    if order_type not in ("delivery", "pickup"):
        return None, {"error": "يرجى اختيار نوع الطلب (توصيل أو استلام من المطعم)."}, 400

    payment_label, payment_err = resolve_payment_label(payload)
    if payment_err or not payment_label:
        return None, {"error": payment_err or "طريقة الدفع غير صالحة."}, 400

    area = str(payload.get("area", "") or "").strip()[:100]
    address = str(payload.get("address", "") or "").strip()[:240]
    if order_type == "delivery":
        if len(area) < 2:
            return None, {"error": "يرجى كتابة اسم المنطقة أو الحي للتوصيل."}, 400
        if len(address) < 4:
            return None, {"error": "يرجى كتابة العنوان التفصيلي (الشارع، البناية، الطابق)."}, 400

    map_url = str(payload.get("mapUrl", "") or "").strip()[:300]
    if map_url and not is_valid_google_maps_url(map_url):
        return None, {"error": "رابط الموقع الجغرافي غير صالح."}, 400

    order_notes = str(payload.get("notes", "") or "").strip()[:400]

    raw_items = payload.get("items")
    if not isinstance(raw_items, list) or len(raw_items) == 0:
        return None, {"error": "السلة فارغة. يرجى إضافة صنف واحد على الأقل."}, 400
    if len(raw_items) > 40:
        return None, {"error": "عدد الأصناف في الطلب يتجاوز الحد المسموح."}, 400

    # 4. تحميل الكتالوج وإعادة حساب الأسعار من الخادم فقط
    config = load_restaurant_config()
    restaurant_cfg = config.get("restaurant", {})
    currency = str(restaurant_cfg.get("currency", "د.أ"))
    catalog_items: dict[str, dict[str, Any]] = {}
    for offer in config.get("offers", []):
        catalog_items[offer["id"]] = offer
    for item in config.get("items", []):
        catalog_items[item["id"]] = item

    variants_map: dict[str, dict[str, Any]] = {
        v["id"]: v for v in config.get("variants", [])
    }
    addons_map: dict[str, dict[str, Any]] = {
        addon["id"]: addon for addon in config.get("addons", [])
    }

    verified_items: list[dict[str, Any]] = []
    subtotal = 0.0

    for entry in raw_items:
        if not isinstance(entry, dict):
            return None, {"error": "أحد الأصناف المختارة غير صالح."}, 400

        item_id = str(entry.get("itemId", "") or "").strip()
        catalog_item = catalog_items.get(item_id)
        if not catalog_item:
            return None, {"error": "أحد الأصناف المطلوبة غير متوفر حالياً في القائمة."}, 400

        try:
            quantity = int(entry.get("quantity", 0))
        except (TypeError, ValueError):
            return None, {"error": "الكمية المطلوبة غير صالحة."}, 400
        if quantity < 1 or quantity > 50:
            return None, {"error": "يجب أن تكون الكمية بين 1 و 50 لكل صنف."}, 400

        # التحقق من الحجم / نوع الخبز (Variant)
        allowed_variants = list(catalog_item.get("variantIds", []))
        variant_id = str(entry.get("variantId", "") or "").strip()
        variant_name = ""
        variant_delta = 0.0
        if variant_id:
            if variant_id not in variants_map or (allowed_variants and variant_id not in allowed_variants):
                return None, {"error": "الخيار المحدد للحجم أو الخبز غير متوفر لهذا الصنف."}, 400
            v_obj = variants_map[variant_id]
            variant_name = str(v_obj["name"])
            variant_delta = float(v_obj.get("priceDelta", 0.0))

        allowed_addons = set(catalog_item.get("addonIds", []))
        raw_addon_ids = entry.get("addonIds", [])
        if raw_addon_ids is None:
            raw_addon_ids = []
        if not isinstance(raw_addon_ids, list):
            return None, {"error": "صيغة الإضافات غير صالحة."}, 400

        verified_addons: list[dict[str, Any]] = []
        addons_unit_total = 0.0
        seen_addons: set[str] = set()
        for raw_addon_id in raw_addon_ids:
            addon_id = str(raw_addon_id or "").strip()
            if addon_id in seen_addons:
                continue
            if addon_id not in addons_map or (allowed_addons and addon_id not in allowed_addons):
                return None, {"error": "إحدى الإضافات المختارة غير متوفرة لهذا الصنف."}, 400
            seen_addons.add(addon_id)
            addon_obj = addons_map[addon_id]
            addon_price = float(addon_obj["price"])
            addons_unit_total += addon_price
            verified_addons.append(
                {
                    "id": addon_id,
                    "name": addon_obj["name"],
                    "price": round(addon_price, 2),
                }
            )

        item_note = str(entry.get("notes", "") or "").strip()[:200]
        base_price = float(catalog_item["price"])
        unit_price = round(base_price + variant_delta + addons_unit_total, 2)
        line_total = round(unit_price * quantity, 2)
        subtotal = round(subtotal + line_total, 2)

        verified_items.append(
            {
                "itemId": item_id,
                "name": catalog_item["name"],
                "variantName": variant_name,
                "quantity": quantity,
                "basePrice": round(base_price, 2),
                "addons": verified_addons,
                "notes": item_note,
                "unitPrice": unit_price,
                "lineTotal": line_total,
            }
        )

    base_delivery_fee = float(restaurant_cfg.get("deliveryFee", 1.5))
    free_threshold = restaurant_cfg.get("freeDeliveryThreshold")
    if order_type == "pickup":
        delivery_fee = 0.0
    elif free_threshold is not None and subtotal >= float(free_threshold):
        delivery_fee = 0.0
    else:
        delivery_fee = round(base_delivery_fee, 2)

    total = round(subtotal + delivery_fee, 2)

    jordan_tz = timezone(timedelta(hours=3))
    now_local = datetime.now(jordan_tz)
    order_id = f"SS-{now_local.strftime('%y%m%d')}-{random.randint(1000, 9999)}"
    timestamp_str = now_local.strftime("%Y-%m-%d %I:%M %p")

    order_record = {
        "orderId": order_id,
        "timestamp": timestamp_str,
        "restaurantName": restaurant_cfg.get("name", "سلطان الشاورما"),
        "currency": currency,
        "name": name,
        "phone": phone,
        "orderType": order_type,
        "orderTypeLabel": "توصيل للعنوان" if order_type == "delivery" else "استلام من المطعم",
        "paymentMethod": payment_label,
        "area": area if order_type == "delivery" else "الاستلام من الفرع",
        "address": address if order_type == "delivery" else restaurant_cfg.get("address", ""),
        "mapUrl": map_url,
        "notes": order_notes,
        "items": verified_items,
        "subtotal": subtotal,
        "deliveryFee": delivery_fee,
        "total": total,
    }
    return order_record, None, 200


def build_order_email(order: dict[str, Any]) -> tuple[str, str, str]:
    """إنشاء عنوان ومحتوى البريد الإلكتروني بصيغتي النص العادي و HTML باللغة العربية."""
    currency = order["currency"]
    subject = f"طلب جديد #{order['orderId']} - {order['name']} ({order['total']:.2f} {currency})"

    text_lines = [
        f"طلب جديد من {order['restaurantName']}",
        f"رقم الطلب: {order['orderId']}",
        f"وقت الطلب: {order['timestamp']}",
        f"نوع الطلب: {order['orderTypeLabel']}",
        f"طريقة الدفع: {order['paymentMethod']}",
        "-" * 40,
        f"الاسم: {order['name']}",
        f"الهاتف: {order['phone']}",
        f"المنطقة: {order['area']}",
        f"العنوان: {order['address']}",
    ]
    if order["mapUrl"]:
        text_lines.append(f"رابط الموقع على الخريطة: {order['mapUrl']}")
    if order["notes"]:
        text_lines.append(f"ملاحظات عامة: {order['notes']}")
    text_lines.append("-" * 40)
    text_lines.append("تفاصيل الأصناف:")
    for idx, item in enumerate(order["items"], start=1):
        addons_str = ", ".join(a["name"] for a in item["addons"])
        variant_str = f" ({item['variantName']})" if item.get("variantName") else ""
        line = f"{idx}. {item['name']}{variant_str} × {item['quantity']} = {item['lineTotal']:.2f} {currency}"
        if addons_str:
            line += f" | إضافات: {addons_str}"
        if item["notes"]:
            line += f" | ملاحظة: {item['notes']}"
        text_lines.append(line)
    text_lines.extend(
        [
            "-" * 40,
            f"المجموع الفرعي: {order['subtotal']:.2f} {currency}",
            f"التوصيل: {order['deliveryFee']:.2f} {currency}",
            f"المجموع النهائي: {order['total']:.2f} {currency}",
        ]
    )
    plain_text = "\n".join(text_lines)

    items_rows_html = []
    for item in order["items"]:
        variant_html = ""
        if item.get("variantName"):
            variant_html = f'<div style="color:#92400e;font-size:12px;margin-top:2px;font-weight:700;">النوع/الحجم: {html.escape(item["variantName"])}</div>'
        addons_html = ""
        if item["addons"]:
            addons_names = "، ".join(html.escape(a["name"]) for a in item["addons"])
            addons_html = f'<div style="color:#6b5c52;font-size:12px;margin-top:4px;">الإضافات والصوصات: {addons_names}</div>'
        notes_html = ""
        if item["notes"]:
            notes_html = f'<div style="color:#b91c1c;font-size:12px;margin-top:3px;">ملاحظة: {html.escape(item["notes"])}</div>'

        items_rows_html.append(
            f"""
            <tr>
              <td style="padding:12px 10px;border-bottom:1px solid #efe7dc;text-align:right;vertical-align:top;">
                <strong style="color:#1a120e;font-size:14px;">{html.escape(item['name'])}</strong>
                {variant_html}
                {addons_html}
                {notes_html}
              </td>
              <td style="padding:12px 10px;border-bottom:1px solid #efe7dc;text-align:center;font-weight:700;color:#1a120e;">{item['quantity']}</td>
              <td style="padding:12px 10px;border-bottom:1px solid #efe7dc;text-align:left;white-space:nowrap;color:#1a120e;font-weight:700;">{item['lineTotal']:.2f} {html.escape(currency)}</td>
            </tr>
            """
        )

    map_row_html = ""
    if order["mapUrl"]:
        safe_url = html.escape(order["mapUrl"], quote=True)
        map_row_html = f"""
        <tr>
          <td style="padding:8px 0;color:#6b5c52;width:130px;">الموقع (خرائط):</td>
          <td style="padding:8px 0;">
            <a href="{safe_url}" style="display:inline-block;background:#fef3c7;color:#92400e;text-decoration:none;padding:6px 12px;border-radius:8px;font-weight:700;border:1px solid #f59e0b;">
              فتح الموقع على خرائط جوجل
            </a>
          </td>
        </tr>
        """

    notes_row_html = ""
    if order["notes"]:
        notes_row_html = f"""
        <tr>
          <td style="padding:8px 0;color:#6b5c52;width:130px;vertical-align:top;">ملاحظات الطلب:</td>
          <td style="padding:8px 0;color:#991b1b;font-weight:600;">{html.escape(order['notes'])}</td>
        </tr>
        """

    safe_phone = html.escape(order["phone"])
    delivery_text = (
        "مجاني"
        if order["deliveryFee"] == 0 and order["orderType"] == "delivery"
        else f"{order['deliveryFee']:.2f} {html.escape(currency)}"
    )

    html_body = f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:24px;background-color:#faf6f0;font-family:Tahoma,Arial,sans-serif;direction:rtl;color:#1a120e;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #eadfce;box-shadow:0 10px 30px rgba(26,18,14,0.08);">
    <div style="background:linear-gradient(135deg,#d92b1e 0%,#991b1b 100%);padding:24px 28px;color:#ffffff;">
      <div style="font-size:13px;opacity:0.9;margin-bottom:4px;">{html.escape(order['restaurantName'])}</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;">طلب جديد #{html.escape(order['orderId'])}</h1>
      <div style="margin-top:8px;font-size:13px;color:#fde68a;font-weight:700;">
        {html.escape(order['orderTypeLabel'])} · {html.escape(order['paymentMethod'])}
      </div>
    </div>

    <div style="padding:24px 28px;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#991b1b;border-bottom:2px solid #faf6f0;padding-bottom:8px;">بيانات العميل والتوصيل</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:7px 0;color:#6b5c52;width:130px;">رقم الطلب:</td>
          <td style="padding:7px 0;font-weight:800;">#{html.escape(order['orderId'])}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#6b5c52;">وقت الطلب:</td>
          <td style="padding:7px 0;">{html.escape(order['timestamp'])}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#6b5c52;">اسم العميل:</td>
          <td style="padding:7px 0;font-weight:700;">{html.escape(order['name'])}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#6b5c52;">رقم الهاتف:</td>
          <td style="padding:7px 0;">
            <a href="tel:{safe_phone}" style="color:#d92b1e;font-weight:800;font-size:16px;text-decoration:none;direction:ltr;display:inline-block;">{safe_phone}</a>
            <span style="font-size:12px;color:#6b5c52;"> (اضغط للاتصال)</span>
          </td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#6b5c52;">نوع الطلب:</td>
          <td style="padding:7px 0;font-weight:700;">{html.escape(order['orderTypeLabel'])}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#6b5c52;">طريقة الدفع:</td>
          <td style="padding:7px 0;font-weight:700;">{html.escape(order['paymentMethod'])}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#6b5c52;">المنطقة:</td>
          <td style="padding:7px 0;">{html.escape(order['area'])}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#6b5c52;vertical-align:top;">العنوان:</td>
          <td style="padding:7px 0;font-weight:600;">{html.escape(order['address'])}</td>
        </tr>
        {map_row_html}
        {notes_row_html}
      </table>

      <h2 style="margin:24px 0 12px;font-size:16px;color:#991b1b;border-bottom:2px solid #faf6f0;padding-bottom:8px;">تفاصيل الأصناف المطلوبة</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#faf6f0;color:#5c4d44;">
            <th style="padding:10px;text-align:right;font-size:13px;">الصنف</th>
            <th style="padding:10px;text-align:center;font-size:13px;">الكمية</th>
            <th style="padding:10px;text-align:left;font-size:13px;">السعر</th>
          </tr>
        </thead>
        <tbody>
          {''.join(items_rows_html)}
        </tbody>
      </table>

      <div style="margin-top:20px;background:#faf6f0;border-radius:12px;padding:16px 18px;border:1px solid #eadfce;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:4px 0;color:#5c4d44;">المجموع الفرعي:</td>
            <td style="padding:4px 0;text-align:left;font-weight:700;">{order['subtotal']:.2f} {html.escape(currency)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#5c4d44;">رسوم التوصيل:</td>
            <td style="padding:4px 0;text-align:left;font-weight:700;">{delivery_text}</td>
          </tr>
          <tr>
            <td style="padding:10px 0 0;font-size:18px;font-weight:800;color:#d92b1e;border-top:1px dashed #d6c8b8;">المجموع النهائي:</td>
            <td style="padding:10px 0 0;text-align:left;font-size:18px;font-weight:800;color:#d92b1e;border-top:1px dashed #d6c8b8;">{order['total']:.2f} {html.escape(currency)}</td>
          </tr>
        </table>
      </div>
    </div>
  </div>
</body>
</html>"""

    return subject, plain_text, html_body


def send_order_email(order: dict[str, Any]) -> None:
    """إرسال بريد الطلب عبر SMTP باستخدام SSL (المنفذ 465) بالاعتماد على متغيرات .env فقط."""
    load_env_files()

    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
    smtp_port = int(os.environ.get("SMTP_PORT", "465").strip() or "465")
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_pass = os.environ.get("SMTP_PASS", "").strip()
    order_to = os.environ.get("ORDER_TO", "").strip()

    if not smtp_user or not smtp_pass or not order_to:
        raise RuntimeError(
            "إعدادات البريد الإلكتروني غير مكتملة على الخادم (SMTP_USER / SMTP_PASS / ORDER_TO)."
        )

    subject, plain_text, html_body = build_order_email(order)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{order['restaurantName']} <{smtp_user}>"
    msg["To"] = order_to
    msg.set_content(plain_text, charset="utf-8")
    msg.add_alternative(html_body, subtype="html", charset="utf-8")

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=20) as server:
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
