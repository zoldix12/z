"""
خادم Flask لاستقبال طلبات مطعم سلطان الشاورما وإرسالها عبر البريد الإلكتروني.
يدعم التحقق الكامل من البيانات، حساب الأسعار على الخادم، الحماية من البوتات وتكرار الطلبات،
وكذلك تقديم ملفات الواجهة المبنية (dist) عند الرفع على استضافة مجانية.
"""

from __future__ import annotations

import os
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory

from order_service import (
    BASE_DIR,
    load_env_files,
    load_restaurant_config,
    send_order_email,
    validate_and_price_order,
)

load_env_files()

DIST_DIR = BASE_DIR / "dist"
app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path="/")


def get_client_ip() -> str:
    """استخراج عنوان IP الحقيقي للعميل مع دعم البروكسي."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


@app.get("/api/health")
def health_check():
    """فحص حالة الخادم."""
    return jsonify({"ok": True, "service": "sultan-shawarma-api"})


@app.get("/api/locate")
def approximate_locate():
    """توفير نقطة ارتكاز تقريبية للموقع عند تعذر GPS في المتصفح."""
    return jsonify({
        "lat": 31.985421,
        "lng": 35.875210,
        "city": "عمّان",
        "approximate": True,
    })


@app.get("/api/menu")
def public_menu():
    """إرجاع بيانات المنيو والعروض العامة (بدون أي معلومات سرية)."""
    return jsonify(load_restaurant_config())


@app.post("/api/order")
def create_order():
    """استقبال الطلب الجديد، التحقق منه، إعادة حساب السعر، وإرساله بالبريد الإلكتروني."""
    payload = request.get_json(silent=True)
    order, error_body, status_code = validate_and_price_order(
        payload, client_ip=get_client_ip()
    )
    if error_body or order is None:
        return jsonify(error_body or {"error": "طلب غير صالح."}), status_code

    try:
        send_order_email(order)
    except Exception:
        return (
            jsonify(
                {
                    "error": "حدث خطأ أثناء إرسال الطلب إلى المطعم. يرجى المحاولة مجدداً أو الاتصال هاتفياً."
                }
            ),
            502,
        )

    return jsonify(
        {
            "ok": True,
            "message": "تم استلام طلبك وسنتواصل معك قريباً",
            "order": {
                "orderId": order["orderId"],
                "timestamp": order["timestamp"],
                "orderTypeLabel": order["orderTypeLabel"],
                "paymentMethod": order["paymentMethod"],
                "subtotal": order["subtotal"],
                "deliveryFee": order["deliveryFee"],
                "total": order["total"],
                "currency": order["currency"],
                "items": order["items"],
            },
        }
    ), 201


@app.get("/")
@app.get("/<path:path>")
def serve_frontend(path: str = ""):
    """تقديم الواجهة الأمامية المبنية عند التشغيل المباشر عبر Flask."""
    if path.startswith("api/"):
        return jsonify({"error": "المسار غير موجود."}), 404
    if DIST_DIR.is_dir():
        candidate = DIST_DIR / path
        if path and candidate.is_file():
            return send_from_directory(str(DIST_DIR), path)
        index_file = DIST_DIR / "index.html"
        if index_file.is_file():
            return send_from_directory(str(DIST_DIR), "index.html")
    return jsonify({"ok": True, "message": "خادم سلطان الشاورما يعمل بنجاح."})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=False)
