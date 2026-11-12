"""Sends email over SMTP. On the server that SMTP is Mailpit, so every email lands in its inbox instead."""

import smtplib
from email.message import EmailMessage

from app.core.config import get_settings


def send(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    msg = EmailMessage()
    msg["From"] = settings.mail_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.send_message(msg)
