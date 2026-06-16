import base64
import json
import os
import socket
import time
from urllib.parse import urlparse

from _log import get_logger

_log = get_logger("browser-cdp")


class CDPClient:
    def __init__(self, ws_url: str, timeout: float = 20.0):
        self.ws_url = ws_url
        self.timeout = timeout
        self.sock: socket.socket | None = None
        self.next_id = 1

    def __enter__(self) -> "CDPClient":
        self.connect()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self.sock:
            self.sock.close()

    def connect(self) -> None:
        parsed = urlparse(self.ws_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 80
        path = parsed.path or "/"
        if parsed.query:
            path += f"?{parsed.query}"
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock = socket.create_connection((host, port), timeout=self.timeout)
        self.sock.settimeout(self.timeout)
        self.sock.sendall(request.encode("ascii"))
        response = self.sock.recv(4096)
        if b" 101 " not in response.split(b"\r\n", 1)[0]:
            raise RuntimeError(f"No se pudo conectar al WebSocket CDP: {response[:200]!r}")

    def send(self, method: str, params: dict | None = None) -> dict:
        message_id = self.next_id
        self.next_id += 1
        self._send_text(json.dumps({"id": message_id, "method": method, "params": params or {}}, separators=(",", ":")))
        # Timeout por request para no quedar en bucle infinito si la respuesta nunca llega.
        # Acepta mensajes fuera de orden: los acumula hasta encontrar el id esperado.
        deadline = time.time() + self.timeout
        pending: list[dict] = []
        while time.time() < deadline:
            remaining = deadline - time.time()
            if remaining <= 0:
                break
            if self.sock:
                self.sock.settimeout(min(remaining, self.timeout))
            try:
                message = json.loads(self._recv_text())
            except OSError as exc:
                raise RuntimeError(f"CDP {method} error de socket: {exc}") from exc
            if message.get("id") == message_id:
                if "error" in message:
                    raise RuntimeError(f"CDP {method} fallo: {message['error']}")
                return message.get("result", {})
            if "id" in message:
                pending.append(message)
        if pending:
            _log.debug("cdp_send mensajes descartados", method=method, count=len(pending))
        raise RuntimeError(f"CDP {method} timeout ({self.timeout}s) sin respuesta para id={message_id}")

    def _send_text(self, text: str) -> None:
        if not self.sock:
            raise RuntimeError("CDP no conectado")
        payload = text.encode("utf-8")
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.extend([0x80 | 126, (length >> 8) & 255, length & 255])
        else:
            header.append(0x80 | 127)
            header.extend(length.to_bytes(8, "big"))
        mask = os.urandom(4)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.sock.sendall(bytes(header) + mask + masked)

    def _recv_exact(self, size: int) -> bytes:
        if not self.sock:
            raise RuntimeError("CDP no conectado")
        chunks = []
        remaining = size
        while remaining:
            chunk = self.sock.recv(remaining)
            if not chunk:
                raise RuntimeError("WebSocket cerrado")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def _recv_text(self) -> str:
        while True:
            first, second = self._recv_exact(2)
            opcode = first & 0x0F
            masked = bool(second & 0x80)
            length = second & 0x7F
            if length == 126:
                length = int.from_bytes(self._recv_exact(2), "big")
            elif length == 127:
                length = int.from_bytes(self._recv_exact(8), "big")
            mask = self._recv_exact(4) if masked else b""
            payload = self._recv_exact(length) if length else b""
            if masked:
                payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
            if opcode == 1:
                return payload.decode("utf-8")
            if opcode == 8:
                raise RuntimeError("WebSocket cerrado por Chrome")


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def evaluate(client: CDPClient, expression: str, await_promise: bool = False):
    result = client.send("Runtime.evaluate", {"expression": expression, "awaitPromise": await_promise, "returnByValue": True})
    if "exceptionDetails" in result:
        raise RuntimeError(result["exceptionDetails"].get("text") or "Error JS")
    return result.get("result", {}).get("value")


def action_fill_first(client: CDPClient, selectors: list[str], value: str) -> dict:
    expression = f"""
    (() => {{
      const selectors = {json.dumps(selectors)};
      for (const selector of selectors) {{
        const el = document.querySelector(selector);
        if (!el) continue;
        el.scrollIntoView({{block:'center', inline:'center'}});
        el.focus();
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
        document.execCommand('insertText', false, {js_string(value)});
        el.dispatchEvent(new Event('change', {{bubbles:true}}));
        return {{ok:true, selector}};
      }}
      return {{ok:false, error:'selector no encontrado', selectors}};
    }})()
    """
    return evaluate(client, expression) or {"ok": False, "error": "sin resultado"}


def action_click_first(client: CDPClient, selectors: list[str]) -> dict:
    expression = f"""
    (() => {{
      const selectors = {json.dumps(selectors)};
      for (const selector of selectors) {{
        const items = Array.from(document.querySelectorAll(selector)).filter((el) => {{
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        }});
        const el = items[items.length - 1];
        if (!el) continue;
        el.scrollIntoView({{block:'center', inline:'center'}});
        el.click();
        return {{ok:true, selector}};
      }}
      return {{ok:false, error:'selector no encontrado', selectors}};
    }})()
    """
    return evaluate(client, expression) or {"ok": False, "error": "sin resultado"}


def page_flags(client: CDPClient) -> dict:
    expression = """
    (() => {
      const text = document.body.innerText.toLowerCase();
      return {
        url: location.href,
        title: document.title,
        hasPassword: !!document.querySelector('input[type="password"]'),
        likelyCheckpoint: /captcha|verification|verificacion|verificación|two-factor|2-step|security code|codigo|código|checkpoint/.test(text),
      };
    })()
    """
    return evaluate(client, expression) or {}
