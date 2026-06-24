"""
Mailer multi-cliente para Agente 4 Nurturing.
Los datos del remitente y SMTP se toman del Client en la DB (via client_config dict).
"""

import os
import re
import smtplib
import hmac
import hashlib
import urllib.parse
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

# Cargar variables de entorno desde .env si existe
ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
if ENV_FILE.exists():
    with open(ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())

# Fallbacks desde .env (usados cuando no hay client_config)
DEFAULT_FROM_NAME = os.getenv("NURTURE_FROM_NAME", "Bruno de PC MIDI Labs")
DEFAULT_FROM_EMAIL = os.getenv("NURTURE_FROM_EMAIL", "lab@pcmidicenter.com")
DEFAULT_SMTP_HOST = os.getenv("NURTURE_SMTP_HOST", "")
DEFAULT_SMTP_PORT = int(os.getenv("NURTURE_SMTP_PORT", "465"))
DEFAULT_SMTP_USER = os.getenv("NURTURE_SMTP_USER", "")
DEFAULT_SMTP_PASS = os.getenv("NURTURE_SMTP_PASS", "").strip()
DEFAULT_STORE_URL = os.getenv("STORE_URL", "https://www.pcmidi.com.ar")
DEFAULT_LAB_NAME = os.getenv("LAB_NAME", "PC MIDI Labs")

# Mantener compatibilidad con código que importa SMTP_HOST/SMTP_PORT directamente
SMTP_HOST = DEFAULT_SMTP_HOST
SMTP_PORT = DEFAULT_SMTP_PORT
SMTP_USER = DEFAULT_SMTP_USER
SMTP_PASS = DEFAULT_SMTP_PASS


def _smtp_cfg(client_config: dict | None) -> tuple[str, int, str, str]:
    """Devuelve (host, port, user, pass) desde client_config o .env."""
    if client_config:
        host = client_config.get("smtpHost") or DEFAULT_SMTP_HOST
        port = int(client_config.get("smtpPort") or DEFAULT_SMTP_PORT)
        user = client_config.get("smtpUser") or DEFAULT_SMTP_USER
        pw = client_config.get("smtpPass") or DEFAULT_SMTP_PASS
        if host and user and pw:
            return host, port, user, pw
    return DEFAULT_SMTP_HOST, DEFAULT_SMTP_PORT, DEFAULT_SMTP_USER, DEFAULT_SMTP_PASS


def _tracking_secret(client_config: dict | None = None) -> str:
    if client_config:
        pw = client_config.get("smtpPass") or ""
        if pw:
            return pw
    return os.getenv("NURTURE_UNSUBSCRIBE_SECRET") or os.getenv("NURTURE_SMTP_PASS", "")


def _tracking_base_url(client_config: dict | None = None) -> str:
    if client_config:
        track = (client_config.get("trackBaseUrl") or "").strip()
        if track:
            return track.rstrip("/")
    explicit = os.getenv("NURTURE_TRACK_BASE_URL", "").strip()
    if explicit:
        return explicit
    raw = os.getenv("NURTURE_UNSUBSCRIBE_BASE_URL", "").strip()
    if not raw:
        return ""
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return raw


def signed_tracking_url(category_url: str, lead_id: int | None = None, slug: str = "", day_number: int | None = None, client_config: dict | None = None) -> str:
    if not category_url or not lead_id:
        return category_url
    base_url = _tracking_base_url(client_config).strip().rstrip("/")
    secret = _tracking_secret(client_config)
    if not base_url or not secret:
        return category_url
    day = "" if day_number is None else str(day_number)
    payload = f"{lead_id}|{slug}|{day}|{category_url}"
    token = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    query = urllib.parse.urlencode({"lead_id": lead_id, "slug": slug, "day": day, "url": category_url, "token": token})
    return f"{base_url}/api/click?{query}"


