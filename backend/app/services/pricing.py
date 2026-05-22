from datetime import datetime, timedelta


def _trip_weekend_ratio(start_dt: datetime, end_dt: datetime) -> float:
    current = start_dt
    weekend_hours = 0.0
    total_hours = max((end_dt - start_dt).total_seconds() / 3600, 0)
    while current < end_dt:
        next_boundary = min(end_dt, current + timedelta(hours=1))
        hours = (next_boundary - current).total_seconds() / 3600
        if current.weekday() >= 5:
            weekend_hours += hours
        current = next_boundary
    return weekend_hours / total_hours if total_hours else 0


def calculate_booking_price(
    car,
    start_dt: datetime,
    end_dt: datetime,
    insurance_plan: str,
    coupon_code: str | None = None,
    db_coupon=None,
) -> dict:
    total_seconds = (end_dt - start_dt).total_seconds()
    if total_seconds <= 0:
        raise ValueError("end_dt must be after start_dt")

    total_hours = total_seconds / 3600
    total_days = total_hours / 24

    if total_hours <= 24:
        base_amount = float(car.price_per_hour) * total_hours
    else:
        full_days = int(total_days)
        remaining_hours = total_hours - (full_days * 24)
        base_amount = (float(car.price_per_day) * full_days) + (float(car.price_per_hour) * remaining_hours)

    discount_from_rules = 0.0
    surcharge_from_rules = 0.0
    for rule in getattr(car, "pricing_rules", []) or []:
        if rule.rule_type == "weekend_discount" and _trip_weekend_ratio(start_dt, end_dt) >= 0.5 and rule.discount_percent:
            discount_from_rules = base_amount * (float(rule.discount_percent) / 100)
            break
        if rule.rule_type == "long_trip_discount" and rule.min_days and total_days >= rule.min_days and rule.discount_percent:
            discount_from_rules = base_amount * (float(rule.discount_percent) / 100)
            break
        if rule.rule_type == "peak_surcharge" and rule.surcharge_percent:
            surcharge_from_rules = base_amount * (float(rule.surcharge_percent) / 100)
            break

    base_amount = max(base_amount - discount_from_rules + surcharge_from_rules, 0)

    insurance_rates = {"basic": 0.05, "standard": 0.08, "platinum": 0.12}
    insurance_amount = base_amount * insurance_rates.get(insurance_plan, 0)

    coupon_discount = 0.0
    if db_coupon:
        if db_coupon.discount_type == "percent":
            coupon_discount = base_amount * (float(db_coupon.discount_value) / 100)
            if db_coupon.max_discount:
                coupon_discount = min(coupon_discount, float(db_coupon.max_discount))
        else:
            coupon_discount = float(db_coupon.discount_value)

    taxable = max(base_amount - coupon_discount, 0)
    platform_fee = taxable * 0.10
    security_deposit = float(car.security_deposit)

    total_amount = taxable + insurance_amount + platform_fee
    host_earnings = taxable + insurance_amount - platform_fee

    return {
        "base_amount": round(base_amount, 2),
        "discount_from_rules": round(discount_from_rules, 2),
        "coupon_discount": round(coupon_discount, 2),
        "insurance_amount": round(insurance_amount, 2),
        "insurance_plan": insurance_plan,
        "platform_fee": round(platform_fee, 2),
        "security_deposit": security_deposit,
        "total_amount": round(total_amount, 2),
        "host_earnings": round(host_earnings, 2),
        "duration_hours": round(total_hours, 2),
        "duration_days": round(total_days, 2),
        "coupon_code": coupon_code,
    }
