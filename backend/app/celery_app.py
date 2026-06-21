"""
Celery is disabled — Redis broker has been removed.
Tasks that were dispatched via Celery (email sending, maintenance) are now
called directly (synchronously) or skipped gracefully.
"""
from celery import Celery

# Stub celery_app so existing `send_*.delay(...)` calls don't crash.
# delay() on a task whose broker is unreachable just no-ops here.
celery_app = Celery("sigfleet")
celery_app.conf.update(task_always_eager=True)  # run tasks inline, synchronously
app = celery_app