def _parse_email_body(body_text: str) -> str:
    """Convierte texto plano a HTML semantico con checkboxes, listas y titulos."""
    lines = body_text.splitlines()
    html_parts: list[str] = []
    in_list: str | None = None
    list_items: list[str] = []
    in_checklist: bool = False
    checklist_items: list[str] = []

    def flush_list():
        nonlocal in_list, list_items, in_checklist, checklist_items
        if in_checklist:
            items_html = "\n".join(checklist_items)
            html_parts.append(
                f'<div style="background: #fef6f1; border-left: 4px solid #EB6517; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0;">'
                f'<ul style="list-style: none; padding: 0; margin: 0;">{items_html}</ul></div>'
            )
            in_checklist = False
            checklist_items = []
        elif in_list == "ul" and list_items:
            items_html = "\n".join(list_items)
            html_parts.append(f'<ul style="padding-left: 20px; margin: 12px 0;">{items_html}</ul>')
            list_items = []
        elif in_list == "ol" and list_items:
            items_html = "\n".join(list_items)
            html_parts.append(f'<ol style="padding-left: 20px; margin: 12px 0;">{items_html}</ol>')
            list_items = []
        in_list = None

    for line in lines:
        stripped = line.strip()

        if stripped == "---":
            flush_list()
            html_parts.append('<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">')
            continue

        if stripped.startswith("[ ] ") or stripped.startswith("[x] "):
            checked = stripped.startswith("[x] ")
            text = stripped[4:]
            checkbox_icon = "&#x2611;" if checked else "&#x2610;"
            if not in_checklist:
                flush_list()
                in_checklist = True
            checklist_items.append(
                f'<li style="padding: 6px 0; font-size: 15px; line-height: 1.5;">'
                f'<span style="color: #EB6517; font-size: 18px; margin-right: 8px; display: inline-block; width: 20px;">{checkbox_icon}</span>'
                f'<span style="color: #333;">{text}</span></li>'
            )
            continue

        if stripped.startswith("- ") or stripped.startswith("* "):
            text = stripped[2:]
            if in_list != "ul":
                flush_list()
                in_list = "ul"
            list_items.append(f'<li style="padding: 4px 0; color: #333;">{text}</li>')
            continue

        if re.match(r"^\d+\.\s", stripped):
            text = re.sub(r"^\d+\.\s", "", stripped)
            if in_list != "ol":
                flush_list()
                in_list = "ol"
            list_items.append(f'<li style="padding: 4px 0; color: #333;">{text}</li>')
            continue

        if in_list or in_checklist:
            flush_list()

        if not stripped:
            html_parts.append("<br>")
            continue

        # Detectar titulos: lineas cortas sin puntuacion final que parecen titulos
        # o lineas que vienen justo despues de un separador
        is_title = (
            len(stripped) < 80
            and not stripped.endswith((".", ",", "!", "?", ":", ";"))
            and stripped[0].isupper()
            and not re.match(r"^(Si |Para |Tambien |La idea |Si queres)", stripped, re.IGNORECASE)
        )

        if is_title and html_parts and html_parts[-1].startswith("<hr"):
            html_parts.append(
                f'<h2 style="font-size: 20px; color: #1D1D1B; margin: 20px 0 12px 0; font-weight: 600;">{stripped}</h2>'
            )
        elif is_title and not html_parts:
            html_parts.append(
                f'<h2 style="font-size: 20px; color: #1D1D1B; margin: 20px 0 12px 0; font-weight: 600;">{stripped}</h2>'
            )
        else:
            html_parts.append(f'<p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #333;">{stripped}</p>')

    flush_list()
    return "\n".join(html_parts)


def _build_cta_html(category_url: str, category_name: str, client_name: str = "PC MIDI Center") -> str:
    if not category_url:
        return ""
    display_name = category_name or "Ver opciones"
    return f'''
<div style="margin: 28px 0; text-align: center;">
  <div style="background: linear-gradient(135deg, #fef6f1 0%, #fff 100%); border: 2px solid #EB6517; border-radius: 12px; padding: 24px;">
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #1D1D1B; font-weight: 600;">¿Querés ver modelos concretos?</p>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #666;">Mirá los {display_name} que tenemos en {client_name} y compará según lo que estés buscando.</p>
    <a href="{category_url}" style="display: inline-block; background: linear-gradient(135deg, #EB6517 0%, #d45a14 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(235,101,23,0.3);">Ver {display_name}</a>
  </div>
</div>'''


