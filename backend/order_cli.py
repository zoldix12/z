"""
نقطة تشغيل سطر الأوامر لإرسال طلب واحد عبر خدمة بايثون (تُستخدم من الخادم الوسيط Node عند المعاينة).
تستقبل الطلب كـ JSON عبر الإدخال القياسي stdin وتُرجع النتيجة كـ JSON عبر stdout.
"""

from __future__ import annotations

import json
import sys

from order_service import load_env_files, send_order_email, validate_and_price_order


def main() -> int:
    load_env_files()
    try:
        raw_input = sys.stdin.read()
        data = json.loads(raw_input) if raw_input else {}
    except json.JSONDecodeError:
        print(json.dumps({"status": 400, "body": {"error": "صيغة الطلب غير صالحة."}}, ensure_ascii=False))
        return 0

    payload = data.get("payload")
    client_ip = str(data.get("clientIp") or "unknown")

    # يتم التحقق من معدل الطلبات في الخادم الدائم، هنا نتحقق من كافة البيانات ونرسل الإيميل
    order, error_body, status_code = validate_and_price_order(
        payload, client_ip=client_ip, skip_rate_limit=True
    )
    if error_body or order is None:
        print(json.dumps({"status": status_code, "body": error_body}, ensure_ascii=False))
        return 0

    try:
        send_order_email(order)
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": 502,
                    "body": {
                        "error": "تعذر إرسال الطلب إلى البريد الإلكتروني حالياً. يرجى المحاولة مرة أخرى.",
                        "detail": str(exc),
                    },
                },
                ensure_ascii=False,
            )
        )
        return 0

    print(
        json.dumps(
            {
                "status": 201,
                "body": {
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
                },
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
