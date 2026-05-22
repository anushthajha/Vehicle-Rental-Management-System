from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.car import Car
from app.models.payment import Payment, WalletTransaction
from app.models.user import User
from app.services.booking_flow import add_wallet_transaction, get_or_create_wallet, mark_payment_paid, money
from app.utils.auth import get_current_active_user


router = APIRouter(prefix="/payments", tags=["payments"])


class WalletTopUpRequest(BaseModel):
    amount: float = Field(ge=100, le=10000)


class WalletBookingPayRequest(BaseModel):
    booking_id: str


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _payment_payload(payment: Payment) -> dict:
    return {
        "id": payment.id,
        "booking_id": payment.booking_id,
        "user_id": payment.user_id,
        "amount": money(payment.amount),
        "currency": payment.currency,
        "payment_method": payment.payment_method,
        "simulated_transaction_id": payment.simulated_transaction_id,
        "status": payment.status,
        "paid_at": _dt(payment.paid_at),
        "created_at": _dt(payment.created_at),
    }


def _transaction_payload(txn: WalletTransaction) -> dict:
    return {
        "id": txn.id,
        "transaction_type": txn.transaction_type,
        "amount": money(txn.amount),
        "balance_after": money(txn.balance_after),
        "description": txn.description,
        "reference_id": txn.reference_id,
        "created_at": _dt(txn.created_at),
    }


async def _pay_booking_with_wallet(db: AsyncSession, booking: Booking, payment: Payment, current_user: User) -> dict:
    if booking.guest_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the guest can pay for this booking")
    if booking.status != "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not ready for wallet payment")
    if payment.status != "created":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment is not payable")
    wallet = await get_or_create_wallet(db, current_user.id)
    if Decimal(str(wallet.balance)) < Decimal(str(payment.amount)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient wallet balance")
    car = await db.scalar(select(Car).where(Car.id == booking.car_id))
    host = await db.scalar(select(User).where(User.id == booking.host_id))
    txn_id = await mark_payment_paid(db, booking, payment, car, current_user, host, payment_method="wallet", debit_wallet=True)
    return {"success": True, "booking_ref": booking.booking_ref, "transaction_id": txn_id, "message": "Payment successful. Booking confirmed!"}


@router.get("/wallet")
async def get_wallet(
    transaction_type: str = Query(default="all", pattern="^(all|credit|debit)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    wallet = await get_or_create_wallet(db, current_user.id)
    conditions = [WalletTransaction.user_id == current_user.id]
    if transaction_type != "all":
        conditions.append(WalletTransaction.transaction_type == transaction_type)
    total = await db.scalar(select(func.count()).select_from(WalletTransaction).where(*conditions)) or 0
    txns = (
        await db.execute(
            select(WalletTransaction)
            .where(*conditions)
            .order_by(WalletTransaction.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    await db.commit()
    pages = (total + limit - 1) // limit if total else 0
    return {"balance": money(wallet.balance), "transactions": [_transaction_payload(txn) for txn in txns], "total": total, "page": page, "pages": pages, "has_next": page < pages}


@router.post("/wallet/add", status_code=status.HTTP_201_CREATED)
async def add_wallet_money(payload: WalletTopUpRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    wallet = await get_or_create_wallet(db, current_user.id)
    wallet.balance = Decimal(str(wallet.balance)) + Decimal(str(payload.amount))
    txn = add_wallet_transaction(db, current_user.id, "credit", payload.amount, wallet.balance, "Wallet top-up")
    await db.commit()
    await db.refresh(txn)
    return {"new_balance": money(wallet.balance), "transaction_id": txn.id}


@router.post("/wallet/pay-booking")
async def pay_booking_with_wallet(payload: WalletBookingPayRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    booking = await db.scalar(select(Booking).where(Booking.id == payload.booking_id))
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    result = await _pay_booking_with_wallet(db, booking, payment, current_user)
    await db.commit()
    return result


@router.get("/booking/{booking_id}")
async def get_booking_payment(booking_id: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    booking = await db.scalar(select(Booking).where(Booking.id == booking_id))
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if current_user.id not in {booking.guest_id, booking.host_id} and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to access payment")
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking_id))
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return _payment_payload(payment)