def build_html_body(
    body_text: str,
    unsubscribe_url: str = "",
    category_url: str = "",
    category_name: str = "",
    client_config: dict | None = None,
) -> str:
    """Genera el cuerpo HTML del email parametrizado por cliente."""
    cfg = client_config or {}
    from_name_short = (cfg.get("fromName") or DEFAULT_FROM_NAME).split(" ")[0]
    lab_name = cfg.get("labName") or DEFAULT_LAB_NAME
    store_url = cfg.get("storeUrl") or DEFAULT_STORE_URL
    from_email = cfg.get("fromEmail") or DEFAULT_FROM_EMAIL
    client_name = cfg.get("name") or "PC MIDI Center"

    unsubscribe_html = ""
    if unsubscribe_url:
        unsubscribe_html = f'''<div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee;">
<span style="font-size: 12px; color: #888;">
Si ya no querés recibir estos correos, podés
<a href="{unsubscribe_url}" style="color: #EB6517; text-decoration: underline;">darte de baja acá</a>.
</span></div>'''

    content_html = _parse_email_body(body_text)
    cta_html = _build_cta_html(category_url, category_name, client_name)

    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f0f0f0; margin: 0; padding: 0;">
<table role="presentation" style="width: 100%; border-collapse: collapse;">
<tr><td align="center" style="padding: 30px 10px;">
<table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden;">
<tr><td style="background: linear-gradient(135deg, #1D1D1B 0%, #2d2d2b 100%); padding: 28px 32px; text-align: center;">
<div style="font-size: 22px; font-weight: 700; color: #F4F1EA; letter-spacing: 2px;">{lab_name.upper()}</div>
</td></tr>
<tr><td style="padding: 32px;">
{content_html}
{cta_html}
</td></tr>
<tr><td style="background-color: #fafafa; padding: 24px 32px; border-top: 1px solid #eee;">
<p style="font-size: 13px; color: #666; margin: 0; line-height: 1.6;">
<strong style="color: #1D1D1B;">{from_name_short}</strong><br>
<span style="color: #888;">{lab_name}</span><br>
<a href="{store_url}" style="color: #EB6517; text-decoration: none;">{store_url.replace("https://", "").replace("http://", "")}</a><br>
<a href="mailto:{from_email}" style="color: #EB6517; text-decoration: none;">{from_email}</a>
</p>
{unsubscribe_html}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def send_email(
    to_email: str,
    subject: str,
    body_text: str,
    from_name: str = DEFAULT_FROM_NAME,
    from_email: str = DEFAULT_FROM_EMAIL,
    dry_run: bool = False,
    unsubscribe_url: str = "",
    category_url: str = "",
    category_name: str = "",
    lead_id: int | None = None,
    slug: str = "",
    day_number: int | None = None,
    client_config: dict | None = None,
) -> tuple[bool, str]:
    """
    Envia un email via SMTP.

    client_config (opcional): dict con smtpHost/Port/User/Pass, fromName, fromEmail,
    labName, storeUrl, trackBaseUrl.  Si se pasa, tiene prioridad sobre los args
    from_name/from_email y sobre las variables de entorno.
    """
    # Resolver remitente y SMTP desde client_config si está disponible
    if client_config:
        from_name = client_config.get("fromName") or from_name
        from_email = client_config.get("fromEmail") or from_email

    smtp_host, smtp_port, smtp_user, smtp_pass = _smtp_cfg(client_config)

    if dry_run:
        print(f"  [DRY-RUN] Email a {to_email}: '{subject}' (from {from_email}, smtp {smtp_host or '(env)'})")
        return True, ""

    if not all([smtp_host, smtp_user, smtp_pass]):
        return False, "SMTP no configurado"

    try:
        tracked_category_url = signed_tracking_url(
            category_url, lead_id=lead_id, slug=slug, day_number=day_number, client_config=client_config
        )
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email

        if unsubscribe_url:
            body_text = body_text.rstrip() + f"\n\nSi ya no querés recibir estos correos, podés darte de baja acá: {unsubscribe_url}"

        msg.attach(MIMEText(body_text, "plain", "utf-8"))
        msg.attach(MIMEText(build_html_body(
            body_text,
            unsubscribe_url=unsubscribe_url,
            category_url=tracked_category_url,
            category_name=category_name,
            client_config=client_config,
        ), "html", "utf-8"))

        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
                server.login(smtp_user, smtp_pass)
                server.sendmail(from_email, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(from_email, [to_email], msg.as_string())

        return True, ""
    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    # Test rapido
    result = send_email(
        "lab@pcmidicenter.com",
        "Test Mailer PC MIDI Labs",
        "Este es un email de prueba desde el modulo mailer.py."
    )
    print(f"Resultado: {result}")
