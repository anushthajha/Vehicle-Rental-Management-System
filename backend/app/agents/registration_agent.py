from datetime import datetime, timezone
from html import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.mongo_models.notification import create_notification
from app.utils import email as email_utils


async def notify_admins_new_manager_registered(new_manager: User, db: AsyncSession) -> None:
    admins = (
        await db.execute(
            select(User).where(
                User.role == "admin",
                User.is_active.is_(True),
            )
        )
    ).scalars().all()

    if not admins:
        print("[AGENT] No admins to notify for new manager registration")
        return

    review_url = f"{settings.FRONTEND_URL}/admin/users/managers"
    registered_at = datetime.now(timezone.utc).strftime("%d %b %Y at %I:%M %p UTC")

    for admin in admins:
        await create_notification(
            admin.id,
            "New Vehicle Manager Registration",
            f"{new_manager.full_name} ({new_manager.email}) has registered as a Vehicle Manager and is awaiting approval.",
            "manager",
            action_url="/admin/users/managers",
            meta={
                "action_label": "Review & Approve",
                "reference_id": str(new_manager.id),
                "manager_email": new_manager.email,
            },
        )

        try:
            await email_utils.send_email(
                admin.email,
                "Action Required: New Vehicle Manager - SigFleet",
                f"""
                <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto">
                  <div style="background:#E31837;padding:20px 24px;border-radius:10px 10px 0 0">
                    <h2 style="color:white;margin:0;font-size:20px">SigFleet Admin Alert</h2>
                  </div>
                  <div style="background:#fafafa;padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px">
                    <p style="color:#1a1a1a;font-size:16px;font-weight:600;margin-top:0">New Vehicle Manager Registration</p>
                    <p style="color:#555;line-height:1.6">A user has registered as a Vehicle Manager and is waiting for your approval before they can list vehicles.</p>
                    <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
                      <p style="margin:6px 0;color:#374151"><strong>Name:</strong> {escape(new_manager.full_name)}</p>
                      <p style="margin:6px 0;color:#374151"><strong>Email:</strong> {escape(new_manager.email)}</p>
                      <p style="margin:6px 0;color:#374151"><strong>Registered:</strong> {registered_at}</p>
                    </div>
                    <a href="{escape(review_url)}" style="display:inline-block;background:#E31837;color:white;padding:12px 28px;border-radius:7px;text-decoration:none;font-weight:700;font-size:14px;margin-top:4px">Review &amp; Approve</a>
                    <p style="color:#9ca3af;font-size:11px;margin-top:20px">SigFleet Platform - Automated alert</p>
                  </div>
                </div>
                """,
            )
            print(f"[AGENT] Admin {admin.email} notified of new manager {new_manager.email}")
        except Exception as exc:
            print(f"[AGENT] Email failed for {admin.email}: {exc}")
